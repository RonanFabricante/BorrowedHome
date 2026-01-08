-- Migration: Update day-use hours from 9pm to 6pm
-- Standardizes BorrowedHome day-use hours to 7am-6pm

-- Update listing_availability table constraint
ALTER TABLE listing_availability
DROP CONSTRAINT IF EXISTS listing_availability_end_time_check;

ALTER TABLE listing_availability
ADD CONSTRAINT listing_availability_end_time_check 
CHECK (end_time <= '18:00:00'); -- Day use only: end by 6pm

-- Update bookings table constraint
ALTER TABLE bookings
DROP CONSTRAINT IF EXISTS bookings_end_at_check;

ALTER TABLE bookings
ADD CONSTRAINT bookings_end_at_check 
CHECK (EXTRACT(HOUR FROM end_at) <= 18); -- Day use only: end by 6pm

-- Update existing availability records that exceed 6pm to 6pm
UPDATE listing_availability
SET end_time = '18:00:00'
WHERE end_time > '18:00:00';

-- Note: Existing bookings with end_at > 6pm are left as-is for historical accuracy
-- New bookings will be constrained by the CHECK constraint above
