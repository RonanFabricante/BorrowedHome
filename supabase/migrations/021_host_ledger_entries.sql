-- Migration: Host Ledger Entries
-- Tracks earnings and payouts for hosts

CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  host_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('credit', 'debit', 'payout', 'refund')),
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'aud',
  description TEXT,
  paid BOOLEAN DEFAULT false,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ledger_entries_host_id ON ledger_entries(host_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_booking_id ON ledger_entries(booking_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_created_at ON ledger_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_type ON ledger_entries(type);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_paid ON ledger_entries(paid) WHERE paid = false;

-- RLS policies
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;

-- Hosts can view their own ledger entries
DROP POLICY IF EXISTS "Hosts can view their own ledger entries" ON ledger_entries;
CREATE POLICY "Hosts can view their own ledger entries"
  ON ledger_entries FOR SELECT
  USING (host_id = auth.uid());

-- Only system can insert ledger entries (via service role)
-- No INSERT policy for regular users - entries are created server-side

-- Comments
COMMENT ON TABLE ledger_entries IS 'Tracks host earnings, payouts, and financial transactions';
COMMENT ON COLUMN ledger_entries.type IS 'credit: earnings from booking, debit: fees/charges, payout: transfer to host, refund: refund to guest';
COMMENT ON COLUMN ledger_entries.paid IS 'Whether payout has been processed (for credit entries)';
