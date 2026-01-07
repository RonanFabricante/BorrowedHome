-- Add additional_instructions column to listings table
ALTER TABLE listings
ADD COLUMN IF NOT EXISTS additional_instructions TEXT;

-- Add comment for documentation
COMMENT ON COLUMN listings.additional_instructions IS 'Optional free-text field for hosts to share additional information with guests before booking (access notes, exclusions, special considerations). Max 1000 characters.';
