-- Migration: Restructure reviews to be listing-scoped (MVP)
-- This replaces the person-to-person review system with listing-scoped reviews

-- Drop existing reviews table and recreate with new structure
DROP TABLE IF EXISTS reviews CASCADE;

-- Create new listing-scoped reviews table
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  host_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  guest_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  space_label TEXT NOT NULL, -- Snapshot of what was booked e.g. "Kitchen + Dining"
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(booking_id) -- One review per booking
);

-- Indexes for performance
CREATE INDEX idx_reviews_listing_id ON reviews(listing_id);
CREATE INDEX idx_reviews_host_id ON reviews(host_id);
CREATE INDEX idx_reviews_guest_id ON reviews(guest_id);
CREATE INDEX idx_reviews_created_at ON reviews(created_at DESC);

-- Enable RLS
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- SELECT: Allow anyone to read reviews (public for marketplace trust)
DROP POLICY IF EXISTS "Anyone can view reviews" ON reviews;
CREATE POLICY "Anyone can view reviews"
  ON reviews FOR SELECT
  USING (true);

-- INSERT: Only the booking's guest can create a review
-- Enforced via RPC function, but also add RLS policy as backup
DROP POLICY IF EXISTS "Guests can create reviews for their completed bookings" ON reviews;
CREATE POLICY "Guests can create reviews for their completed bookings"
  ON reviews FOR INSERT
  WITH CHECK (
    auth.uid() = guest_id
    AND EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = reviews.booking_id
      AND bookings.status = 'COMPLETED'
      AND bookings.end_at < NOW()
      AND bookings.guest_id = auth.uid()
      AND bookings.listing_id = reviews.listing_id
      AND NOT EXISTS (
        SELECT 1 FROM reviews r2
        WHERE r2.booking_id = reviews.booking_id
      )
    )
  );

-- UPDATE: Disallow for MVP (reviews are immutable)
-- DELETE: Disallow for MVP (reviews are permanent)

-- RPC Function: Create review securely
-- This function ensures data consistency and enforces business rules
CREATE OR REPLACE FUNCTION create_listing_review(
  p_booking_id UUID,
  p_rating INTEGER,
  p_space_label TEXT,
  p_comment TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking bookings%ROWTYPE;
  v_listing_id UUID;
  v_host_id UUID;
  v_guest_id UUID;
  v_review_id UUID;
BEGIN
  -- Verify user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Fetch booking details
  SELECT * INTO v_booking
  FROM bookings
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  -- Verify booking belongs to current user (guest)
  IF v_booking.guest_id != auth.uid() THEN
    RAISE EXCEPTION 'You can only review your own bookings';
  END IF;

  -- Verify booking is COMPLETED
  IF v_booking.status != 'COMPLETED' THEN
    RAISE EXCEPTION 'Can only review completed bookings';
  END IF;

  -- Verify booking has ended
  IF v_booking.end_at >= NOW() THEN
    RAISE EXCEPTION 'Can only review bookings that have ended';
  END IF;

  -- Check if review already exists
  IF EXISTS (SELECT 1 FROM reviews WHERE booking_id = p_booking_id) THEN
    RAISE EXCEPTION 'Review already exists for this booking';
  END IF;

  -- Get listing and host info
  SELECT id, host_id INTO v_listing_id, v_host_id
  FROM listings
  WHERE id = v_booking.listing_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;

  -- Set guest_id from booking
  v_guest_id := v_booking.guest_id;

  -- Validate rating
  IF p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5';
  END IF;

  -- Validate space_label
  IF p_space_label IS NULL OR p_space_label = '' THEN
    RAISE EXCEPTION 'Space label is required';
  END IF;

  -- Insert review
  INSERT INTO reviews (
    booking_id,
    listing_id,
    host_id,
    guest_id,
    rating,
    comment,
    space_label
  ) VALUES (
    p_booking_id,
    v_listing_id,
    v_host_id,
    v_guest_id,
    p_rating,
    NULLIF(TRIM(p_comment), ''),
    p_space_label
  )
  RETURNING id INTO v_review_id;

  RETURN v_review_id;
END;
$$;

-- Helper function: Get listing review summary
CREATE OR REPLACE FUNCTION get_listing_review_summary(p_listing_id UUID)
RETURNS TABLE (
  average_rating NUMERIC,
  review_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROUND(AVG(rating)::NUMERIC, 1) AS average_rating,
    COUNT(*)::BIGINT AS review_count
  FROM reviews
  WHERE listing_id = p_listing_id;
END;
$$;

-- Helper function: Get listing reviews
CREATE OR REPLACE FUNCTION get_listing_reviews(
  p_listing_id UUID,
  p_limit INTEGER DEFAULT 10,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  rating INTEGER,
  comment TEXT,
  space_label TEXT,
  created_at TIMESTAMPTZ,
  guest_initial TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.rating,
    r.comment,
    r.space_label,
    r.created_at,
    UPPER(LEFT(p.full_name, 1)) AS guest_initial
  FROM reviews r
  JOIN profiles p ON p.id = r.guest_id
  WHERE r.listing_id = p_listing_id
  ORDER BY r.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Helper function: Get host review summary
CREATE OR REPLACE FUNCTION get_host_review_summary(p_host_id UUID)
RETURNS TABLE (
  average_rating NUMERIC,
  review_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROUND(AVG(rating)::NUMERIC, 1) AS average_rating,
    COUNT(*)::BIGINT AS review_count
  FROM reviews
  WHERE host_id = p_host_id;
END;
$$;

-- Helper function: Get host review snippets
CREATE OR REPLACE FUNCTION get_host_review_snippets(
  p_host_id UUID,
  p_limit INTEGER DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  rating INTEGER,
  comment TEXT,
  space_label TEXT,
  created_at TIMESTAMPTZ,
  listing_id UUID,
  listing_title TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.rating,
    r.comment,
    r.space_label,
    r.created_at,
    r.listing_id,
    l.title AS listing_title
  FROM reviews r
  JOIN listings l ON l.id = r.listing_id
  WHERE r.host_id = p_host_id
  ORDER BY r.created_at DESC
  LIMIT p_limit;
END;
$$;
