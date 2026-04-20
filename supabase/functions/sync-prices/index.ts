import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const API_URL = "https://api.precioil.es/estaciones/radio?latitud=40.4168&longitud=-3.7038&radio=5000&limite=15000";

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
        "Accept": "application/json",
        "User-Agent": "datafuelle-sync/2.1"
      }
    });

    const stationsList = await response.json();
    if (!Array.isArray(stationsList) || stationsList.length === 0) {
      throw new Error("Invalid or empty response from API");
    }

    console.log(`📡 Received ${stationsList.length} stations. Syncing metadata and prices...`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const recordedAt = new Date().toISOString();

    const CHUNK_SIZE = 500; 
    let totalProcessed = 0;
    let totalInsertedHistory = 0;
    let totalSkippedHistory = 0;
    let stationsUpdated = 0;

    for (let i = 0; i < stationsList.length; i += CHUNK_SIZE) {
      const chunk = stationsList.slice(i, i + CHUNK_SIZE);
      const chunkStationIds = chunk.map((s: any) => s.idEstacion || s.id_estacion).filter(Boolean);

      // 1. Get latest history for comparison (to decide if we add to history)
      const { data: latestRecords } = await supabase
        .from("price_history")
        .select("station_id, price_95, price_98, price_diesel")
        .in("station_id", chunkStationIds)
        .order("station_id")
        .order("recorded_at", { ascending: false });

      const latestMap = new Map();
      latestRecords?.forEach(r => {
        if (!latestMap.has(r.station_id)) {
          latestMap.set(r.station_id, {
            p95: Number(r.price_95),
            p98: Number(r.price_98),
            pD: Number(r.price_diesel)
          });
        }
      });

      // 2. Prepare Station Metadata + Current Prices
      const stationsData = chunk.map((s: any) => {
        const id = s.idEstacion || s.id_estacion;
        if (!id) return null;

        const p95 = parseFloat(s.Gasolina95 || s.gasolina95 || 0);
        const pDiesel = parseFloat(s.Diesel || s.diesel || 0);
        const p98 = parseFloat(s.Gasolina98 || s.gasolina98 || 0);

        return {
          external_id: id,
          name: String(s.nombreEstacion || s.rotulo || s.marca || "Unknown").trim(),
          brand: String(s.marca || s.rotulo || "Unknown").trim(),
          address: s.direccion || s.Direccion || "",
          latitude: parseFloat(s.latitud || s.Latitud || 0),
          longitude: parseFloat(s.longitud || s.Longitud || 0),
          municipality: s.nombreMunicipio || s.municipio || "",
          province: s.provincia || s.Provincia || "",
          postal_code: s.codPostal || s.cp || "",
          schedule: s.horario || "",
          updated_at: recordedAt,
          // Denormalized prices for fast filtering
          last_price_95: p95 > 0 ? p95 : null,
          last_price_98: p98 > 0 ? p98 : null,
          last_price_diesel: pDiesel > 0 ? pDiesel : null
        };
      }).filter(Boolean);

      const { error: stationError } = await supabase.from("stations").upsert(stationsData, { onConflict: "external_id" });
      if (!stationError) stationsUpdated += (stationsData as any[]).length;

      // 3. Prepare Price History (only if changed based on latestMap)
      const pricesToInsert = chunk.map((s: any) => {
        const id = s.idEstacion || s.id_estacion;
        const p95 = parseFloat(s.Gasolina95 || s.gasolina95 || 0);
        const pDiesel = parseFloat(s.Diesel || s.diesel || 0);
        const p98 = parseFloat(s.Gasolina98 || s.gasolina98 || 0);

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
