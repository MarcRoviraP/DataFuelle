import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Official Ministry API - All stations in Spain
const MINISTRY_API_URL = "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/";

Deno.serve(async (req: Request) => {
  try {
    console.log("Starting fuel price synchronization...");
    
    // 1. Fetch data from Ministry API
    const response = await fetch(MINISTRY_API_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json"
      }
    });
    if (!response.ok) throw new Error(`Ministry API error: ${response.status}`);
    const data = await response.json();
    const stationsList = data.ListaEESSPrecio || [];
    
    console.log(`Fetched ${stationsList.length} stations from Ministry API`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 2. Process and prepare data in chunks for Supabase
    const CHUNK_SIZE = 1000;
    let processed = 0;

    for (let i = 0; i < stationsList.length; i += CHUNK_SIZE) {
      const chunk = stationsList.slice(i, i + CHUNK_SIZE);
      
      const stationsData = chunk.map((s: any) => ({
        external_id: parseInt(s.IDEESS),
        name: s.Rótulo,
        brand: s.Rótulo,
        address: s.Dirección,
        latitude: parseFloat(s.Latitud?.replace(",", ".") || "0"),
        longitude: parseFloat((s.Longitud || s["Longitud (WGS84)"])?.replace(",", ".") || "0"),
        municipality: s.Municipio,
        province: s.Provincia,
        postal_code: s["C.P."],
        schedule: s.Horario,
        updated_at: new Date().toISOString()
      }));

      // Upsert stations metadata
      const { error: stationError } = await supabase
        .from("stations")
        .upsert(stationsData, { onConflict: "external_id" });

      if (stationError) {
        console.error(`Error upserting stations chunk starting at ${i}:`, stationError);
      }

      // Insert pricing history
      const pricesData = chunk.map((s: any) => {
        const p95 = s["Precio Gasolina 95 E5"]?.replace(",", ".");
        const p98 = s["Precio Gasolina 98 E5"]?.replace(",", ".");
        const pDiesel = s["Precio Gasoleo A"]?.replace(",", ".");

        return {
          station_id: parseInt(s.IDEESS),
          price_95: p95 && !isNaN(parseFloat(p95)) ? parseFloat(p95) : null,
          price_98: p98 && !isNaN(parseFloat(p98)) ? parseFloat(p98) : null,
          price_diesel: pDiesel && !isNaN(parseFloat(pDiesel)) ? parseFloat(pDiesel) : null,
          recorded_at: new Date().toISOString()
        };
      }).filter(h => h.price_95 !== null || h.price_98 !== null || h.price_diesel !== null);

      const { error: priceError } = await supabase
        .from("price_history")
        .insert(pricesData);

      if (priceError) {
        console.error(`Error inserting prices chunk starting at ${i}:`, priceError);
      }

      processed += chunk.length;
      console.log(`Processed ${processed}/${stationsList.length} stations...`);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      processed_stations: processed,
      timestamp: new Date().toISOString() 
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Sync error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
