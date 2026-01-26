-- Allow guests to create payment records for PAYMENT_PENDING bookings
-- (used by /api/payments/initiate when no payment row exists yet)

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Guests can insert payments for their bookings" ON public.payments;
CREATE POLICY "Guests can insert payments for their bookings"
  ON public.payments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.id = payments.booking_id
        AND b.guest_id = auth.uid()
        AND b.status IN ('PAYMENT_PENDING', 'CONFIRMED')
    )
  );

