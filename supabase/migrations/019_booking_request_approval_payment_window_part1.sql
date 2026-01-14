-- Migration Part 1: Add new enum values
-- This must be run first and committed before Part 2 can use the new enum values

-- Step 1: Add new status values to booking_status enum
-- Note: We'll add REQUESTED, ACCEPTED, PAYMENT_PENDING, EXPIRED
-- REJECTED already exists as DECLINED, so we'll keep DECLINED for backward compatibility

-- Add new status values (PostgreSQL doesn't support IF NOT EXISTS for enum values, so we check first)
DO $$ 
BEGIN
  -- Add REQUESTED if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'REQUESTED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'booking_status')) THEN
    ALTER TYPE booking_status ADD VALUE 'REQUESTED';
  END IF;
  
  -- Add ACCEPTED if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'ACCEPTED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'booking_status')) THEN
    ALTER TYPE booking_status ADD VALUE 'ACCEPTED';
  END IF;
  
  -- Add PAYMENT_PENDING if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PAYMENT_PENDING' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'booking_status')) THEN
    ALTER TYPE booking_status ADD VALUE 'PAYMENT_PENDING';
  END IF;
  
  -- Add EXPIRED if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'EXPIRED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'booking_status')) THEN
    ALTER TYPE booking_status ADD VALUE 'EXPIRED';
  END IF;
END $$;

-- Note: This migration must be committed before running Part 2
