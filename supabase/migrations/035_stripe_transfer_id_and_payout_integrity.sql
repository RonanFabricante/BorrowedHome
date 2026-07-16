-- Track Connect transfers separately from charge capture so we can retry
-- host payouts when capture succeeded but transfer failed / was skipped.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS stripe_transfer_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_stripe_transfer_id
  ON public.payments (stripe_transfer_id)
  WHERE stripe_transfer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_missing_host_transfer
  ON public.payments (status, review_window_ends_at)
  WHERE stripe_transfer_id IS NULL
    AND status IN ('authorised', 'captured');

COMMENT ON COLUMN public.payments.stripe_transfer_id IS
  'Stripe Transfer id (tr_…) to the host Connect account. Payment is only fully settled when this is set; charge capture alone is not enough.';

-- Block client writes to transfer id (service role / SECURITY DEFINER still bypass)
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
     OR NEW.stripe_transfer_id IS DISTINCT FROM OLD.stripe_transfer_id
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
      RAISE EXCEPTION 'Payment status transition % -> % is not allowed directly; use the appropriate API', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
