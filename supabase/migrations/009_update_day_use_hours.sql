-- Migration: Update day-use hours from 9pm to 6pm
-- Standardizes BorrowedHome day-use hours to 7am-6pm

-- Step 1: Update existing availability records that exceed 6pm to 6pm
-- This must happen BEFORE modifying constraints
UPDATE listing_availability
SET end_time = '18:00:00'
WHERE end_time > '18:00:00';

-- Step 2: Drop the old constraint on listing_availability.end_time
-- Find and drop the constraint that checks end_time <= '21:00:00'
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    -- Find the constraint name that checks end_time
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'listing_availability'::regclass
      AND contype = 'c'
      AND (pg_get_constraintdef(oid) LIKE '%end_time%21:00%' 
           OR pg_get_constraintdef(oid) LIKE '%end_time <= ''21:00:00''%');
    
    -- Drop it if found
    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE listing_availability DROP CONSTRAINT %I', constraint_name);
    END IF;
END $$;

-- Step 3: Add the new constraint for listing_availability (only if it doesn't exist)
DO $$
BEGIN
    -- Check if the constraint already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'listing_availability'::regclass
          AND conname = 'listing_availability_end_time_check'
    ) THEN
        ALTER TABLE listing_availability
        ADD CONSTRAINT listing_availability_end_time_check 
        CHECK (end_time <= '18:00:00'); -- Day use only: end by 6pm
    END IF;
END $$;

-- Step 4: Handle bookings.end_at constraint
DO $$
DECLARE
    constraint_name TEXT;
    constraint_def TEXT;
BEGIN
    -- Check if bookings_end_at_check already exists
    SELECT conname, pg_get_constraintdef(oid) INTO constraint_name, constraint_def
    FROM pg_constraint
    WHERE conrelid = 'bookings'::regclass
      AND conname = 'bookings_end_at_check';
    
    -- If it exists, check its definition
    IF constraint_name IS NOT NULL THEN
        -- If it has the old definition (<= 21), drop it so we can recreate with <= 18
        IF constraint_def LIKE '%21%' THEN
            EXECUTE format('ALTER TABLE bookings DROP CONSTRAINT %I', constraint_name);
        END IF;
        -- If it has the new definition (<= 18), we're done - don't recreate
    ELSE
        -- Constraint doesn't exist with our name, find and drop any old constraint
        SELECT conname INTO constraint_name
        FROM pg_constraint
        WHERE conrelid = 'bookings'::regclass
          AND contype = 'c'
          AND (pg_get_constraintdef(oid) LIKE '%EXTRACT(HOUR%21%'
               OR pg_get_constraintdef(oid) LIKE '%EXTRACT(HOUR FROM end_at) <= 21%');
        
        -- Drop old constraint if found
        IF constraint_name IS NOT NULL THEN
            EXECUTE format('ALTER TABLE bookings DROP CONSTRAINT %I', constraint_name);
        END IF;
        
        -- Add the new constraint
        ALTER TABLE bookings
        ADD CONSTRAINT bookings_end_at_check 
        CHECK (EXTRACT(HOUR FROM end_at) <= 18); -- Day use only: end by 6pm
    END IF;
END $$;

-- Note: Existing bookings with end_at > 6pm are left as-is for historical accuracy
-- New bookings will be constrained by the CHECK constraint above
