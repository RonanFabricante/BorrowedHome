-- 034: Privilege hardening — lock admin/suspension/Stripe fields from client writes;
--       suspend checks in booking RPCs; report dedupe; listing-photos storage RLS.

-- ---------------------------------------------------------------------------
-- 1. profiles: clients cannot set is_superadmin or is_suspended
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_profile_privilege_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role / postgres / SECURITY DEFINER callers may change these.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_superadmin, false) OR COALESCE(NEW.is_suspended, false) THEN
      RAISE EXCEPTION 'Cannot set privileged profile flags on insert';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.is_superadmin IS DISTINCT FROM OLD.is_superadmin THEN
    RAISE EXCEPTION 'is_superadmin can only be changed by platform operators';
  END IF;

  IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended THEN
    RAISE EXCEPTION 'is_suspended can only be changed by platform operators';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_profile_privilege_columns ON public.profiles;
CREATE TRIGGER trg_enforce_profile_privilege_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_privilege_columns();

-- ---------------------------------------------------------------------------
-- 2. hosts: clients cannot forge Stripe Connect fields
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_host_stripe_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.stripe_account_id IS NOT NULL
       OR COALESCE(NEW.stripe_charges_enabled, false)
       OR COALESCE(NEW.stripe_payouts_enabled, false)
       OR (
         NEW.stripe_onboarding_status IS NOT NULL
         AND NEW.stripe_onboarding_status IS DISTINCT FROM 'not_started'
       )
       OR NEW.stripe_requirements_due IS NOT NULL THEN
      RAISE EXCEPTION 'Stripe Connect fields can only be set by the platform';
    END IF;
    -- Force safe defaults for client-created host rows
    NEW.stripe_account_id := NULL;
    NEW.stripe_charges_enabled := false;
    NEW.stripe_payouts_enabled := false;
    NEW.stripe_onboarding_status := 'not_started';
    NEW.stripe_requirements_due := NULL;
    RETURN NEW;
  END IF;

  IF NEW.stripe_account_id IS DISTINCT FROM OLD.stripe_account_id
     OR NEW.stripe_charges_enabled IS DISTINCT FROM OLD.stripe_charges_enabled
     OR NEW.stripe_payouts_enabled IS DISTINCT FROM OLD.stripe_payouts_enabled
     OR NEW.stripe_onboarding_status IS DISTINCT FROM OLD.stripe_onboarding_status
     OR NEW.stripe_requirements_due IS DISTINCT FROM OLD.stripe_requirements_due THEN
    RAISE EXCEPTION 'Stripe Connect fields can only be updated by the platform';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_host_stripe_columns ON public.hosts;
CREATE TRIGGER trg_enforce_host_stripe_columns
  BEFORE INSERT OR UPDATE ON public.hosts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_host_stripe_columns();

-- ---------------------------------------------------------------------------
-- 3. listings: suspended hosts cannot publish
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_listing_publish_not_suspended()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_suspended boolean;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.published, false) = true
     AND (TG_OP = 'INSERT' OR OLD.published IS DISTINCT FROM true) THEN
    SELECT COALESCE(p.is_suspended, false)
      INTO v_suspended
    FROM public.profiles p
    WHERE p.id = NEW.host_id;

    IF COALESCE(v_suspended, false) THEN
      RAISE EXCEPTION 'Suspended accounts cannot publish listings';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_listing_publish_not_suspended ON public.listings;
CREATE TRIGGER trg_enforce_listing_publish_not_suspended
  BEFORE INSERT OR UPDATE ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_listing_publish_not_suspended();

-- ---------------------------------------------------------------------------
-- 4. Shared suspension helper + booking RPC gates
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_profile_not_suspended(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_suspended boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT COALESCE(is_suspended, false)
    INTO v_suspended
  FROM public.profiles
  WHERE id = p_user_id;

  IF COALESCE(v_suspended, false) THEN
    RAISE EXCEPTION 'ACCOUNT_SUSPENDED';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_profile_not_suspended(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_profile_not_suspended(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_profile_not_suspended(uuid) TO service_role;

-- Patch create_booking_request: suspension check after auth
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

  PERFORM public.assert_profile_not_suspended(v_guest_id);

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

  PERFORM public.assert_profile_not_suspended(auth.uid());

  SELECT b.* INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id
    AND b.status IN ('REQUESTED', 'PENDING')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or not in REQUESTED/PENDING status';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('listing_booking:' || v_booking.listing_id::text));

  SELECT l.host_id, l.id INTO v_host_id, v_listing_id
  FROM public.listings l
  WHERE l.id = v_booking.listing_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;

  IF v_host_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the listing host can accept bookings';
  END IF;

  IF NOT public.validate_minimum_lead_time(v_booking.start_at) THEN
    RAISE EXCEPTION 'Bookings must start at least 4 hours from now. The requested start time is too soon.';
  END IF;

  IF public.check_booking_overlap(v_listing_id, v_booking.start_at, v_booking.end_at, p_booking_id) THEN
    RAISE EXCEPTION 'This time slot is no longer available (conflicts with an existing booking)';
  END IF;

  v_payment_deadline := NOW() + INTERVAL '4 hours';

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
-- 5. One open report per reporter per listing
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_listing_reports_one_open_per_reporter
  ON public.listing_reports (reporter_id, listing_id)
  WHERE status = 'open' AND reporter_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 6. Storage RLS for listing-photos (path: {listing_id}/filename)
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('listing-photos', 'listing-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read listing photos" ON storage.objects;
CREATE POLICY "Public read listing photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'listing-photos');

DROP POLICY IF EXISTS "Hosts upload own listing photos" ON storage.objects;
CREATE POLICY "Hosts upload own listing photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'listing-photos'
    AND EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id::text = (storage.foldername(name))[1]
        AND l.host_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Hosts update own listing photos" ON storage.objects;
CREATE POLICY "Hosts update own listing photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'listing-photos'
    AND EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id::text = (storage.foldername(name))[1]
        AND l.host_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Hosts delete own listing photos" ON storage.objects;
CREATE POLICY "Hosts delete own listing photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'listing-photos'
    AND EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id::text = (storage.foldername(name))[1]
        AND l.host_id = auth.uid()
    )
  );
