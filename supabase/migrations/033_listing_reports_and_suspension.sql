-- Listing reports, profile suspension for trust & safety

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_suspended IS
  'When true, user cannot create bookings or publish/create listings. Set by superadmin.';

CREATE TABLE IF NOT EXISTS public.listing_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 2000),
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_listing_reports_status_created
  ON public.listing_reports(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_listing_reports_listing_id
  ON public.listing_reports(listing_id);

ALTER TABLE public.listing_reports ENABLE ROW LEVEL SECURITY;

-- Authenticated users can insert their own reports (or anonymous reporter_id null via service role only)
DROP POLICY IF EXISTS "Users can insert listing reports" ON public.listing_reports;
CREATE POLICY "Users can insert listing reports"
  ON public.listing_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Users can view own listing reports" ON public.listing_reports;
CREATE POLICY "Users can view own listing reports"
  ON public.listing_reports FOR SELECT
  TO authenticated
  USING (auth.uid() = reporter_id);

-- No client UPDATE/DELETE — admin uses service role

COMMENT ON TABLE public.listing_reports IS
  'User reports of misleading, unsafe, or fraudulent listings. Reviewed in /admin.';
