-- Harden expire_unpaid_bookings so cron/service-role can always run it,
-- and ensure search_path is fixed (SECURITY DEFINER best practice).

CREATE OR REPLACE FUNCTION public.expire_unpaid_bookings()
RETURNS TABLE(expired_count INTEGER, expired_ids UUID[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_ids UUID[];
  v_count INTEGER;
BEGIN
  WITH expired AS (
    UPDATE public.bookings
    SET
      status = 'EXPIRED',
      expired_at = NOW()
    WHERE status = 'PAYMENT_PENDING'
      AND payment_deadline_at IS NOT NULL
      AND payment_deadline_at < NOW()
    RETURNING id
  )
  SELECT
    COUNT(*)::INTEGER,
    ARRAY_AGG(id)
  INTO v_count, v_expired_ids
  FROM expired;

  RETURN QUERY SELECT COALESCE(v_count, 0), COALESCE(v_expired_ids, ARRAY[]::UUID[]);
END;
$$;

REVOKE ALL ON FUNCTION public.expire_unpaid_bookings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_unpaid_bookings() FROM anon;
REVOKE ALL ON FUNCTION public.expire_unpaid_bookings() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.expire_unpaid_bookings() TO service_role;

COMMENT ON FUNCTION public.expire_unpaid_bookings() IS
  'Expires PAYMENT_PENDING bookings past payment_deadline_at. Callable by service_role (cron / Edge Functions).';
