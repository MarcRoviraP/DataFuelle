import { createClient } from '@supabase/supabase-js';

/**
 * Scheduled Cron Function — Runs directly as a background function.
 * Schedule: 00:00 and 12:00 UTC daily.
 * 
 * Architecture: Cron IS the background function. No HTTP indirection needed.
 * Background functions can run up to 15 minutes (vs 10s for regular functions).
 */

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const API_URL = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';

const parseMitecoNumber = (val: string | number): number => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  return parseFloat(val.replace(',', '.')) || 0;
};

export const handler = async (_event: any) => {
  const startTime = Date.now();
  console.log('⏰ [Cron] sync-miteco-cron triggered at', new Date().toISOString());

  // Guard: fail fast if env vars missing
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    const msg = '❌ [Cron] CRITICAL: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars. Check Netlify dashboard > Site configuration > Environment variables.';
    console.error(msg);
    return { statusCode: 500, body: msg };
  }

  try {
    // 1. Fetch MITECO data
    console.log(`📡 [Cron] Fetching from MITECO API...`);
    const response = await fetch(API_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DataFuelle-Cron/1.0)'
      }
    });

    if (!response.ok) {
      throw new Error(`MITECO API error: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    const stationsList = json.ListaEESSPrecio;

    if (!Array.isArray(stationsList) || stationsList.length === 0) {
      throw new Error('Invalid or empty response from MITECO API');
    }

    console.log(`✅ [Cron] Received ${stationsList.length} stations from MITECO`);

    // 2. Init Supabase with service role (bypasses RLS)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Test connection
    const { error: testError } = await supabase.from('stations').select('count', { count: 'exact', head: true });
    if (testError) {
      throw new Error(`Supabase connection failed: ${testError.message}`);
    }
    console.log('✅ [Cron] Supabase connection OK');

    const recordedAt = new Date().toISOString();
    const CHUNK_SIZE = 500;
    let totalInsertedHistory = 0;
    let totalSkippedHistory = 0;
    let stationsUpdated = 0;

    // 3. Process in chunks
    for (let i = 0; i < stationsList.length; i += CHUNK_SIZE) {
      const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
      const totalChunks = Math.ceil(stationsList.length / CHUNK_SIZE);
      console.log(`  -> Chunk ${chunkNum}/${totalChunks}...`);

      const chunk = stationsList.slice(i, i + CHUNK_SIZE);
      const chunkStationIds = chunk.map((s: any) => parseInt(s.IDEESS)).filter(Boolean);

      // Get latest prices for change detection
      const { data: latestRecords, error: fetchError } = await supabase
        .from('price_history')
        .select('station_id, price_95, price_98, price_diesel')
        .in('station_id', chunkStationIds)
        .order('station_id')
        .order('recorded_at', { ascending: false });

      if (fetchError) {
        console.error(`  ❌ Error fetching history for chunk ${chunkNum}:`, fetchError.message);
        continue;
      }

      // Build map of last known prices per station
      const latestMap = new Map<number, { p95: number; p98: number; pD: number }>();
      latestRecords?.forEach(r => {
        if (!latestMap.has(r.station_id)) {
          latestMap.set(r.station_id, {
            p95: Number(r.price_95),
            p98: Number(r.price_98),
            pD: Number(r.price_diesel)
          });
        }
      });

      // Upsert station metadata
      const stationsData = chunk.map((s: any) => {
        const id = parseInt(s.IDEESS);
        if (!id) return null;
        const p95 = parseMitecoNumber(s['Precio Gasolina 95 E5']);
        const p98 = parseMitecoNumber(s['Precio Gasolina 98 E5']);
        const pDiesel = parseMitecoNumber(s['Precio Gasoleo A']);
        return {
          external_id: id,
          name: String(s['Rótulo'] || 'Unknown').trim(),
          brand: String(s['Rótulo'] || 'Unknown').trim(),
          address: s['Dirección'] || '',
          latitude: parseMitecoNumber(s['Latitud']),
          longitude: parseMitecoNumber(s['Longitud (WGS84)']),
          municipality: s['Municipio'] || '',
          province: s['Provincia'] || '',
          postal_code: s['C.P.'] || '',
          schedule: s['Horario'] || '',
          updated_at: recordedAt,
          last_price_95: p95 > 0 ? p95 : null,
          last_price_98: p98 > 0 ? p98 : null,
          last_price_diesel: pDiesel > 0 ? pDiesel : null
        };
      }).filter(Boolean);

      const { error: stationError } = await supabase.from('stations').upsert(stationsData, { onConflict: 'external_id' });
      if (stationError) {
        console.error(`  ❌ Error upserting stations chunk ${chunkNum}:`, stationError.message);
      } else {
        stationsUpdated += stationsData.length;
      }

      // Insert only changed prices
      const pricesToInsert = chunk.map((s: any) => {
        const id = parseInt(s.IDEESS);
        const p95 = parseMitecoNumber(s['Precio Gasolina 95 E5']);
        const p98 = parseMitecoNumber(s['Precio Gasolina 98 E5']);
        const pDiesel = parseMitecoNumber(s['Precio Gasoleo A']);

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
        const { error: priceError } = await supabase.from('price_history').insert(pricesToInsert);
        if (priceError) {
          console.error(`  ❌ Error inserting price history chunk ${chunkNum}:`, priceError.message);
        } else {
          totalInsertedHistory += pricesToInsert.length;
        }
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const summary = `✅ [Cron] Completed in ${duration}s | Stations updated: ${stationsUpdated} | Price records inserted: ${totalInsertedHistory} | Skipped (no change): ${totalSkippedHistory}`;
    console.log(summary);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, duration, stationsUpdated, totalInsertedHistory, totalSkippedHistory })
    };

  } catch (error: any) {
    console.error('❌ [Cron] Critical error:', error.message || error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Unknown error' })
    };
  }
};
