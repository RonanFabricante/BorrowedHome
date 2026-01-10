-- Migration: Payment review window and automatic capture scheduling
-- Adds columns for review window, dispute reporting, and automatic capture

-- Add review window and capture scheduling columns
ALTER TABLE payments 
  ADD COLUMN IF NOT EXISTS review_window_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_capture_scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispute_reported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS capture_hold_reason TEXT,
  ADD COLUMN IF NOT EXISTS deposit_released_at TIMESTAMPTZ;

-- Add index for efficient querying of payments ready for auto-capture
CREATE INDEX IF NOT EXISTS idx_payments_auto_capture 
  ON payments(status, review_window_ends_at, dispute_reported_at) 
  WHERE status = 'authorised';

-- Add index for finding payments with scheduled captures
CREATE INDEX IF NOT EXISTS idx_payments_scheduled_capture 
  ON payments(auto_capture_scheduled_at) 
  WHERE auto_capture_scheduled_at IS NOT NULL;

-- Function to initialize review window when booking is completed
CREATE OR REPLACE FUNCTION initialize_payment_review_window()
RETURNS TRIGGER AS $$
DECLARE
  review_window_hours INTEGER := 24; -- 24-hour review window
  review_end_time TIMESTAMPTZ;
BEGIN
  -- Only process when booking transitions to COMPLETED
  IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN
    -- Calculate review window end time (24 hours after booking end)
    review_end_time := NEW.end_at + (review_window_hours || ' hours')::INTERVAL;
    
    -- Update payment record to set review window
    UPDATE payments
    SET 
      review_window_ends_at = review_end_time,
      auto_capture_scheduled_at = review_end_time
    WHERE booking_id = NEW.id
      AND status = 'authorised'
      AND review_window_ends_at IS NULL;
    
    RAISE NOTICE 'Review window initialized for booking %: ends at %', NEW.id, review_end_time;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to initialize review window when booking becomes COMPLETED
DROP TRIGGER IF EXISTS trigger_initialize_review_window ON bookings;
CREATE TRIGGER trigger_initialize_review_window
  AFTER UPDATE OF status ON bookings
  FOR EACH ROW
  WHEN (NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED')
  EXECUTE FUNCTION initialize_payment_review_window();

-- Backfill review windows for existing completed bookings with authorised payments
DO $$
DECLARE
  review_window_hours INTEGER := 24;
BEGIN
  UPDATE payments p
  SET 
    review_window_ends_at = b.end_at + (review_window_hours || ' hours')::INTERVAL,
    auto_capture_scheduled_at = b.end_at + (review_window_hours || ' hours')::INTERVAL
  FROM bookings b
  WHERE p.booking_id = b.id
    AND b.status = 'COMPLETED'
    AND p.status = 'authorised'
    AND p.review_window_ends_at IS NULL;
END $$;

-- Comments for documentation
COMMENT ON COLUMN payments.review_window_ends_at IS 'End time of the review window. Auto-capture occurs after this time if no dispute is reported.';
COMMENT ON COLUMN payments.auto_capture_scheduled_at IS 'Scheduled time for automatic payment capture. Set to review_window_ends_at when booking completes.';
COMMENT ON COLUMN payments.dispute_reported_at IS 'Timestamp when a dispute was reported. Extends review window and holds capture.';
COMMENT ON COLUMN payments.capture_hold_reason IS 'Reason for holding payment capture (e.g., dispute description).';
COMMENT ON COLUMN payments.deposit_released_at IS 'Timestamp when deposit was automatically released.';

COMMENT ON FUNCTION initialize_payment_review_window() IS 'Initializes 24-hour review window when booking is marked as COMPLETED.';
COMMENT ON TRIGGER trigger_initialize_review_window ON bookings IS 'Automatically sets review window end time when booking status changes to COMPLETED.';
