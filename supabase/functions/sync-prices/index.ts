import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const API_URL = "http://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres";

const parseMitecoNumber = (val: string | number): number => {
  if (typeof val === "number") return val;
  if (!val) return 0;
  return parseFloat(val.replace(",", ".")) || 0;
};

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      console.warn(`Attempt ${i + 1} failed with status ${response.status}`);
    } catch (err) {
      console.error(`Attempt ${i + 1} failed: ${err.message}`);
      if (i === maxRetries - 1) throw err;
    }
    await new Promise(r => setTimeout(r, 1500 * Math.pow(2, i)));
  }
  throw new Error("Failed to fetch after retries");
}

Deno.serve(async (req: Request) => {
  const startTime = Date.now();
  console.log("🚀 Starting fuel price synchronization (Priceil mirror)...");

  try {
    const response = await fetchWithRetry(API_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    const json = await response.json();
    const stationsList = json.ListaEESSPrecio;
    
    if (!Array.isArray(stationsList) || stationsList.length === 0) {
      throw new Error("Invalid or empty response from MITECO API");
    }

    console.log(`📡 Received ${stationsList.length} stations from Ministry. Syncing metadata and prices...`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const recordedAt = new Date().toISOString();

    const CHUNK_SIZE = 500; 
    let totalProcessed = 0;
    let totalInsertedHistory = 0;
    let totalSkippedHistory = 0;
    let stationsUpdated = 0;

    for (let i = 0; i < stationsList.length; i += CHUNK_SIZE) {
      const chunk = stationsList.slice(i, i + CHUNK_SIZE);
      const chunkStationIds = chunk.map((s: any) => parseInt(s.IDEESS)).filter(Boolean);

      // 1. Get latest known prices from `stations` (1 row per station, avoids 1000-row PostgREST cap)
      const { data: latestStations } = await supabase
        .from("stations")
        .select("external_id, last_price_95, last_price_98, last_price_diesel")
        .in("external_id", chunkStationIds);

      const latestMap = new Map<number, { p95: number; p98: number; pD: number }>();
      latestStations?.forEach(r => {
        latestMap.set(r.external_id, {
          p95: Number(r.last_price_95 ?? 0),
          p98: Number(r.last_price_98 ?? 0),
          pD: Number(r.last_price_diesel ?? 0)
        });
      });

      // 2. Prepare Station Metadata + Current Prices
      const stationsData = chunk.map((s: any) => {
        const id = parseInt(s.IDEESS);
        if (!id) return null;

        const p95 = parseMitecoNumber(s["Precio Gasolina 95 E5"]);
        const p98 = parseMitecoNumber(s["Precio Gasolina 98 E5"]);
        const pDiesel = parseMitecoNumber(s["Precio Gasoleo A"]);

        return {
          external_id: id,
          name: String(s["Rótulo"] || "Unknown").trim(),
          brand: String(s["Rótulo"] || "Unknown").trim(),
          address: s["Dirección"] || "",
          latitude: parseMitecoNumber(s["Latitud"]),
          longitude: parseMitecoNumber(s["Longitud (WGS84)"]),
          municipality: s["Municipio"] || "",
          province: s["Provincia"] || "",
          postal_code: s["C.P."] || "",
          schedule: s["Horario"] || "",
          updated_at: recordedAt,
          last_price_95: p95 > 0 ? p95 : null,
          last_price_98: p98 > 0 ? p98 : null,
          last_price_diesel: pDiesel > 0 ? pDiesel : null
        };
      }).filter(Boolean);

      const { error: stationError } = await supabase.from("stations").upsert(stationsData, { onConflict: "external_id" });
      if (stationError) console.error(`Error upserting stations chunk [${i}]:`, stationError);
      else stationsUpdated += (stationsData as any[]).length;

      // 3. Prepare Price History
      const pricesToInsert = chunk.map((s: any) => {
        const id = parseInt(s.IDEESS);
        const p95 = parseMitecoNumber(s["Precio Gasolina 95 E5"]);
        const p98 = parseMitecoNumber(s["Precio Gasolina 98 E5"]);
        const pDiesel = parseMitecoNumber(s["Precio Gasoleo A"]);

        if (p95 <= 0 && pDiesel <= 0 && p98 <= 0) return null;

        const last = latestMap.get(id);
        const hasChanged = !last || (
          Math.abs(last.p95 - p95) > 0.0001 || 
          Math.abs(last.pD - pDiesel) > 0.0001 || 
          Math.abs(last.p98 - p98) > 0.0001
        );

        if (!hasChanged) {
          totalSkippedHistory++;
          return null;
        }

        return {
          station_id: id,
          price_95: p95 > 0 ? p95 : null,
          price_diesel: pDiesel > 0 ? pDiesel : null,
          price_98: p98 > 0 ? p98 : null,
          recorded_at: recordedAt
        };
      }).filter(Boolean);

      if (pricesToInsert.length > 0) {
        const { error: priceError } = await supabase.from("price_history").insert(pricesToInsert);
        if (priceError) console.error(`Error in prices history [${i}]:`, priceError);
        else totalInsertedHistory += pricesToInsert.length;
      }

      totalProcessed += chunk.length;
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Multi-Sync Completed in ${duration}s!`);

    return new Response(JSON.stringify({ 
      success: true, 
      stats: {
        total: stationsList.length,
        updated_stations: stationsUpdated,
        inserted_history: totalInsertedHistory,
        skipped_history: totalSkippedHistory,
        duration_seconds: parseFloat(duration)
      },
      timestamp: recordedAt 
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    console.error("❌ Critical Multi-Sync Error:", error);
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
