import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/**
 * Alternative API endpoint (precioil.es) which has better performance 
 * and is not blocked by cloud IP firewalls like the official one.
 * We use a 5000km radius from central Madrid to fetch all of Spain.
 */
const API_URL = "https://api.precioil.es/estaciones/radio?latitud=40.4168&longitud=-3.7038&radio=5000&limite=15000";

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 2): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      console.warn(`Attempt ${i + 1} failed with status ${response.status}`);
    } catch (err) {
      console.error(`Attempt ${i + 1} failed: ${err.message}`);
      if (i === maxRetries - 1) throw err;
    }
    await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
  }
  throw new Error("Failed to fetch after retries");
}

Deno.serve(async (req: Request) => {
  try {
    console.log("Starting fuel price synchronization (using precioil.es mirror)...");
    
    const response = await fetchWithRetry(API_URL, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "datafuelle-sync/1.0"
      }
    });

    const stationsList = await response.json();
    console.log(`Success! Received ${stationsList.length} stations from alternative API.`);

    if (!Array.isArray(stationsList) || stationsList.length === 0) {
      throw new Error("Invalid or empty response from API");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const recordedAt = new Date().toISOString();

    // Process in smaller batches for better memory/transaction handling
    const CHUNK_SIZE = 1000;
    let totalProcessed = 0;

    for (let i = 0; i < stationsList.length; i += CHUNK_SIZE) {
      const chunk = stationsList.slice(i, i + CHUNK_SIZE);
      
      // 1. Prepare and filter stations metadata
      const stationsData = chunk.map((s: any) => {
        const id = s.idEstacion || s.id_estacion;
        if (!id) return null;

        const rawName = s.nombreEstacion || s.rotulo || s.marca || "Desconocida";
        const rawBrand = s.marca || s.rotulo || "Desconocida";

        return {
          external_id: id,
          name: String(rawName).trim(),
          brand: String(rawBrand).trim(),
          address: s.direccion || s.Direccion || "",
          latitude: parseFloat(s.latitud || s.Latitud || 0),
          longitude: parseFloat(s.longitud || s.Longitud || 0),
          municipality: s.nombreMunicipio || s.municipio || "",
          province: s.provincia || s.Provincia || "",
          postal_code: s.codPostal || s.cp || "",
          schedule: s.horario || "",
          updated_at: recordedAt
        };
      }).filter(Boolean);

      // Upsert stations
      const { error: stationError } = await supabase.from("stations").upsert(stationsData, { onConflict: "external_id" });
      if (stationError) console.error(`Error in stations chunk [${i}]:`, stationError);

      // 2. Prepare price data
      const pricesData = chunk.map((s: any) => {
        const id = s.idEstacion || s.id_estacion;
        const p95 = parseFloat(s.Gasolina95 || s.gasolina95 || s.precioG95 || 0);
        const pDiesel = parseFloat(s.Diesel || s.diesel || s.precioDiesel || 0);
        const p98 = parseFloat(s.Gasolina98 || s.gasolina98 || s.precioG98 || 0);

        if (isNaN(p95) && isNaN(pDiesel) && isNaN(p98)) return null;

        return {
          station_id: id,
          price_95: p95 > 0 ? p95 : null,
          price_diesel: pDiesel > 0 ? pDiesel : null,
          price_98: p98 > 0 ? p98 : null,
          recorded_at: recordedAt
        };
      }).filter(h => h && (h.price_95 || h.price_diesel || h.price_98));

      // Insert pricing
      const { error: priceError } = await supabase.from("price_history").insert(pricesData);
      if (priceError) {
        // Log but continue (might be duplicates if triggered too fast)
        console.warn(`Price insert warning [${i}]: ${priceError.message}`);
      }

      totalProcessed += chunk.length;
      if (i % 2000 === 0) console.log(`Progress: ${totalProcessed}/${stationsList.length}...`);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      processed: totalProcessed,
      timestamp: recordedAt 
    }), { headers: { "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Critical Sync Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});



