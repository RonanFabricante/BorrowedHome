-- Migration 030: Property country + currency for global listings
-- Currency follows the listing address country; bookings snapshot currency at request time.

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'AU',
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'aud';

COMMENT ON COLUMN public.listings.country IS 'ISO 3166-1 alpha-2 country of the property (from address).';
COMMENT ON COLUMN public.listings.currency IS 'ISO 4217 lowercase currency for rates and Stripe charges.';

CREATE INDEX IF NOT EXISTS idx_listings_currency ON public.listings (currency);
CREATE INDEX IF NOT EXISTS idx_listings_country ON public.listings (country);

-- Optional explicit currency on payments (mirrors booking at charge time)
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'aud';

COMMENT ON COLUMN public.payments.currency IS 'ISO 4217 lowercase; snapshotted from booking at PaymentIntent creation.';

-- Backfill booking currency already defaults to aud; ensure existing rows are aud
UPDATE public.bookings
SET currency = 'aud'
WHERE currency IS NULL OR currency = '';

-- ---------------------------------------------------------------------------
-- create_booking_request: snapshot listing.currency onto the booking
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_booking_request(
  p_listing_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_guests_count integer,
  p_guest_ack_toilet_access boolean DEFAULT false,
  p_guest_ack_consumables_policy boolean DEFAULT false
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
  v_currency text;
BEGIN
  v_guest_id := auth.uid();

  IF v_guest_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_listing_id IS NULL OR p_start_at IS NULL OR p_end_at IS NULL OR p_guests_count IS NULL THEN
    RAISE EXCEPTION 'Missing required fields';
  END IF;

  IF NOT (p_guest_ack_toilet_access AND p_guest_ack_consumables_policy) THEN
    RAISE EXCEPTION 'Toilet access and consumables acknowledgements are required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('listing_booking:' || p_listing_id::text));

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

  v_currency := lower(COALESCE(NULLIF(trim(v_listing.currency), ''), 'aud'));

  -- Business rules (AU local time); matches app constraints
  v_start_local := (p_start_at AT TIME ZONE 'Australia/Sydney');
  v_end_local := (p_end_at AT TIME ZONE 'Australia/Sydney');

  IF (v_start_local::date <> v_end_local::date) THEN
    RAISE EXCEPTION 'Overnight bookings are not permitted';
  END IF;

  IF (p_end_at <= p_start_at) OR (p_end_at - p_start_at < INTERVAL '2 hours') THEN
    RAISE EXCEPTION 'Bookings must be at least 2 hours';
  END IF;

  IF (v_start_local::time < TIME '07:00:00') THEN
    RAISE EXCEPTION 'Bookings must start at or after 7:00 AM';
  END IF;

  IF (v_end_local::time > TIME '21:00:00') THEN
    RAISE EXCEPTION 'Bookings must end by 9:00 PM';
  END IF;

  IF (p_start_at < NOW() + INTERVAL '4 hours') THEN
    RAISE EXCEPTION 'Bookings must be requested at least 4 hours in advance';
  END IF;

  SELECT public.is_time_slot_available(
    p_listing_id := p_listing_id,
    p_start_at := p_start_at,
    p_end_at := p_end_at,
    p_booking_id := NULL
  ) INTO v_is_available;

  IF v_is_available IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'TIME_SLOT_UNAVAILABLE';
  END IF;

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
    deposit_amount,
    currency,
    guest_ack_toilet_access,
    guest_ack_consumables_policy,
    ack_version
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
    COALESCE(v_listing.deposit_amount, 0),
    v_currency,
    p_guest_ack_toilet_access,
    p_guest_ack_consumables_policy,
    '2026-01-08'
  )
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_booking_request(uuid, timestamptz, timestamptz, integer, boolean, boolean) TO authenticated;
