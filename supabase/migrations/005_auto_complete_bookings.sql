-- Function to mark past CONFIRMED bookings as COMPLETED
CREATE OR REPLACE FUNCTION mark_past_bookings_completed()
RETURNS void AS $$
BEGIN
  UPDATE bookings
  SET status = 'COMPLETED'
  WHERE status = 'CONFIRMED'
    AND end_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: To enable automatic execution, you need to:
-- 1. Enable pg_cron extension in Supabase (if available)
-- 2. Schedule the function to run periodically
-- 
-- Example schedule (runs daily at midnight UTC):
-- SELECT cron.schedule(
--   'mark-completed-bookings',
--   '0 0 * * *',
--   $$SELECT mark_past_bookings_completed()$$
-- );
--
-- Alternative: Call this function from a scheduled job or API route
-- For MVP, you can also call this function when users view their bookings
