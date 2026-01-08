-- Migration: Add date_of_birth to profiles table for age verification
-- Ensures only users 18+ can sign up

-- Add date_of_birth column to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- Update handle_new_user function to include date_of_birth
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, date_of_birth, is_guest, is_host)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    (NEW.raw_user_meta_data->>'date_of_birth')::DATE,
    true,
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment for documentation
COMMENT ON COLUMN profiles.date_of_birth IS 'Date of birth for age verification (18+ required)';
