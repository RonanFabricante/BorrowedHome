-- Fix host "Accept booking" RLS issues
-- - Allow hosts to UPDATE bookings for listings they own (without allowing ownership changes)
-- - Allow hosts to INSERT payments for their listings when moving to PAYMENT_PENDING
-- - Tighten accept/decline RPCs to rely on auth.uid() (prevents spoofed host_id param)

-- Ensure RLS is enabled (idempotent)
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Prevent changing booking identity fields after creation
CREATE OR REPLACE FUNCTION public.prevent_booking_identity_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.listing_id IS DISTINCT FROM OLD.listing_id THEN
    RAISE EXCEPTION 'Cannot change listing_id on booking';
  END IF;

  IF NEW.guest_id IS DISTINCT FROM OLD.guest_id THEN
    RAISE EXCEPTION 'Cannot change guest_id on booking';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_booking_identity_change ON public.bookings;
CREATE TRIGGER trg_prevent_booking_identity_change
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_booking_identity_change();

-- Host UPDATE policy for bookings they own (ownership determined via listings.host_id)
DROP POLICY IF EXISTS "Hosts can update bookings for their listings" ON public.bookings;
CREATE POLICY "Hosts can update bookings for their listings"
  ON public.bookings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = bookings.listing_id
        AND l.host_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = bookings.listing_id
        AND l.host_id = auth.uid()
    )
  );

-- Host INSERT policy for payments created during acceptance (status must be pending)
DROP POLICY IF EXISTS "Hosts can insert payments for their listings" ON public.payments;
CREATE POLICY "Hosts can insert payments for their listings"
  ON public.payments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    payments.status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM public.bookings b
      JOIN public.listings l ON l.id = b.listing_id
      WHERE b.id = payments.booking_id
        AND l.host_id = auth.uid()
        AND b.status = 'PAYMENT_PENDING'
    )
  );

-- Tighten accept_booking to require p_host_id matches auth.uid()
CREATE OR REPLACE FUNCTION public.accept_booking(
  p_booking_id uuid,
  p_host_id uuid
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_listing_id uuid;
  v_host_id uuid;
  v_payment_deadline timestamptz;
BEGIN
  IF auth.uid() IS NULL OR p_host_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Get booking and validate it exists and is REQUESTED or PENDING (for backward compatibility)
  SELECT b.* INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id
    AND b.status IN ('REQUESTED', 'PENDING')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or not in REQUESTED/PENDING status';
  END IF;

  -- Get listing host_id and id
  SELECT l.host_id, l.id INTO v_host_id, v_listing_id
  FROM public.listings l
  WHERE l.id = v_booking.listing_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;

  -- Validate caller is the host
  IF v_host_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the listing host can accept bookings';
  END IF;

  -- Re-validate minimum lead time (4 hours from now)
  IF NOT public.validate_minimum_lead_time(v_booking.start_at) THEN
    RAISE EXCEPTION 'Bookings must start at least 4 hours from now. The requested start time is too soon.';
  END IF;

  -- Re-check availability (no conflicts with PAYMENT_PENDING or CONFIRMED)
  IF public.check_booking_overlap(v_listing_id, v_booking.start_at, v_booking.end_at, p_booking_id) THEN
    RAISE EXCEPTION 'This time slot is no longer available (conflicts with an existing booking)';
  END IF;

  -- Set payment deadline (4 hours from now)
  v_payment_deadline := NOW() + INTERVAL '4 hours';

  -- Update status to PAYMENT_PENDING and set timestamps
  UPDATE public.bookings
  SET
    status = 'PAYMENT_PENDING',
    accepted_at = NOW(),
    host_responded_at = NOW(),
    payment_deadline_at = v_payment_deadline
  WHERE id = p_booking_id;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  RETURN v_booking;
END;
$$;

-- Tighten decline_booking to require p_host_id matches auth.uid()
CREATE OR REPLACE FUNCTION public.decline_booking(
  p_booking_id uuid,
  p_host_id uuid
)
RETURNS public.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
  v_host_id uuid;
BEGIN
  IF auth.uid() IS NULL OR p_host_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Get booking and validate it exists and is REQUESTED or PENDING
  SELECT b.* INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id
    AND b.status IN ('REQUESTED', 'PENDING')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or not in REQUESTED/PENDING status';
  END IF;

  -- Get listing host_id
  SELECT l.host_id INTO v_host_id
  FROM public.listings l
  WHERE l.id = v_booking.listing_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;

  -- Validate caller is the host
  IF v_host_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the listing host can decline bookings';
  END IF;

  UPDATE public.bookings
  SET
    status = 'DECLINED',
    host_responded_at = NOW()
  WHERE id = p_booking_id;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  RETURN v_booking;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_booking(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_booking(uuid, uuid) TO authenticated;

