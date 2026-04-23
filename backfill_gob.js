import fs from 'fs';

/**
 * gob_backfill.js
 * Generates SQL for historical fuel prices from the Spanish Government API.
 * 
 * Usage: node gob_backfill.js
 */

const API_BASE = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestresHist/';
const START_DATE = new Date('2007-01-01');
const END_DATE = new Date('2025-09-01'); // today
const OUTPUT_FILE = 'gob_backfill_history.sql';

// We'll fetch the IDs from the DB and pass them to the script or read from a file.
// For now, I'll assume we have a 'valid_ids.json' file with [id1, id2, ...]
const VALID_IDS_FILE = 'valid_ids.json';

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url);
      if (resp.ok) return await resp.json();
      console.warn(`[${url}] Attempt ${i + 1} failed: ${resp.status}`);
    } catch (e) {
      console.error(`[${url}] Attempt ${i + 1} error: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 2000 * (i + 1)));
  }
  return null;
}

function formatDate(date) {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
}

function formatSqlDate(date) {
  return date.toISOString().split('T')[0] + ' 00:00:00+00';
}

async function main() {
  if (!fs.existsSync(VALID_IDS_FILE)) {
    console.error(`Missing ${VALID_IDS_FILE}. Please generate it first.`);
    process.exit(1);
  }

  const validIds = new Set(JSON.parse(fs.readFileSync(VALID_IDS_FILE, 'utf8')));
  console.log(`Loaded ${validIds.size} valid station IDs.`);

  const stream = fs.createWriteStream(OUTPUT_FILE, { flags: 'a' });
  stream.write('-- GOVT BACKFILL SQL\n\n');

  let current = new Date(START_DATE);
  while (current <= END_DATE) {
    const dateStr = formatDate(current);
    const sqlDate = formatSqlDate(current);
    console.log(`Processing ${dateStr}...`);

    const data = await fetchWithRetry(`${API_BASE}${dateStr}`);
    if (!data || !data.ListaEESSPrecio) {
      console.error(`Failed to get data for ${dateStr}`);
      current.setDate(current.getDate() + 1);
      continue;
    }

    const stations = data.ListaEESSPrecio;
    const rows = stations
      .filter(s => validIds.has(parseInt(s.IDEESS)))
      .map(s => {
        const id = parseInt(s.IDEESS);
        const p95 = s["Precio Gasolina 95 E5"] ? parseFloat(s["Precio Gasolina 95 E5"].replace(',', '.')) : null;
        const p98 = s["Precio Gasolina 98 E5"] ? parseFloat(s["Precio Gasolina 98 E5"].replace(',', '.')) : null;
        const pDiesel = s["Precio Gasoleo A"] ? parseFloat(s["Precio Gasoleo A"].replace(',', '.')) : null;

        if (!p95 && !p98 && !pDiesel) return null;

        return `(${id}, ${p95 ?? 'NULL'}, ${p98 ?? 'NULL'}, ${pDiesel ?? 'NULL'}, '${sqlDate}')`;
      })
      .filter(Boolean);

    if (rows.length > 0) {
      // Chunk inserts to avoid massive single statements
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunkRows = rows.slice(i, i + CHUNK);
        stream.write(`INSERT INTO public.price_history (station_id, price_95, price_98, price_diesel, recorded_at) VALUES\n`);
        stream.write(chunkRows.join(',\n'));
        stream.write('\nON CONFLICT (station_id, recorded_at) DO NOTHING;\n\n');
      }
      console.log(`  Inserted ${rows.length} records.`);
    } else {
      console.log(`  No matching stations found for ${dateStr}.`);
    }

    current.setDate(current.getDate() + 1);
    // Pause to be polite to the API
    await new Promise(r => setTimeout(r, 1000));
  }

  stream.end();
  console.log(`Finished. SQL saved to ${OUTPUT_FILE}`);
}

main();
