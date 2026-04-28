import fs from 'fs';
import path from 'path';
import parquet from 'parquetjs-lite';

const API_BASE = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestresHist/';
const START_YEAR = 2007;
const END_YEAR = 2026;
const FINAL_DATE = new Date('2026-04-28');
const DATA_DIR = 'data';
const VALID_IDS_FILE = path.join(DATA_DIR, 'valid_ids.json');
const CONCURRENCY = 20;

if (!fs.existsSync(VALID_IDS_FILE)) {
    console.error('Error: valid_ids.json not found in data/ folder.');
    process.exit(1);
}
const validIds = new Set(JSON.parse(fs.readFileSync(VALID_IDS_FILE, 'utf8')));
console.log(`Loaded ${validIds.size} valid station IDs.`);

const schema = new parquet.ParquetSchema({
    station_id: { type: 'INT32' },
    price_95: { type: 'DOUBLE', optional: true },
    price_98: { type: 'DOUBLE', optional: true },
    price_diesel: { type: 'DOUBLE', optional: true },
    recorded_at: { type: 'UTF8' }
});

async function fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e) {
            if (i === retries - 1) throw e;
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }
}

function formatDate(date) {
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();
    return `${d}-${m}-${y}`;
}

async function processQuarter(year, quarter) {
    const qName = `${year}_Q${quarter}`;
    console.log(`\n--- Starting ${qName} ---`);
    const outputFile = path.join(DATA_DIR, `fuel_prices_${qName}.parquet`);
    const writer = await parquet.ParquetWriter.openFile(schema, outputFile);

    // Quarter dates
    const qStartMonth = (quarter - 1) * 3;
    const startDate = new Date(year, qStartMonth, 1);
    let endDate = new Date(year, qStartMonth + 3, 0);
    
    if (startDate > FINAL_DATE) {
        await writer.close();
        fs.unlinkSync(outputFile);
        return;
    }
    if (endDate > FINAL_DATE) endDate = FINAL_DATE;
    
    const dates = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        dates.push(new Date(d));
    }

    if (dates.length === 0) {
        await writer.close();
        fs.unlinkSync(outputFile);
        return;
    }

    let completed = 0;
    const total = dates.length;

    const worker = async () => {
        while (dates.length > 0) {
            const date = dates.shift();
            const dateStr = formatDate(date);
            const sqlDate = date.toISOString().split('T')[0];

            try {
                const data = await fetchWithRetry(`${API_BASE}${dateStr}`);
                const list = data.ListaEESSPrecio || [];
                
                for (const s of list) {
                    const id = parseInt(s.IDEESS);
                    if (!validIds.has(id)) continue;

                    const p95 = s["Precio Gasolina 95 E5"] ? parseFloat(s["Precio Gasolina 95 E5"].replace(',', '.')) : null;
                    const p98 = s["Precio Gasolina 98 E5"] ? parseFloat(s["Precio Gasolina 98 E5"].replace(',', '.')) : null;
                    const pDiesel = s["Precio Gasoleo A"] ? parseFloat(s["Precio Gasoleo A"].replace(',', '.')) : null;
                    
                    if (p95 || p98 || pDiesel) {
                        await writer.appendRow({
                            station_id: id,
                            price_95: p95,
                            price_98: p98,
                            price_diesel: pDiesel,
                            recorded_at: sqlDate
                        });
                    }
                }
                
                completed++;
                process.stdout.write(`\rProgress ${qName}: ${completed}/${total} days...`);
            } catch (e) {
                console.error(`\nFailed to fetch ${dateStr}: ${e.message}`);
            }
        }
    };

    const workers = Array.from({ length: CONCURRENCY }, () => worker());
    await Promise.all(workers);

    await writer.close();
    console.log(`\n${qName} completed. File: ${outputFile}`);
}

async function main() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
    // Limpiar parquets viejos para no mezclar
    const files = fs.readdirSync(DATA_DIR);
    for (const file of files) {
        if (file.startsWith('fuel_prices_') && file.endsWith('.parquet')) {
            fs.unlinkSync(path.join(DATA_DIR, file));
        }
    }

    for (let y = START_YEAR; y <= END_YEAR; y++) {
        for (let q = 1; q <= 4; q++) {
            await processQuarter(y, q);
        }
    }
    console.log('\n\n✨ BACKFILL (QUARTERLY) COMPLETED SUCCESSFULLY ✨');
}

main().catch(console.error);
