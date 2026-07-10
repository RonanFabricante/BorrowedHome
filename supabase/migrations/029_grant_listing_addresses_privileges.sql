-- Migration 029: Grant Data API privileges for listing_addresses (+ restore listings)
--
-- Supabase no longer auto-grants new public tables to anon/authenticated.
-- Migration 028 created listing_addresses with RLS but no GRANTs, so host
-- create-listing fails with 42501 permission denied.
-- Also re-assert grants on listings in case they were tightened via Dashboard.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.listing_addresses TO authenticated;
GRANT SELECT ON TABLE public.listing_addresses TO anon;
GRANT ALL ON TABLE public.listing_addresses TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.listings TO authenticated;
GRANT SELECT ON TABLE public.listings TO anon;
GRANT ALL ON TABLE public.listings TO service_role;

-- Ensure related listing child tables remain reachable (same create flow)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.listing_spaces TO authenticated;
GRANT SELECT ON TABLE public.listing_spaces TO anon;
GRANT ALL ON TABLE public.listing_spaces TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.listing_photos TO authenticated;
GRANT SELECT ON TABLE public.listing_photos TO anon;
GRANT ALL ON TABLE public.listing_photos TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.listing_availability TO authenticated;
GRANT SELECT ON TABLE public.listing_availability TO anon;
GRANT ALL ON TABLE public.listing_availability TO service_role;
