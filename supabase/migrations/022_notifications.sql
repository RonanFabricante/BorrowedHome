-- Migration: In-App Notifications System
-- Creates notifications table with RLS, indexes, and constraints

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  href TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  dedupe_key TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint for deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_dedupe 
  ON notifications(user_id, dedupe_key);

-- Index for fetching user notifications (sorted by created_at desc)
CREATE INDEX IF NOT EXISTS idx_notifications_user_created 
  ON notifications(user_id, created_at DESC);

-- Index for unread notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread 
  ON notifications(user_id) 
  WHERE read_at IS NULL;

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can select their own notifications
CREATE POLICY "Users can view their own notifications"
  ON notifications
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can update their own notifications (for marking as read)
CREATE POLICY "Users can update their own notifications"
  ON notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Only service role can insert (notifications created server-side)
-- Note: In practice, we'll use an RPC function with SECURITY DEFINER for inserts
-- This policy ensures no client-side inserts
CREATE POLICY "Only service role can insert notifications"
  ON notifications
  FOR INSERT
  WITH CHECK (false); -- Block all client inserts; use RPC function instead

-- Create RPC function for creating notifications (SECURITY DEFINER)
-- This allows server-side code to insert notifications while respecting RLS
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_href TEXT,
  p_dedupe_key TEXT,
  p_body TEXT DEFAULT NULL,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  -- Insert notification with ON CONFLICT DO NOTHING for idempotency
  INSERT INTO notifications (
    user_id,
    type,
    title,
    body,
    href,
    entity_type,
    entity_id,
    dedupe_key
  )
  VALUES (
    p_user_id,
    p_type,
    p_title,
    p_body,
    p_href,
    p_entity_type,
    p_entity_id,
    p_dedupe_key
  )
  ON CONFLICT (user_id, dedupe_key) DO NOTHING
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

-- Add comment
COMMENT ON TABLE notifications IS 'In-app notifications for users';
COMMENT ON COLUMN notifications.dedupe_key IS 'Unique key per user for deduplication (e.g., booking:123:requested)';
COMMENT ON COLUMN notifications.entity_type IS 'Type of related entity (e.g., booking, message)';
COMMENT ON COLUMN notifications.entity_id IS 'ID of related entity';
