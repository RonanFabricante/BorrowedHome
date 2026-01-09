-- Migration: Create hosts table for comprehensive Stripe Connect management
-- Replaces/supplements host_stripe_accounts with more detailed tracking

-- Create hosts table
CREATE TABLE IF NOT EXISTS hosts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_account_id TEXT NULL UNIQUE,
  stripe_charges_enabled BOOLEAN DEFAULT false,
  stripe_payouts_enabled BOOLEAN DEFAULT false,
  stripe_requirements_due JSONB NULL,
  stripe_onboarding_status TEXT DEFAULT 'not_started' CHECK (stripe_onboarding_status IN ('not_started', 'in_progress', 'complete', 'restricted')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_hosts_user_id ON hosts(user_id);
CREATE INDEX IF NOT EXISTS idx_hosts_stripe_account_id ON hosts(stripe_account_id);
CREATE INDEX IF NOT EXISTS idx_hosts_onboarding_status ON hosts(stripe_onboarding_status);

-- Migrate existing data from host_stripe_accounts if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'host_stripe_accounts') THEN
    INSERT INTO hosts (user_id, stripe_account_id, stripe_onboarding_status, created_at, updated_at)
    SELECT 
      user_id,
      stripe_account_id,
      CASE 
        WHEN onboarding_completed THEN 'complete'
        WHEN stripe_account_id IS NOT NULL THEN 'in_progress'
        ELSE 'not_started'
      END,
      created_at,
      updated_at
    FROM host_stripe_accounts
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;

-- RLS policies for hosts
ALTER TABLE hosts ENABLE ROW LEVEL SECURITY;

-- Users can read/update their own host row
DROP POLICY IF EXISTS "Users can view their own host record" ON hosts;
CREATE POLICY "Users can view their own host record"
  ON hosts FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own host record" ON hosts;
CREATE POLICY "Users can update their own host record"
  ON hosts FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role can update any row (for webhooks)
DROP POLICY IF EXISTS "Service role can update hosts" ON hosts;
CREATE POLICY "Service role can update hosts"
  ON hosts FOR UPDATE
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_hosts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_hosts_updated_at
  BEFORE UPDATE ON hosts
  FOR EACH ROW
  EXECUTE FUNCTION update_hosts_updated_at();

-- Comments
COMMENT ON TABLE hosts IS 'Comprehensive host records with Stripe Connect Express account management';
COMMENT ON COLUMN hosts.stripe_onboarding_status IS 'Onboarding status: not_started, in_progress, complete, or restricted';
COMMENT ON COLUMN hosts.stripe_requirements_due IS 'JSON array of currently due requirements from Stripe';
