-- Record Guest Terms at signup inside handle_new_user (SECURITY DEFINER).
-- Client-side inserts into user_legal_acceptances often fail RLS right after
-- signUp because auth.uid() is still null (email confirm / session race).

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_terms_version TEXT;
BEGIN
  INSERT INTO public.profiles (id, full_name, date_of_birth, is_guest, is_host)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NULLIF(NEW.raw_user_meta_data->>'date_of_birth', '')::DATE,
    true,
    false
  )
  ON CONFLICT (id) DO NOTHING;

  -- Signup metadata: accepted_guest_terms + optional guest_terms_version
  IF COALESCE(NEW.raw_user_meta_data->>'accepted_guest_terms', '') IN ('true', 'True', '1') THEN
    v_terms_version := NULLIF(TRIM(NEW.raw_user_meta_data->>'guest_terms_version'), '');
    IF v_terms_version IS NULL THEN
      v_terms_version := '2026-01-08-au-v1';
    END IF;

    INSERT INTO public.user_legal_acceptances (
      user_id,
      doc_type,
      doc_version,
      accepted_at,
      metadata
    )
    VALUES (
      NEW.id,
      'guest_terms',
      v_terms_version,
      NOW(),
      jsonb_build_object('signup', true, 'source', 'handle_new_user')
    )
    ON CONFLICT (user_id, doc_type, doc_version) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION handle_new_user() IS
  'Creates profile on signup; records guest_terms acceptance from user metadata when present';
