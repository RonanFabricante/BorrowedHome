-- Migration 027: Security hardening and booking/payment integrity fixes
--
-- Fixes:
-- 1. One payment row per booking (prevents duplicate PaymentIntents)
-- 2. Guest acknowledgements persisted by create_booking_request (the
--    confirmed_bookings_require_acknowledgements CHECK previously blocked
--    every CONFIRMED transition because acks were never written)
-- 3. Advisory lock in create_booking_request/accept_booking to prevent
--    concurrent double-booking of the same listing
-- 4. Trigger guards so clients cannot set arbitrary booking statuses
--    (e.g. self-confirm without payment) or tamper with payment amounts
-- 5. get_listing_address requires the caller to be the user it asks about
-- 6. hosts SELECT no longer exposes every host's Stripe account to all users
-- 7. log_booking_event restricted to parties of the booking
-- 8. create_notification no longer executable by regular users
-- 9. RLS enabled on notification_log

-- ---------------------------------------------------------------------------
-- 1. One payment row per booking
-- ---------------------------------------------------------------------------

-- Remove duplicate 'pending' rows (keep the most recent per booking).
-- Non-pending duplicates are not deleted automatically; if any exist the
-- index creation below will fail and the rows need manual review.
DELETE FROM public.payments p
USING public.payments newer
WHERE p.booking_id = newer.booking_id
  AND p.id <> newer.id
  AND p.status = 'pending'
  AND (newer.created_at > p.created_at
       OR (newer.created_at = p.created_at AND newer.id > p.id));

CREATE UNIQUE INDEX IF NOT EXISTS uniq_payments_booking_id
  ON public.payments(booking_id);

-- ---------------------------------------------------------------------------
-- 2 + 3. create_booking_request: persist acknowledgements + advisory lock
-- ---------------------------------------------------------------------------

-- Backfill acks for in-flight bookings created before acks were persisted
-- (the booking dialog always required them client-side).
UPDATE public.bookings
SET guest_ack_toilet_access = true,
    guest_ack_consumables_policy = true,
    ack_version = COALESCE(ack_version, '2026-01-08')
WHERE status IN ('REQUESTED', 'PENDING', 'PAYMENT_PENDING')
  AND (guest_ack_toilet_access = false OR guest_ack_consumables_policy = false);

DROP FUNCTION IF EXISTS public.create_booking_request(uuid, timestamptz, timestamptz, integer);

CREATE FUNCTION public.create_booking_request(
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

  -- Serialize booking creation/acceptance per listing to avoid races
  PERFORM pg_advisory_xact_lock(hashtext('listing_booking:' || p_listing_id::text));

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
    deposit_amount,
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
    p_guest_ack_toilet_access,
    p_guest_ack_consumables_policy,
    '2026-01-08'
  )
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_booking_request(uuid, timestamptz, timestamptz, integer, boolean, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. accept_booking: advisory lock to prevent concurrent double-accepts
-- ---------------------------------------------------------------------------

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

  -- Serialize accepts per listing: two concurrent accepts of overlapping
  -- requests would otherwise both pass the overlap check and double-book.
  PERFORM pg_advisory_xact_lock(hashtext('listing_booking:' || v_booking.listing_id::text));

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

GRANT EXECUTE ON FUNCTION public.accept_booking(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4a. Guard client-side booking updates
-- ---------------------------------------------------------------------------
-- The guest/host UPDATE RLS policies allow row access but not column/status
-- control, so a client could previously set status='CONFIRMED' without
-- paying, change prices, or move times. This trigger restricts what
-- non-privileged sessions may change. SECURITY DEFINER RPCs and the service
-- role are unaffected (they run as the function owner / service_role).

CREATE OR REPLACE FUNCTION public.enforce_booking_update_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Privileged contexts (service role, SECURITY DEFINER functions owned by
  -- postgres) bypass these client-facing restrictions.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- Immutable fields for clients
  IF NEW.start_at IS DISTINCT FROM OLD.start_at
     OR NEW.end_at IS DISTINCT FROM OLD.end_at
     OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
     OR NEW.platform_fee_amount IS DISTINCT FROM OLD.platform_fee_amount
     OR NEW.deposit_amount IS DISTINCT FROM OLD.deposit_amount
     OR NEW.payment_deadline_at IS DISTINCT FROM OLD.payment_deadline_at THEN
    RAISE EXCEPTION 'Booking times, amounts and payment deadline cannot be modified directly';
  END IF;

  -- Status transitions allowed directly from clients:
  --   * unchanged
  --   * -> CANCELLED (cancel flow)
  --   * CONFIRMED -> COMPLETED once the booking has ended (auto-complete)
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'CANCELLED' THEN
      NULL; -- allowed
    ELSIF OLD.status = 'CONFIRMED' AND NEW.status = 'COMPLETED' AND OLD.end_at < NOW() THEN
      NULL; -- allowed
    ELSE
      RAISE EXCEPTION 'Booking status transition % -> % is not allowed directly; use the appropriate API', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_booking_update_rules ON public.bookings;
CREATE TRIGGER trg_enforce_booking_update_rules
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_booking_update_rules();

-- Direct INSERTs from clients previously bypassed all business rules in
-- create_booking_request. Force clients through the RPC.
DROP POLICY IF EXISTS "Guests can create booking requests" ON public.bookings;
DROP POLICY IF EXISTS "Guests can create bookings (PENDING only)" ON public.bookings;

-- ---------------------------------------------------------------------------
-- 4b. Guard client-side payment updates
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_payment_update_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_guest boolean;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- Immutable fields for clients
  IF NEW.booking_id IS DISTINCT FROM OLD.booking_id
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.deposit_amount IS DISTINCT FROM OLD.deposit_amount
     OR NEW.stripe_payment_intent_id IS DISTINCT FROM OLD.stripe_payment_intent_id
     OR NEW.stripe_deposit_intent_id IS DISTINCT FROM OLD.stripe_deposit_intent_id THEN
    RAISE EXCEPTION 'Payment identity and amounts cannot be modified directly';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = NEW.booking_id AND b.guest_id = auth.uid()
    ) INTO v_is_guest;

    IF v_is_guest THEN
      -- Guests may only mark their pending payment as authorised
      IF NOT (OLD.status = 'pending' AND NEW.status = 'authorised') THEN
        RAISE EXCEPTION 'Payment status transition % -> % is not allowed', OLD.status, NEW.status;
      END IF;
    ELSE
      -- Hosts may only capture/release an authorised payment
      IF NOT (OLD.status = 'authorised' AND NEW.status IN ('captured', 'released')) THEN
        RAISE EXCEPTION 'Payment status transition % -> % is not allowed', OLD.status, NEW.status;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_payment_update_rules ON public.payments;
CREATE TRIGGER trg_enforce_payment_update_rules
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_payment_update_rules();

-- ---------------------------------------------------------------------------
-- 5. get_listing_address: callers can only ask about themselves
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_listing_address(
  p_listing_id UUID,
  p_user_id UUID
)
RETURNS TEXT AS $$
DECLARE
  v_address TEXT;
  v_host_id UUID;
BEGIN
  -- Authenticated callers may only query their own access; service-role /
  -- definer contexts (auth.uid() IS NULL) may query any user.
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN NULL;
  END IF;

  SELECT address_text, host_id INTO v_address, v_host_id
  FROM listings
  WHERE id = p_listing_id;

  IF v_host_id = p_user_id THEN
    RETURN v_address;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM bookings
    WHERE listing_id = p_listing_id
      AND guest_id = p_user_id
      AND status = 'CONFIRMED'
  ) THEN
    RETURN v_address;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 6. hosts SELECT: only self, or hosts you have a booking with
-- ---------------------------------------------------------------------------
-- Migration 014 let ANY authenticated user read every host row (including
-- Stripe account IDs and requirement details). Guests only need this when
-- paying for a booking with that host.

DROP POLICY IF EXISTS "Guests can view host Stripe status for payments" ON public.hosts;
CREATE POLICY "Guests can view host Stripe status for payments"
  ON public.hosts FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.bookings b
      JOIN public.listings l ON l.id = b.listing_id
      WHERE l.host_id = hosts.user_id
        AND b.guest_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 7. log_booking_event: only parties of the booking (or service contexts)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_booking_event(
  p_booking_id UUID,
  p_event_type TEXT,
  p_actor_id UUID DEFAULT NULL,
  p_payload JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  -- Authenticated callers may only log events for bookings they are part of
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.bookings b
      LEFT JOIN public.listings l ON l.id = b.listing_id
      WHERE b.id = p_booking_id
        AND (b.guest_id = auth.uid() OR l.host_id = auth.uid())
    ) THEN
      RAISE EXCEPTION 'Not authorized to log events for this booking';
    END IF;
  END IF;

  INSERT INTO booking_events (booking_id, event_type, actor_id, payload)
  VALUES (p_booking_id, p_event_type, p_actor_id, p_payload)
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 8. create_notification: not executable by regular users
-- ---------------------------------------------------------------------------
-- Only server-side code (service role) creates notifications; regular users
-- could previously spam arbitrary notifications to any user.

REVOKE EXECUTE ON FUNCTION public.create_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 9. notification_log: enable RLS (accessed via SECURITY DEFINER RPCs only)
-- ---------------------------------------------------------------------------

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
