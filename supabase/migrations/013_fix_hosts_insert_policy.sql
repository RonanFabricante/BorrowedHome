-- Migration: Fix hosts table INSERT RLS policy
-- Adds missing INSERT policy to allow users to create their own host records

-- Users can insert their own host record
DROP POLICY IF EXISTS "Users can insert their own host record" ON hosts;
CREATE POLICY "Users can insert their own host record"
  ON hosts FOR INSERT
  WITH CHECK (auth.uid() = user_id);
