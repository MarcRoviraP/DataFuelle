import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const FUELMAPS_API = "https://fuelmaps.es/api.php?mode=history&limit=200&station=";

const BATCH_SIZE = 50; // max stations per invocation (keeps well within 25s timeout)

Deno.serve(async (req: Request) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Accept offset from POST body or query string
    let offset = 0;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        offset = Number(body.offset) || 0;
      } catch { /* no body — default to 0 */ }
    } else {
      const url = new URL(req.url);
      offset = Number(url.searchParams.get("offset")) || 0;
    }

    // 1. Get stations that don't yet have REAL history (more than 1 entry spanning different days)
    //    We identify "real" history as having at least 2 distinct recorded_at dates.
    //    Stations with only the fake single-day entry will also be included.
    const { data: needsHistory, error: needsErr } = await supabase.rpc("stations_needing_history", {
      p_offset: offset,
      p_limit: BATCH_SIZE,
    });

    // Fallback: if the RPC doesn't exist yet, just paginate all stations
    let stations: { external_id: number }[] = needsHistory ?? [];

    if (needsErr) {
      console.warn("RPC not available, falling back to paginate all:", needsErr.message);
      const { data: fallback, error: fe } = await supabase
        .from("stations")
        .select("external_id")
        .range(offset, offset + BATCH_SIZE - 1);
      if (fe) throw fe;
      stations = fallback ?? [];
    }

    console.log(`Offset ${offset}: processing ${stations.length} stations...`);

    let inserted = 0;
    let skipped = 0;
    let failed = 0;

    for (const station of stations) {
      const id = station.external_id;

      const response = await fetch(`${FUELMAPS_API}${id}`, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; datafuelle-backfill/1.0)" },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) { failed++; continue; }

      let json: any;
      try { json = await response.json(); } catch { failed++; continue; }

      const historyItems: any[] = json.data || json.historial || [];

      if (historyItems.length === 0) { skipped++; continue; }

      const mappedHistory = historyItems
        .map((h: any) => {
          const price95    = Number(h.p95  ?? h.PrecioGasolina95)  || null;
          const price98    = Number(h.p98  ?? h.PrecioGasolina98)  || null;
          const priceDiesel = Number(h.pa  ?? h.PrecioGasoleoA)    || null;

          // ts is a Unix timestamp (seconds)
          const ts = h.ts ?? h.timestamp;
          if (!ts) return null;

          return {
            station_id:   id,
            price_95:     price95    > 0 ? price95    : null,
            price_98:     price98    > 0 ? price98    : null,
            price_diesel: priceDiesel > 0 ? priceDiesel : null,
            recorded_at:  new Date(Number(ts) * 1000).toISOString(),
          };
        })
        .filter(Boolean)
        .filter((h: any) => h.price_95 || h.price_98 || h.price_diesel);

      if (mappedHistory.length === 0) { skipped++; continue; }

      const { error: upsertErr } = await supabase
        .from("price_history")
        .upsert(mappedHistory, { onConflict: "station_id,recorded_at" });

      if (upsertErr) {
        console.error(`Error for station ${id}:`, upsertErr.message);
        failed++;
      } else {
        inserted += mappedHistory.length;
      }
    }

    const nextOffset = offset + stations.length;

    return new Response(
      JSON.stringify({
        success:     true,
        offset,
        processed:   stations.length,
        inserted,
        skipped,
        failed,
        next_offset: stations.length < BATCH_SIZE ? null : nextOffset,
        done:        stations.length < BATCH_SIZE,
      }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
