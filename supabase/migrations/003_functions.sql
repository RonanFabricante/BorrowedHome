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

-- Function to automatically create profile when user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, is_guest, is_host)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    true,
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();