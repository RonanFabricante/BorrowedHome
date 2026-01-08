-- Migration: Stripe Connect payments integration
-- Adds payment tracking and host Stripe account management

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  stripe_payment_intent_id TEXT NOT NULL UNIQUE,
  stripe_deposit_intent_id TEXT NULL UNIQUE,
  amount INTEGER NOT NULL, -- Total amount in cents (booking + platform fee)
  deposit_amount INTEGER NOT NULL DEFAULT 0, -- Deposit amount in cents
  status TEXT NOT NULL CHECK (status IN ('pending', 'authorised', 'captured', 'released', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Host Stripe accounts table
CREATE TABLE IF NOT EXISTS host_stripe_accounts (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_account_id TEXT NOT NULL UNIQUE,
  onboarding_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_payment_intent_id ON payments(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_deposit_intent_id ON payments(stripe_deposit_intent_id);

-- RLS policies for payments
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Guests can view their own payments" ON payments;
CREATE POLICY "Guests can view their own payments"
  ON payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = payments.booking_id
      AND bookings.guest_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Hosts can view payments for their listings" ON payments;
CREATE POLICY "Hosts can view payments for their listings"
  ON payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookings
      JOIN listings ON listings.id = bookings.listing_id
      WHERE bookings.id = payments.booking_id
      AND listings.host_id = auth.uid()
    )
  );

-- RLS policies for host_stripe_accounts
ALTER TABLE host_stripe_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own Stripe account" ON host_stripe_accounts;
CREATE POLICY "Users can view their own Stripe account"
  ON host_stripe_accounts FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own Stripe account" ON host_stripe_accounts;
CREATE POLICY "Users can update their own Stripe account"
  ON host_stripe_accounts FOR UPDATE
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_payments_updated_at();

CREATE TRIGGER update_host_stripe_accounts_updated_at
  BEFORE UPDATE ON host_stripe_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_payments_updated_at();

-- Comments
COMMENT ON TABLE payments IS 'Tracks Stripe payment intents for bookings';
COMMENT ON TABLE host_stripe_accounts IS 'Stores Stripe Connect Express account IDs for hosts';
COMMENT ON COLUMN payments.status IS 'Payment status: pending (created), authorised (payment confirmed), captured (funds captured), released (deposit released), failed';
COMMENT ON COLUMN host_stripe_accounts.onboarding_completed IS 'Whether the host has completed Stripe Connect onboarding';
