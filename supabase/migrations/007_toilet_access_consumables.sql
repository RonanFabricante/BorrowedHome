-- Create enum type for toilet access (if not exists)
DO $$ BEGIN
  CREATE TYPE toilet_access_type AS ENUM ('shared', 'private', 'limited', 'none');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add toilet access and consumables fields to listings
ALTER TABLE listings
ADD COLUMN IF NOT EXISTS toilet_access toilet_access_type DEFAULT 'shared',
ADD COLUMN IF NOT EXISTS toilet_access_notes TEXT,
ADD COLUMN IF NOT EXISTS consumables_policy TEXT DEFAULT 'Personal consumables and perishables are not provided unless explicitly listed by the Host. Please bring any groceries/ingredients and personal items you require (e.g., hygiene products).',
ADD COLUMN IF NOT EXISTS provides_toilet_paper BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS provides_pantry_staples BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS provides_groceries BOOLEAN DEFAULT false;

-- Add constraint: toilet_access_notes required when toilet_access is 'limited' or 'none'
ALTER TABLE listings
ADD CONSTRAINT toilet_access_notes_required_when_limited_or_none
CHECK (
  (toilet_access IN ('limited', 'none') AND toilet_access_notes IS NOT NULL AND LENGTH(TRIM(toilet_access_notes)) > 0)
  OR toilet_access NOT IN ('limited', 'none')
);

-- Add booking acknowledgement fields
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS guest_ack_toilet_access BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS guest_ack_consumables_policy BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS ack_version TEXT;

-- Update existing CONFIRMED bookings to have acknowledgements set to true
-- (We assume existing confirmed bookings were created before this feature and are grandfathered in)
UPDATE bookings
SET 
  guest_ack_toilet_access = true,
  guest_ack_consumables_policy = true,
  ack_version = '2026-01-08'
WHERE status = 'CONFIRMED'
  AND (guest_ack_toilet_access = false OR guest_ack_consumables_policy = false OR ack_version IS NULL);

-- Note: Acknowledgements are enforced in application logic at booking creation time
-- The constraint below ensures data integrity for CONFIRMED bookings
-- For PENDING bookings, validation happens in the booking dialog before submission
ALTER TABLE bookings
ADD CONSTRAINT confirmed_bookings_require_acknowledgements
CHECK (
  (status = 'CONFIRMED' AND guest_ack_toilet_access = true AND guest_ack_consumables_policy = true)
  OR status != 'CONFIRMED'
);

-- Add comments for documentation
COMMENT ON COLUMN listings.toilet_access IS 'Type of toilet access: shared, private, limited, or none';
COMMENT ON COLUMN listings.toilet_access_notes IS 'Required explanation when toilet_access is limited or none';
COMMENT ON COLUMN listings.consumables_policy IS 'Policy text about consumables/perishables. Default platform text with optional host notes appended';
COMMENT ON COLUMN listings.provides_toilet_paper IS 'Whether host provides toilet paper (default true)';
COMMENT ON COLUMN listings.provides_pantry_staples IS 'Whether host provides basic pantry staples like oil/salt/pepper (default false)';
COMMENT ON COLUMN listings.provides_groceries IS 'Whether host provides groceries/ingredients (default false)';
COMMENT ON COLUMN bookings.guest_ack_toilet_access IS 'Guest acknowledgement of toilet access policy (required for booking)';
COMMENT ON COLUMN bookings.guest_ack_consumables_policy IS 'Guest acknowledgement of consumables policy (required for booking)';
COMMENT ON COLUMN bookings.ack_version IS 'Version string for policy copy auditing (e.g., "2026-01-08")';
