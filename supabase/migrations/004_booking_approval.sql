-- Add DECLINED to booking_status enum
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'DECLINED';

-- Update check_booking_overlap to only check CONFIRMED bookings (PENDING should not block inventory)
CREATE OR REPLACE FUNCTION check_booking_overlap(
  p_listing_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_booking_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM bookings
    WHERE listing_id = p_listing_id
      AND status = 'CONFIRMED'  -- Only check against CONFIRMED bookings
      AND (
        (start_at <= p_start_at AND end_at > p_start_at)
        OR (start_at < p_end_at AND end_at >= p_end_at)
        OR (start_at >= p_start_at AND end_at <= p_end_at)
      )
      AND (p_booking_id IS NULL OR id != p_booking_id)
  );
END;
$$ LANGUAGE plpgsql;

-- Function to accept a booking (atomic, race-safe)
CREATE OR REPLACE FUNCTION accept_booking(
  p_booking_id UUID,
  p_host_id UUID
)
RETURNS bookings AS $$
DECLARE
  v_booking bookings;
  v_listing_id UUID;
  v_host_id UUID;
BEGIN
  -- Get booking and validate it exists and is PENDING
  SELECT b.* INTO v_booking
  FROM bookings b
  WHERE b.id = p_booking_id
    AND b.status = 'PENDING'
  FOR UPDATE;  -- Lock the row for atomic operation

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or not in PENDING status';
  END IF;

  -- Get listing host_id and id
  SELECT l.host_id, l.id INTO v_host_id, v_listing_id
  FROM listings l
  WHERE l.id = v_booking.listing_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;

  -- Validate caller is the host
  IF v_host_id != p_host_id THEN
    RAISE EXCEPTION 'Only the listing host can accept bookings';
  END IF;

  -- Check for overlap with existing CONFIRMED bookings (excluding this booking)
  IF EXISTS (
    SELECT 1
    FROM bookings
    WHERE listing_id = v_listing_id
      AND status = 'CONFIRMED'
      AND id != p_booking_id
      AND (
        (start_at <= v_booking.start_at AND end_at > v_booking.start_at)
        OR (start_at < v_booking.end_at AND end_at >= v_booking.end_at)
        OR (start_at >= v_booking.start_at AND end_at <= v_booking.end_at)
      )
  ) THEN
    RAISE EXCEPTION 'This time slot overlaps with an existing confirmed booking';
  END IF;

  -- Update status to CONFIRMED
  UPDATE bookings
  SET status = 'CONFIRMED'
  WHERE id = p_booking_id;

  -- Return updated booking
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
  RETURN v_booking;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to decline a booking
CREATE OR REPLACE FUNCTION decline_booking(
  p_booking_id UUID,
  p_host_id UUID
)
RETURNS bookings AS $$
DECLARE
  v_booking bookings;
  v_listing_id UUID;
  v_host_id UUID;
BEGIN
  -- Get booking and validate it exists and is PENDING
  SELECT b.* INTO v_booking
  FROM bookings b
  WHERE b.id = p_booking_id
    AND b.status = 'PENDING'
  FOR UPDATE;  -- Lock the row for atomic operation

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or not in PENDING status';
  END IF;

  -- Get listing host_id and id
  SELECT l.host_id, l.id INTO v_host_id, v_listing_id
  FROM listings l
  WHERE l.id = v_booking.listing_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;

  -- Validate caller is the host
  IF v_host_id != p_host_id THEN
    RAISE EXCEPTION 'Only the listing host can decline bookings';
  END IF;

  -- Update status to DECLINED
  UPDATE bookings
  SET status = 'DECLINED'
  WHERE id = p_booking_id;

  -- Return updated booking
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
  RETURN v_booking;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
