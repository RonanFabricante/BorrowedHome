-- Function to check booking overlaps
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
      AND status IN ('PENDING', 'CONFIRMED')
      AND (
        (start_at <= p_start_at AND end_at > p_start_at)
        OR (start_at < p_end_at AND end_at >= p_end_at)
        OR (start_at >= p_start_at AND end_at <= p_end_at)
      )
      AND (p_booking_id IS NULL OR id != p_booking_id)
  );
END;
$$ LANGUAGE plpgsql;

-- Function to get listing address for authorized users
CREATE OR REPLACE FUNCTION get_listing_address(
  p_listing_id UUID,
  p_user_id UUID
)
RETURNS TEXT AS $$
DECLARE
  v_address TEXT;
  v_host_id UUID;
BEGIN
  -- Get listing and host_id
  SELECT address_text, host_id INTO v_address, v_host_id
  FROM listings
  WHERE id = p_listing_id;

  -- Return address if user is host
  IF v_host_id = p_user_id THEN
    RETURN v_address;
  END IF;

  -- Return address if user has a confirmed booking
  IF EXISTS (
    SELECT 1
    FROM bookings
    WHERE listing_id = p_listing_id
      AND guest_id = p_user_id
      AND status = 'CONFIRMED'
  ) THEN
    RETURN v_address;
  END IF;

  -- Otherwise return null
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
