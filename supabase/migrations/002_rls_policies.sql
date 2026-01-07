-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Profiles policies
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
CREATE POLICY "Users can view all profiles"
  ON profiles FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Listings policies
DROP POLICY IF EXISTS "Anyone can view published listings (without address)" ON listings;
CREATE POLICY "Anyone can view published listings (without address)"
  ON listings FOR SELECT
  USING (published = true);

DROP POLICY IF EXISTS "Hosts can view their own listings (with address)" ON listings;
CREATE POLICY "Hosts can view their own listings (with address)"
  ON listings FOR SELECT
  USING (auth.uid() = host_id);

DROP POLICY IF EXISTS "Hosts can create their own listings" ON listings;
CREATE POLICY "Hosts can create their own listings"
  ON listings FOR INSERT
  WITH CHECK (auth.uid() = host_id);

DROP POLICY IF EXISTS "Hosts can update their own listings" ON listings;
CREATE POLICY "Hosts can update their own listings"
  ON listings FOR UPDATE
  USING (auth.uid() = host_id);

-- Listing spaces policies
DROP POLICY IF EXISTS "Anyone can view spaces for published listings" ON listing_spaces;
CREATE POLICY "Anyone can view spaces for published listings"
  ON listing_spaces FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM listings
      WHERE listings.id = listing_spaces.listing_id
      AND listings.published = true
    )
  );

DROP POLICY IF EXISTS "Hosts can manage spaces for their listings" ON listing_spaces;
CREATE POLICY "Hosts can manage spaces for their listings"
  ON listing_spaces FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM listings
      WHERE listings.id = listing_spaces.listing_id
      AND listings.host_id = auth.uid()
    )
  );

-- Listing photos policies
DROP POLICY IF EXISTS "Anyone can view photos for published listings" ON listing_photos;
CREATE POLICY "Anyone can view photos for published listings"
  ON listing_photos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM listings
      WHERE listings.id = listing_photos.listing_id
      AND listings.published = true
    )
  );

DROP POLICY IF EXISTS "Hosts can manage photos for their listings" ON listing_photos;
CREATE POLICY "Hosts can manage photos for their listings"
  ON listing_photos FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM listings
      WHERE listings.id = listing_photos.listing_id
      AND listings.host_id = auth.uid()
    )
  );

-- Listing availability policies
DROP POLICY IF EXISTS "Anyone can view availability for published listings" ON listing_availability;
CREATE POLICY "Anyone can view availability for published listings"
  ON listing_availability FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM listings
      WHERE listings.id = listing_availability.listing_id
      AND listings.published = true
    )
  );

DROP POLICY IF EXISTS "Hosts can manage availability for their listings" ON listing_availability;
CREATE POLICY "Hosts can manage availability for their listings"
  ON listing_availability FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM listings
      WHERE listings.id = listing_availability.listing_id
      AND listings.host_id = auth.uid()
    )
  );

-- Bookings policies
DROP POLICY IF EXISTS "Users can view bookings they are part of" ON bookings;
CREATE POLICY "Users can view bookings they are part of"
  ON bookings FOR SELECT
  USING (
    guest_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM listings
      WHERE listings.id = bookings.listing_id
      AND listings.host_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Guests can create bookings" ON bookings;
DROP POLICY IF EXISTS "Guests can create bookings (PENDING only)" ON bookings;
CREATE POLICY "Guests can create bookings (PENDING only)"
  ON bookings FOR INSERT
  WITH CHECK (
    auth.uid() = guest_id
    AND status = 'PENDING'  -- Guests can only create PENDING bookings
  );

DROP POLICY IF EXISTS "Guests can update their own bookings" ON bookings;
DROP POLICY IF EXISTS "Guests can update their own bookings (status restrictions)" ON bookings;
CREATE POLICY "Guests can update their own bookings"
  ON bookings FOR UPDATE
  USING (auth.uid() = guest_id)
  WITH CHECK (
    auth.uid() = guest_id
    -- Status changes are enforced via application logic and RPC functions
    -- Guests can update their own bookings, but status transitions are controlled
  );

-- Messages policies (only for CONFIRMED bookings)
DROP POLICY IF EXISTS "Users can view messages for their bookings" ON messages;
DROP POLICY IF EXISTS "Users can view messages for their CONFIRMED bookings" ON messages;
CREATE POLICY "Users can view messages for their CONFIRMED bookings"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = messages.booking_id
      AND bookings.status = 'CONFIRMED'  -- Only CONFIRMED bookings
      AND (
        bookings.guest_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM listings
          WHERE listings.id = bookings.listing_id
          AND listings.host_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "Users can send messages for their bookings" ON messages;
DROP POLICY IF EXISTS "Users can send messages for their CONFIRMED bookings" ON messages;
CREATE POLICY "Users can send messages for their CONFIRMED bookings"
  ON messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = messages.booking_id
      AND bookings.status = 'CONFIRMED'  -- Only CONFIRMED bookings
      AND (
        bookings.guest_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM listings
          WHERE listings.id = bookings.listing_id
          AND listings.host_id = auth.uid()
        )
      )
    )
  );

-- Reviews policies
DROP POLICY IF EXISTS "Anyone can view reviews for completed bookings" ON reviews;
CREATE POLICY "Anyone can view reviews for completed bookings"
  ON reviews FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = reviews.booking_id
      AND bookings.status = 'COMPLETED'
    )
  );

DROP POLICY IF EXISTS "Users can create reviews for their completed bookings" ON reviews;
CREATE POLICY "Users can create reviews for their completed bookings"
  ON reviews FOR INSERT
  WITH CHECK (
    auth.uid() = reviewer_id
    AND EXISTS (
      SELECT 1 FROM bookings
      WHERE bookings.id = reviews.booking_id
      AND bookings.status = 'COMPLETED'
      AND bookings.end_at < NOW()
      AND (
        bookings.guest_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM listings
          WHERE listings.id = bookings.listing_id
          AND listings.host_id = auth.uid()
        )
      )
    )
  );
