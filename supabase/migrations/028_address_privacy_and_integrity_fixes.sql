-- Migration 028: Address privacy + booking/payment integrity fixes
--
-- Fixes:
-- 1. Move address_text off public listings (RLS cannot hide columns)
-- 2. get_listing_address: CONFIRMED + COMPLETED; host + confirmed guest only
-- 3. Lock payment dispute/capture metadata from client updates
-- 4. Block direct client CANCELLED (must use cancel API)
-- 5. Revoke mark_past_bookings_completed from authenticated users
-- 6. Restrict log_notification to service contexts

-- ---------------------------------------------------------------------------
-- 1. Private listing addresses
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.listing_addresses (
  listing_id UUID PRIMARY KEY REFERENCES public.listings(id) ON DELETE CASCADE,
  address_text TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.listing_addresses (listing_id, address_text)
SELECT id, address_text
FROM public.listings
WHERE address_text IS NOT NULL
ON CONFLICT (listing_id) DO NOTHING;

-- Drop dependent policies/views are none; drop the public column.
ALTER TABLE public.listings DROP COLUMN IF EXISTS address_text;

ALTER TABLE public.listing_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Hosts can manage their listing addresses" ON public.listing_addresses;
CREATE POLICY "Hosts can manage their listing addresses"
  ON public.listing_addresses
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = listing_addresses.listing_id
        AND l.host_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = listing_addresses.listing_id
        AND l.host_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Guests can view address after confirmation" ON public.listing_addresses;
CREATE POLICY "Guests can view address after confirmation"
  ON public.listing_addresses
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.listing_id = listing_addresses.listing_id
        AND b.guest_id = auth.uid()
        AND b.status IN ('CONFIRMED', 'COMPLETED')
    )
  );

-- ---------------------------------------------------------------------------
-- 2. get_listing_address reads private table; allow COMPLETED
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
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN NULL;
  END IF;

  SELECT l.host_id, a.address_text
  INTO v_host_id, v_address
  FROM public.listings l
  LEFT JOIN public.listing_addresses a ON a.listing_id = l.id
  WHERE l.id = p_listing_id;

  IF v_host_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_host_id = p_user_id THEN
    RETURN v_address;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings
    WHERE listing_id = p_listing_id
      AND guest_id = p_user_id
      AND status IN ('CONFIRMED', 'COMPLETED')
  ) THEN
    RETURN v_address;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- 3. Payment update rules: lock dispute / capture metadata
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

  IF NEW.booking_id IS DISTINCT FROM OLD.booking_id
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.deposit_amount IS DISTINCT FROM OLD.deposit_amount
     OR NEW.stripe_payment_intent_id IS DISTINCT FROM OLD.stripe_payment_intent_id
     OR NEW.stripe_deposit_intent_id IS DISTINCT FROM OLD.stripe_deposit_intent_id
     OR NEW.dispute_reported_at IS DISTINCT FROM OLD.dispute_reported_at
     OR NEW.review_window_ends_at IS DISTINCT FROM OLD.review_window_ends_at
     OR NEW.auto_capture_scheduled_at IS DISTINCT FROM OLD.auto_capture_scheduled_at
     OR NEW.capture_hold_reason IS DISTINCT FROM OLD.capture_hold_reason
     OR NEW.deposit_released_at IS DISTINCT FROM OLD.deposit_released_at THEN
    RAISE EXCEPTION 'Payment identity, amounts, and dispute/capture fields cannot be modified directly';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = NEW.booking_id AND b.guest_id = auth.uid()
    ) INTO v_is_guest;

    IF v_is_guest THEN
      IF NOT (OLD.status = 'pending' AND NEW.status = 'authorised') THEN
        RAISE EXCEPTION 'Payment status transition % -> % is not allowed', OLD.status, NEW.status;
      END IF;
    ELSE
      -- Hosts must use API routes (service role) for capture/release
      RAISE EXCEPTION 'Payment status transition % -> % is not allowed directly; use the appropriate API', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Booking update rules: no direct client CANCELLED
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_booking_update_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.start_at IS DISTINCT FROM OLD.start_at
     OR NEW.end_at IS DISTINCT FROM OLD.end_at
     OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
     OR NEW.platform_fee_amount IS DISTINCT FROM OLD.platform_fee_amount
     OR NEW.deposit_amount IS DISTINCT FROM OLD.deposit_amount
     OR NEW.payment_deadline_at IS DISTINCT FROM OLD.payment_deadline_at THEN
    RAISE EXCEPTION 'Booking times, amounts and payment deadline cannot be modified directly';
  END IF;

  -- Status changes must go through SECURITY DEFINER RPCs or service-role APIs.
  -- Clients may only auto-complete ended CONFIRMED bookings.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'CONFIRMED' AND NEW.status = 'COMPLETED' AND OLD.end_at < NOW() THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Booking status transition % -> % is not allowed directly; use the appropriate API', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. mark_past_bookings_completed: cron / service role only
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.mark_past_bookings_completed() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_past_bookings_completed() FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_past_bookings_completed() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_past_bookings_completed() TO service_role;

-- ---------------------------------------------------------------------------
-- 6. log_notification: service role only (prevents email-dedupe suppression)
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.log_notification(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_notification(UUID, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_notification(UUID, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.log_notification(UUID, TEXT, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Guest payment INSERT: only pending rows with no forged Stripe IDs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_payment_insert_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Clients may only insert payments with status pending';
  END IF;

  -- Stripe intent IDs may be set by authenticated API routes that create
  -- PaymentIntents; forged authorised/captured status is what we block.
  IF NEW.dispute_reported_at IS NOT NULL
     OR NEW.capture_hold_reason IS NOT NULL
     OR NEW.deposit_released_at IS NOT NULL THEN
    RAISE EXCEPTION 'Clients may not set dispute/capture fields on insert';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_payment_insert_rules ON public.payments;
CREATE TRIGGER trg_enforce_payment_insert_rules
  BEFORE INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_payment_insert_rules();
