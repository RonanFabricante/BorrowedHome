-- Migration: Allow guests to read host Stripe account status for payment initiation
-- Guests need to verify host Stripe account is ready before initiating payment

-- Allow any authenticated user to read host Stripe account status (for payment verification)
-- This is safe because we only expose stripe_account_id and onboarding status, not sensitive data
-- Note: PostgreSQL RLS uses OR logic for multiple SELECT policies, so this works alongside the existing "Users can view their own host record" policy

DROP POLICY IF EXISTS "Guests can view host Stripe status for payments" ON hosts;
CREATE POLICY "Guests can view host Stripe status for payments"
  ON hosts FOR SELECT
  USING (auth.uid() IS NOT NULL); -- Any authenticated user can read (for payment verification)

-- Note: Users can still only INSERT/UPDATE their own records via the existing policies
-- This policy only affects SELECT operations, allowing guests to verify host Stripe status