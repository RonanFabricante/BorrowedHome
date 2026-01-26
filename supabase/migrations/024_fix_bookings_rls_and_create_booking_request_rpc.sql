-- Fix bookings INSERT RLS (REQUESTED) and add secure booking creation RPC
-- - Guests can create REQUESTED bookings for published listings they don't own
-- - Server/clients should call create_booking_request() instead of direct INSERT

-- Ensure RLS is enabled (idempotent)
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Replace outdated insert policy (previously required status='PENDING')
DROP POLICY IF EXISTS "Guests can create bookings (PENDING only)" ON public.bookings;
DROP POLICY IF EXISTS "Guests can create booking requests" ON public.bookings;

CREATE POLICY "Guests can create booking requests"
  ON public.bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Must be the authenticated guest
    guest_id = auth.uid()

    -- Guests may only create requests (support legacy 'PENDING' for older clients)
    AND status IN ('REQUESTED', 'PENDING')

    -- Listing must exist, be published, and not be owned by the guest.
    -- Also enforce max_guests at insert time.
    AND EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = bookings.listing_id
        AND l.published = true
        AND l.host_id <> auth.uid()
        AND bookings.guests_count >= 1
        AND bookings.guests_count <= l.max_guests
    )
  );

-- Secure RPC: derive listing/host, validate rules, compute pricing, insert booking
CREATE OR REPLACE FUNCTION public.create_booking_request(
  p_listing_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_guests_count integer
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing record;
  v_is_available boolean;
  v_duration_hours numeric;
  v_base_price integer;
  v_platform_fee integer;
  v_total_amount integer;
  v_booking public.bookings;
  v_guest_id uuid;
  v_start_local timestamp;
  v_end_local timestamp;
BEGIN
  v_guest_id := auth.uid();

  IF v_guest_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_listing_id IS NULL OR p_start_at IS NULL OR p_end_at IS NULL OR p_guests_count IS NULL THEN
    RAISE EXCEPTION 'Missing required fields';
  END IF;

  -- Lock listing row for consistency and ensure bookable
  SELECT
    l.*,
    l.host_id AS listing_host_id
  INTO v_listing
  FROM public.listings l
  WHERE l.id = p_listing_id
    AND l.published = true
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;

  IF v_listing.listing_host_id = v_guest_id THEN
    RAISE EXCEPTION 'Cannot book your own listing';
  END IF;

  IF p_guests_count < 1 OR p_guests_count > v_listing.max_guests THEN
    RAISE EXCEPTION 'Invalid guest count';
  END IF;

  -- Business rules (AU local time); matches app constraints
  v_start_local := (p_start_at AT TIME ZONE 'Australia/Sydney');
  v_end_local := (p_end_at AT TIME ZONE 'Australia/Sydney');

  -- Day-use only: same local calendar date
  IF (v_start_local::date <> v_end_local::date) THEN
    RAISE EXCEPTION 'Overnight bookings are not permitted';
  END IF;

  -- Minimum duration
  IF (p_end_at <= p_start_at) OR (p_end_at - p_start_at < INTERVAL '2 hours') THEN
    RAISE EXCEPTION 'Bookings must be at least 2 hours';
  END IF;

  -- Start >= 7:00 AM, End <= 9:00 PM (local)
  IF (v_start_local::time < TIME '07:00:00') THEN
    RAISE EXCEPTION 'Bookings must start at or after 7:00 AM';
  END IF;

  IF (v_end_local::time > TIME '21:00:00') THEN
    RAISE EXCEPTION 'Bookings must end by 9:00 PM';
  END IF;

  -- Lead time: at least 4 hours in advance
  IF (p_start_at < NOW() + INTERVAL '4 hours') THEN
    RAISE EXCEPTION 'Bookings must be requested at least 4 hours in advance';
  END IF;

  -- Availability (PAYMENT_PENDING + CONFIRMED lock inventory)
  SELECT public.is_time_slot_available(
    p_listing_id := p_listing_id,
    p_start_at := p_start_at,
    p_end_at := p_end_at,
    p_booking_id := NULL
  ) INTO v_is_available;

  IF v_is_available IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'TIME_SLOT_UNAVAILABLE';
  END IF;

  -- Pricing (mirror app logic)
  v_duration_hours := EXTRACT(EPOCH FROM (p_end_at - p_start_at)) / 3600.0;

  IF v_duration_hours >= 8 THEN
    v_base_price := v_listing.full_day_rate;
  ELSIF v_duration_hours >= 4 THEN
    v_base_price := v_listing.half_day_rate;
  ELSE
    v_base_price := ROUND(v_listing.hourly_rate * v_duration_hours);
  END IF;

  v_platform_fee := ROUND(v_base_price * 0.10);
  v_total_amount := v_base_price + v_platform_fee;

  INSERT INTO public.bookings (
    listing_id,
    guest_id,
    start_at,
    end_at,
    status,
    requested_at,
    guests_count,
    total_amount,
    platform_fee_amount,
    deposit_amount
  )
  VALUES (
    p_listing_id,
    v_guest_id,
    p_start_at,
    p_end_at,
    'REQUESTED',
    NOW(),
    p_guests_count,
    v_total_amount,
    v_platform_fee,
    COALESCE(v_listing.deposit_amount, 0)
  )
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_booking_request(uuid, timestamptz, timestamptz, integer) TO authenticated;

