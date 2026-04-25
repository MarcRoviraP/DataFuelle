import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const API_URL = "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres";
// Fallback alternativo si el de arriba falla
const API_URL_ALT = "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/";

const parseMitecoNumber = (val: string | number): number => {
  if (typeof val === "number") return val;
  if (!val) return 0;
  return parseFloat(val.replace(",", ".")) || 0;
};

export const handler = async () => {
  const startTime = Date.now();
  console.log("🚀 [DEBUG] Starting background sync from Netlify...");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ [DEBUG] Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
    return;
  }

  try {
    console.log(`📡 [DEBUG] Fetching from MITECO: ${API_URL}`);
    let response = await fetch(API_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    if (!response.ok) {
      console.warn(`⚠️ [DEBUG] First URL failed (${response.status}). Trying fallback URL...`);
      response = await fetch(API_URL_ALT, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });
    }

    if (!response.ok) {
      console.error(`❌ [DEBUG] MITECO API fetch failed. Status: ${response.status} ${response.statusText}`);
      return;
    }

    const json = await response.json();
    const stationsList = json.ListaEESSPrecio;
    
    if (!Array.isArray(stationsList) || stationsList.length === 0) {
      console.error("❌ [DEBUG] Invalid or empty response from MITECO API. Check JSON structure.");
      return;
    }

    console.log(`✅ [DEBUG] Successfully received ${stationsList.length} stations. Initializing Supabase client...`);
    console.log(`🔗 [DEBUG] Supabase URL: ${SUPABASE_URL}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Test connection
    console.log("⏳ [DEBUG] Testing Supabase connection with a simple query...");
    const { data: testData, error: testError } = await supabase.from("stations").select("count", { count: "exact", head: true });
    if (testError) {
      console.error("❌ [DEBUG] Supabase connection test failed:", testError);
      return;
    }
    console.log("✅ [DEBUG] Supabase connection test successful!");

    const recordedAt = new Date().toISOString();

    const CHUNK_SIZE = 500; 
    let totalInsertedHistory = 0;
    let totalSkippedHistory = 0;
    let stationsUpdated = 0;

    console.log(`📦 [DEBUG] Starting processing in chunks of ${CHUNK_SIZE}...`);

    for (let i = 0; i < stationsList.length; i += CHUNK_SIZE) {
      console.log(`  -> Processing chunk ${Math.floor(i/CHUNK_SIZE) + 1} / ${Math.ceil(stationsList.length/CHUNK_SIZE)}...`);
      const chunk = stationsList.slice(i, i + CHUNK_SIZE);
      const chunkStationIds = chunk.map((s: any) => parseInt(s.IDEESS)).filter(Boolean);

      // 1. Get latest history for comparison
      const { data: latestRecords, error: fetchError } = await supabase
        .from("price_history")
        .select("station_id, price_95, price_98, price_diesel")
        .in("station_id", chunkStationIds)
        .order("station_id")
        .order("recorded_at", { ascending: false });

      if (fetchError) {
        console.error(`  ❌ [DEBUG] Error fetching history for chunk ${i}:`, fetchError);
        continue;
      }

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
      if (stationError) {
        console.error(`  ❌ [DEBUG] Error upserting stations chunk [${i}]:`, stationError);
      } else {
        stationsUpdated += (stationsData as any[]).length;
      }

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
        if (priceError) console.error(`  ❌ [DEBUG] Error in prices history [${i}]:`, priceError);
        else totalInsertedHistory += pricesToInsert.length;
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ [DEBUG] Netlify Background Sync Completed in ${duration}s!`);
    console.log(`📊 Stats: Updated ${stationsUpdated} stations, Inserted ${totalInsertedHistory} history records, Skipped ${totalSkippedHistory} identical prices.`);

  } catch (error) {
    console.error("❌ [DEBUG] Critical Netlify Sync Error:", error);
  }
};
