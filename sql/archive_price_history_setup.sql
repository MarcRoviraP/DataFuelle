-- Setup for automated archiving of public.price_history to Supabase Storage.
-- 1. Drop redundant B-tree index (unique_station_recorded_at already indexes (station_id, recorded_at)
--    and Postgres scans B-tree indexes backwards for DESC queries). Saves ~343 MB immediately.
DROP INDEX IF EXISTS public.idx_price_history_station_date;

-- 2. Add a tiny (~48 KB) BRIN index on recorded_at for fast archival range scans.
CREATE INDEX IF NOT EXISTS idx_price_history_recorded_at_brin
  ON public.price_history USING brin (recorded_at);

-- 3. Batched delete helper callable ONLY by service_role to avoid statement timeouts and long locks.
CREATE OR REPLACE FUNCTION public.delete_price_history_batch(
  p_year integer,
  p_cutoff timestamptz,
  p_max_id bigint,
  p_batch_size integer DEFAULT 5000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
  v_year_start timestamptz := make_timestamptz(p_year, 1, 1, 0, 0, 0, 'UTC');
  v_year_end   timestamptz := make_timestamptz(p_year + 1, 1, 1, 0, 0, 0, 'UTC');
BEGIN
  WITH to_delete AS (
    SELECT id
    FROM public.price_history
    WHERE id <= p_max_id
      AND recorded_at >= v_year_start
      AND recorded_at < LEAST(p_cutoff, v_year_end)
    ORDER BY id
    LIMIT p_batch_size
  )
  DELETE FROM public.price_history ph
  USING to_delete td
  WHERE ph.id = td.id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_price_history_batch(integer, timestamptz, bigint, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_price_history_batch(integer, timestamptz, bigint, integer)
  TO service_role;
