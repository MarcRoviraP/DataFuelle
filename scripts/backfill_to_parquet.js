import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const API_BASE = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestresHist/';
const START_YEAR = 2007;
const END_YEAR = 2026;
const FINAL_DATE = new Date('2026-04-28');
const DATA_DIR = 'data/year';
const VALID_IDS_FILE = 'data/valid_ids.json';
const DUCKDB_BIN = './scratch/duckdb';
const CONCURRENCY = 20;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

let validIds = new Set();
try {
    const ids = JSON.parse(fs.readFileSync(VALID_IDS_FILE, 'utf8'));
    validIds = new Set(ids.map(id => parseInt(id)));
    console.log(`Loaded ${validIds.size} valid station IDs.`);
} catch (e) {
    console.error('Error loading valid_ids.json:', e.message);
    process.exit(1);
}

const parseMitecoNumber = (val) => {
    if (typeof val === 'number') return val;
    if (!val) return null;
    const n = parseFloat(val.replace(',', '.'));
    return (isNaN(n) || n < 0.1) ? null : n;
};

async function fetchDay(dateStr) {
    try {
        const response = await fetch(`${API_BASE}${dateStr}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json();
        const data = json.ListaEESSPrecio || [];
        
        return data.map(s => {
            const id = parseInt(s.IDEESS);
            if (!validIds.has(id)) return null;
            return {
                station_id: id,
                price_95: parseMitecoNumber(s['Precio Gasolina 95 E5']),
                price_98: parseMitecoNumber(s['Precio Gasolina 98 E5']),
                price_diesel: parseMitecoNumber(s['Precio Gasoleo A']),
                recorded_at: dateStr.split('-').reverse().join('-')
            };
        }).filter(s => s !== null && (s.price_95 || s.price_98 || s.price_diesel));
    } catch (e) {
        console.error(`\nFailed to fetch ${dateStr}: ${e.message}`);
        return [];
    }
}

async function processYear(year) {
    const outputFile = path.join(DATA_DIR, `fuel_prices_${year}.parquet`);
    const tempJson = path.join(DATA_DIR, `temp_${year}.jsonl`);
    
    console.log(`\n--- Starting Year ${year} ---`);
    
    const dates = [];
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);
    
    for (let d = startDate; d <= endDate; d.setDate(d.getDate() + 1)) {
        if (d > FINAL_DATE) break;
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        dates.push(`${dd}-${mm}-${yyyy}`);
    }

    if (dates.length === 0) return;

    const allRecords = [];
    for (let i = 0; i < dates.length; i += CONCURRENCY) {
        const chunk = dates.slice(i, i + CONCURRENCY);
        const results = await Promise.all(chunk.map(d => fetchDay(d)));
        for (const dayRecords of results) {
            allRecords.push(...dayRecords);
        }
        process.stdout.write(`Progress ${year}: ${Math.min(i + CONCURRENCY, dates.length)}/${dates.length} days...\r`);
    }

    if (allRecords.length === 0) {
        console.log(`No records for ${year}, skipping.`);
        return;
    }

    // Write to NDJSON using a stream to avoid memory limits
    const writeStream = fs.createWriteStream(tempJson);
    for (const record of allRecords) {
        writeStream.write(JSON.stringify(record) + '\n');
    }
    await new Promise(resolve => writeStream.end(resolve));

    // Convert using DuckDB CLI
    try {
        execSync(`${DUCKDB_BIN} -c "COPY (SELECT * FROM read_json_auto('${tempJson}')) TO '${outputFile}' (FORMAT PARQUET, COMPRESSION ZSTD)"`);
        console.log(`\nYear ${year} completed. File: ${outputFile} (${(fs.statSync(outputFile).size / 1024 / 1024).toFixed(2)} MB)`);
    } catch (e) {
        console.error(`\nError converting ${year} to Parquet:`, e.message);
    } finally {
        if (fs.existsSync(tempJson)) fs.unlinkSync(tempJson);
    }
}

async function run() {
    for (let year = START_YEAR; year <= END_YEAR; year++) {
        const outputFile = path.join(DATA_DIR, `fuel_prices_${year}.parquet`);
        
        // Check if file already exists and is valid (via DuckDB)
        if (fs.existsSync(outputFile)) {
            try {
                execSync(`${DUCKDB_BIN} -c "SELECT count(*) FROM '${outputFile}'"`, { stdio: 'ignore' });
                console.log(`✅ Year ${year} already exists and is valid. Skipping.`);
                continue;
            } catch (e) {
                console.log(`⚠️ Year ${year} exists but is invalid. Re-processing...`);
            }
        }
        
        await processYear(year);
    }
    console.log('\n✨ BACKFILL (YEARLY via DuckDB) COMPLETED SUCCESSFULLY ✨');
}

run().catch(console.error);
