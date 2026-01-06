-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types
CREATE TYPE booking_status AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED');
CREATE TYPE space_type AS ENUM ('KITCHEN', 'DINING', 'LIVING', 'GARDEN');
CREATE TYPE noise_tolerance AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- Profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  is_host BOOLEAN DEFAULT false,
  is_guest BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Listings table
CREATE TABLE listings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  host_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  location_text TEXT NOT NULL,
  address_text TEXT NOT NULL,
  max_guests INTEGER NOT NULL,
  host_present BOOLEAN DEFAULT false,
  noise_tolerance noise_tolerance DEFAULT 'MEDIUM',
  cooking_allowed BOOLEAN DEFAULT false,
  alcohol_allowed BOOLEAN DEFAULT false,
  cleaning_expectations TEXT,
  hourly_rate INTEGER NOT NULL, -- in cents
  half_day_rate INTEGER NOT NULL, -- in cents
  full_day_rate INTEGER NOT NULL, -- in cents
  deposit_amount INTEGER NOT NULL DEFAULT 0, -- in cents
  published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Listing spaces junction table
CREATE TABLE listing_spaces (
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  space_type space_type NOT NULL,
  PRIMARY KEY (listing_id, space_type)
);

-- Listing photos table
CREATE TABLE listing_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Listing availability table
CREATE TABLE listing_availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0 = Sunday, 6 = Saturday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL CHECK (end_time <= '21:00:00'), -- Day use only: end by 9pm
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(listing_id, day_of_week)
);

-- Bookings table
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  guest_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status booking_status DEFAULT 'PENDING',
  accepted_rules_at TIMESTAMPTZ,
  guests_count INTEGER NOT NULL,
  total_amount INTEGER NOT NULL, -- in cents
  platform_fee_amount INTEGER NOT NULL DEFAULT 0, -- in cents
  deposit_amount INTEGER NOT NULL DEFAULT 0, -- in cents
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (end_at > start_at),
  CHECK (EXTRACT(HOUR FROM end_at) <= 21) -- Day use only: end by 9pm
);

-- Messages table
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reviews table
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reviewee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  body TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(booking_id, reviewer_id, reviewee_id)
);

-- Indexes for performance
CREATE INDEX idx_listings_host_id ON listings(host_id);
CREATE INDEX idx_listings_published ON listings(published);
CREATE INDEX idx_listings_location ON listings(location_text);
CREATE INDEX idx_listing_spaces_listing_id ON listing_spaces(listing_id);
CREATE INDEX idx_listing_photos_listing_id ON listing_photos(listing_id);
CREATE INDEX idx_listing_availability_listing_id ON listing_availability(listing_id);
CREATE INDEX idx_bookings_listing_id ON bookings(listing_id);
CREATE INDEX idx_bookings_guest_id ON bookings(guest_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_dates ON bookings(start_at, end_at);
CREATE INDEX idx_messages_booking_id ON messages(booking_id);
CREATE INDEX idx_reviews_booking_id ON reviews(booking_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for listings updated_at
CREATE TRIGGER update_listings_updated_at BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
