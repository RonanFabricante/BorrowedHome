-- Superadmin flag + admin action audit trail

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_superadmin IS
  'Platform operator. Set only via SQL / service role — never via public signup.';

CREATE TABLE IF NOT EXISTS public.admin_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  reason TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_created_at
  ON public.admin_actions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_actions_actor_id
  ON public.admin_actions(actor_id);

CREATE INDEX IF NOT EXISTS idx_admin_actions_entity
  ON public.admin_actions(entity_type, entity_id);

ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

-- No client policies: only service role (admin APIs) read/write this table.
DROP POLICY IF EXISTS "Superadmins can read admin_actions" ON public.admin_actions;

COMMENT ON TABLE public.admin_actions IS
  'Audit log for /admin console mutations. Written via service-role API routes.';
