import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://msetjsrlioiysxmgybdg.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZXRqc3JsaW9peXN4bWd5YmRnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjMzODQwNiwiZXhwIjoyMDkxOTE0NDA2fQ.V9t1wXP8fecHSPkMJS4YJz8JfLPlPGVsYQzkKZp_wjs';
const DUCKDB_BIN = './scratch/duckdb';
const DATA_DIR = './data';
const OUTPUT_FILE = path.join(DATA_DIR, 'gas_prices.parquet');
const STATIONS_DICT_FILE = path.join(DATA_DIR, 'stations_dict.json');
const MUNICIPIOS_DICT_FILE = path.join(DATA_DIR, 'municipios_dict.json');

const BUCKET_URL = `${SUPABASE_URL}/storage/v1/object/public/historical-data`;
const PARQUET_FILES = [
    `${BUCKET_URL}/fuel_prices_2024.parquet`,
    `${BUCKET_URL}/fuel_prices_2025.parquet`,
    `${BUCKET_URL}/fuel_prices_2026.parquet`
];

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function fetchAll(table, select = '*', filter = null) {
    let allData = [];
    let rangeStart = 0;
    const rangeSize = 1000;
    let hasMore = true;

    console.log(`📡 Bajando datos de ${table}...`);

    while (hasMore) {
        let query = supabase.from(table).select(select);
        if (filter) query = filter(query);
        
        const { data, error } = await query.range(rangeStart, rangeStart + rangeSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;

        allData.push(...data);
        rangeStart += rangeSize;
        process.stdout.write(`   -> Cargados ${allData.length} registros...\r`);
        if (data.length < rangeSize) hasMore = false;
    }
    console.log(`\n✅ ${table} completado.`);
    return allData;
}

async function run() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

    const stationsRaw = await fetchAll('stations', 'external_id, name, municipality, postal_code');
    
    const stationsDict = {};
    const municipiosDict = {};
    
    // Clean and sanitize stations in JS to avoid DuckDB conversion errors
    const cleanedStations = stationsRaw.map(s => {
        const id = parseInt(s.external_id);
        // Sanitize postal code: keep only digits from the start
        const cpMatch = (s.postal_code || '').match(/^\d+/);
        const cp = cpMatch ? parseInt(cpMatch[0]) : 0;

        if (!isNaN(id)) stationsDict[id] = s.name;
        if (cp > 0) municipiosDict[cp] = s.municipality;

        return {
            id: id,
            postal_code: cp
        };
    }).filter(s => !isNaN(s.id));

    fs.writeFileSync(STATIONS_DICT_FILE, JSON.stringify(stationsDict, null, 2));
    fs.writeFileSync(MUNICIPIOS_DICT_FILE, JSON.stringify(municipiosDict, null, 2));
    console.log(`📖 Diccionarios generados.`);

    const stationsFile = path.join(DATA_DIR, 'temp_stations.jsonl');
    fs.writeFileSync(stationsFile, cleanedStations.map(s => JSON.stringify(s)).join('\n'));

    const prices = await fetchAll('price_history', 'station_id, recorded_at, price_diesel, price_95, price_98');
    const pricesFile = path.join(DATA_DIR, 'temp_prices.jsonl');
    fs.writeFileSync(pricesFile, prices.map(p => JSON.stringify(p)).join('\n'));

    console.log('🦆 Procesando con DuckDB (Clean & Numeric)...');
    
    const parquetList = PARQUET_FILES.map(f => `'${f}'`).join(', ');

    const sql = `
        INSTALL httpfs;
        LOAD httpfs;

        CREATE TABLE stations AS SELECT * FROM read_json_auto('${stationsFile}');
        CREATE TABLE db_prices_raw AS SELECT * FROM read_json_auto('${pricesFile}');
        CREATE TABLE bucket_prices_raw AS SELECT * FROM read_parquet([${parquetList}]);

        CREATE TABLE all_prices AS 
        SELECT CAST(station_id AS INTEGER) as station_id, recorded_at::DATE as fecha, price_95, price_98, price_diesel FROM db_prices_raw
        UNION ALL
        SELECT CAST(station_id AS INTEGER) as station_id, recorded_at::DATE as fecha, price_95, price_98, price_diesel FROM bucket_prices_raw;

        CREATE TABLE daily_prices AS 
        SELECT 
            station_id, 
            fecha, 
            AVG(price_95) as p95, 
            AVG(price_98) as p98, 
            AVG(price_diesel) as pd
        FROM all_prices
        WHERE fecha >= (SELECT MAX(fecha) FROM all_prices) - INTERVAL '2 years'
        GROUP BY 1, 2;

        COPY (
            WITH targets AS (
                SELECT 
                    station_id,
                    (fecha - INTERVAL '7 days')::DATE as fecha_base,
                    p95 as target_95,
                    p98 as target_98,
                    pd as target_diesel
                FROM daily_prices
            )
            SELECT 
                EXTRACT(EPOCH FROM p.fecha)::BIGINT as fecha,
                p.station_id as gasolinera_id,
                s.postal_code as municipio_cp,
                p.p95 as price_95,
                p.p98 as price_98,
                p.pd as price_diesel,
                t.target_95,
                t.target_98,
                t.target_diesel,
                EXTRACT(DOW FROM p.fecha)::INTEGER as day_of_week,
                EXTRACT(MONTH FROM p.fecha)::INTEGER as month
            FROM daily_prices p
            JOIN stations s ON p.station_id = s.id
            JOIN targets t ON p.station_id = t.station_id AND p.fecha = t.fecha_base
            WHERE t.target_95 IS NOT NULL 
              AND t.target_98 IS NOT NULL 
              AND t.target_diesel IS NOT NULL
        ) TO '${OUTPUT_FILE}' (FORMAT PARQUET, COMPRESSION ZSTD);
        
        SELECT 'Dataset summary:' as info
        UNION ALL SELECT 'Stations: ' || (SELECT count(*) FROM stations)
        UNION ALL SELECT 'Final Exported Rows: ' || (SELECT count(*) FROM '${OUTPUT_FILE}');
    `;

    const sqlFile = path.join(DATA_DIR, 'process.sql');
    fs.writeFileSync(sqlFile, sql);

    try {
        const output = execSync(`${DUCKDB_BIN} < ${sqlFile}`).toString();
        console.log(output);
        
        const stats = fs.statSync(OUTPUT_FILE);
        console.log(`✨ ¡Éxito! Archivo generado: ${OUTPUT_FILE}`);
        console.log(`📊 Tamaño: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    } catch (e) {
        console.error('❌ Error en DuckDB:', e.message);
    } finally {
        if (fs.existsSync(stationsFile)) fs.unlinkSync(stationsFile);
        if (fs.existsSync(pricesFile)) fs.unlinkSync(pricesFile);
        if (fs.existsSync(sqlFile)) fs.unlinkSync(sqlFile);
    }
}

run().catch(console.error);
