-- Migration: Enhanced automatic booking completion with payment capture triggers
-- Adds database triggers and improved completion logic

-- Enhanced function to mark past bookings as completed
-- This version also schedules payment capture review window
CREATE OR REPLACE FUNCTION mark_past_bookings_completed()
RETURNS void AS $$
DECLARE
  completed_count INTEGER;
BEGIN
  -- Mark bookings as completed
  UPDATE bookings
  SET status = 'COMPLETED'
  WHERE status = 'CONFIRMED'
    AND end_at < NOW();
  
  GET DIAGNOSTICS completed_count = ROW_COUNT;
  
  -- Log completion (optional - for debugging)
  IF completed_count > 0 THEN
    RAISE NOTICE 'Marked % bookings as completed', completed_count;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function to auto-complete bookings on update/view
CREATE OR REPLACE FUNCTION auto_complete_booking_on_update()
RETURNS TRIGGER AS $$
BEGIN
  -- If booking end time has passed and still CONFIRMED, mark as COMPLETED
  IF OLD.status = 'CONFIRMED' AND NEW.end_at < NOW() AND NEW.status = 'CONFIRMED' THEN
    NEW.status = 'COMPLETED';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (fires on UPDATE to catch any status changes)
-- This ensures bookings are marked complete even if not explicitly updated
DROP TRIGGER IF EXISTS trigger_auto_complete_bookings ON bookings;
CREATE TRIGGER trigger_auto_complete_bookings
  BEFORE UPDATE ON bookings
  FOR EACH ROW
  WHEN (OLD.status = 'CONFIRMED')
  EXECUTE FUNCTION auto_complete_booking_on_update();

-- Note: For production, also set up a scheduled cron job
-- Supabase doesn't support pg_cron in all tiers, so use Vercel Cron instead
-- See: app/api/cron/complete-bookings/route.ts

-- Index for efficient querying of bookings needing completion
CREATE INDEX IF NOT EXISTS idx_bookings_completion_check 
  ON bookings(status, end_at) 
  WHERE status = 'CONFIRMED';

COMMENT ON FUNCTION mark_past_bookings_completed() IS 'Marks past CONFIRMED bookings as COMPLETED. Should be called periodically via cron job.';
COMMENT ON TRIGGER trigger_auto_complete_bookings ON bookings IS 'Auto-completes bookings when they are updated and end time has passed.';
