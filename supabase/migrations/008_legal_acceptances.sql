-- Migration: Legal acceptances and host declarations
-- Adds tables and columns to track user legal acceptances and listing declarations

-- Table to track user legal acceptances
CREATE TABLE IF NOT EXISTS user_legal_acceptances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('guest_terms', 'host_declaration')),
  doc_version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB, -- user_agent, ip, listing_id, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique index to prevent duplicate acceptances for same user/doc/version
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_legal_acceptances_unique 
ON user_legal_acceptances(user_id, doc_type, doc_version);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_user_legal_acceptances_user_id 
ON user_legal_acceptances(user_id);

CREATE INDEX IF NOT EXISTS idx_user_legal_acceptances_doc_type 
ON user_legal_acceptances(doc_type, doc_version);

-- Add host declaration fields to listings table
ALTER TABLE listings
ADD COLUMN IF NOT EXISTS host_declaration_version TEXT,
ADD COLUMN IF NOT EXISTS host_declaration_accepted_at TIMESTAMPTZ;

-- RLS policies for user_legal_acceptances
ALTER TABLE user_legal_acceptances ENABLE ROW LEVEL SECURITY;

-- Users can view their own acceptances
DROP POLICY IF EXISTS "Users can view their own acceptances" ON user_legal_acceptances;
CREATE POLICY "Users can view their own acceptances"
  ON user_legal_acceptances FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own acceptances
DROP POLICY IF EXISTS "Users can insert their own acceptances" ON user_legal_acceptances;
CREATE POLICY "Users can insert their own acceptances"
  ON user_legal_acceptances FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Comments for documentation
COMMENT ON TABLE user_legal_acceptances IS 'Tracks user legal document acceptances (guest terms, host declarations)';
COMMENT ON COLUMN user_legal_acceptances.doc_type IS 'Type of document: guest_terms or host_declaration';
COMMENT ON COLUMN user_legal_acceptances.doc_version IS 'Version string of the document (e.g., "2026-01-08-au-v1")';
COMMENT ON COLUMN user_legal_acceptances.metadata IS 'Optional metadata (user_agent, ip, listing_id, etc.)';
COMMENT ON COLUMN listings.host_declaration_version IS 'Version of host declaration accepted when listing was published';
COMMENT ON COLUMN listings.host_declaration_accepted_at IS 'Timestamp when host declaration was accepted for this listing';
