-- Migration: Revert day-use hours from 6pm back to 9pm
-- Allows bookings to end by 9:00 PM instead of 6:00 PM

-- Step 1: Update any bookings that exceed 9pm to clamp to 9pm
-- This handles bookings that might have been created before the constraint was enforced
-- We update all violating bookings to ensure the constraint can be added
UPDATE bookings
SET end_at = date_trunc('day', end_at) + INTERVAL '21 hours'
WHERE EXTRACT(HOUR FROM end_at) > 21;

-- Step 2: Update bookings.end_at constraint from 6pm to 9pm
DO $$
DECLARE
    constraint_name TEXT;
    constraint_def TEXT;
BEGIN
    -- Check if bookings_end_at_check exists
    SELECT conname, pg_get_constraintdef(oid) INTO constraint_name, constraint_def
    FROM pg_constraint
    WHERE conrelid = 'bookings'::regclass
      AND conname = 'bookings_end_at_check';
    
    -- If it exists, drop it so we can recreate with 9pm
    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE bookings DROP CONSTRAINT %I', constraint_name);
    END IF;
    
    -- Add the new constraint for 9pm
    -- All violating rows have been updated above, so this should succeed
    ALTER TABLE bookings
    ADD CONSTRAINT bookings_end_at_check 
    CHECK (EXTRACT(HOUR FROM end_at) <= 21); -- Day use only: end by 9pm
END $$;

-- Step 2: Update listing_availability.end_time constraint from 6pm to 9pm
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    -- Find and drop the existing constraint
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'listing_availability'::regclass
      AND conname = 'listing_availability_end_time_check';
    
    -- Drop it if found
    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE listing_availability DROP CONSTRAINT %I', constraint_name);
    END IF;
    
    -- Add the new constraint for 9pm
    ALTER TABLE listing_availability
    ADD CONSTRAINT listing_availability_end_time_check 
    CHECK (end_time <= '21:00:00'); -- Day use only: end by 9pm
END $$;
