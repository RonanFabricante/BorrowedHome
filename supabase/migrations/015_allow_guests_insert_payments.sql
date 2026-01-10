-- Migration: Allow guests to insert payment records for their own bookings
-- Guests need to create payment records when initiating payment for their confirmed bookings

-- Allow guests to insert payment records for bookings where they are the guest
-- Note: In WITH CHECK for INSERT, we can reference the table column as payments.booking_id
DROP POLICY IF EXISTS "Guests can insert payments for their bookings" ON payments;
CREATE POLICY "Guests can insert payments for their bookings"
  ON payments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = payments.booking_id
      AND bookings.guest_id = auth.uid()
      AND bookings.status = 'CONFIRMED' -- Only allow for confirmed bookings
    )
  );

-- Allow service role to insert payments (for webhooks/system operations)
DROP POLICY IF EXISTS "Service role can insert payments" ON payments;
CREATE POLICY "Service role can insert payments"
  ON payments FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- Allow guests to update their own payment records (for status updates)
DROP POLICY IF EXISTS "Guests can update their own payments" ON payments;
CREATE POLICY "Guests can update their own payments"
  ON payments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = payments.booking_id
      AND bookings.guest_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = payments.booking_id
      AND bookings.guest_id = auth.uid()
    )
  );

-- Allow hosts to update payments for their listings (for capture/release operations)
DROP POLICY IF EXISTS "Hosts can update payments for their listings" ON payments;
CREATE POLICY "Hosts can update payments for their listings"
  ON payments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM bookings
      JOIN listings ON listings.id = bookings.listing_id
      WHERE bookings.id = payments.booking_id
      AND listings.host_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM bookings
      JOIN listings ON listings.id = bookings.listing_id
      WHERE bookings.id = payments.booking_id
      AND listings.host_id = auth.uid()
    )
  );
