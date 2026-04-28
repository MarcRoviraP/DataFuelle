import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const DUCKDB_BIN = './scratch/duckdb';
const SOURCE_DIR = 'data/quatrimestre';
const TARGET_DIR = 'data/year';

if (!fs.existsSync(TARGET_DIR)) fs.mkdirSync(TARGET_DIR, { recursive: true });

async function mergeYearly() {
    const years = [];
    for (let y = 2007; y <= 2026; y++) years.push(y);

    console.log('🚀 Iniciando fusión de trimestres a años (data/year) usando DuckDB CLI...');

    for (const year of years) {
        const pattern = path.join(SOURCE_DIR, `fuel_prices_${year}_Q*.parquet`);
        const outputFile = path.join(TARGET_DIR, `fuel_prices_${year}.parquet`);

        if (!fs.existsSync(SOURCE_DIR)) {
            console.error('❌ Error: No existe la carpeta source ' + SOURCE_DIR);
            return;
        }

        const files = fs.readdirSync(SOURCE_DIR).filter(f => f.startsWith(`fuel_prices_${year}_Q`) && f.endsWith('.parquet'));
        
        if (files.length === 0) continue;

        console.log(`  -> Fusionando ${files.length} trimestres del año ${year}...`);
        
        try {
            // Usamos ZSTD para que los archivos anuales pesen lo mínimo posible (aprox 6-8MB)
            execSync(`${DUCKDB_BIN} -c "COPY (SELECT * FROM read_parquet('${pattern}')) TO '${outputFile}' (FORMAT PARQUET, COMPRESSION ZSTD)"`);
            
            const stats = fs.statSync(outputFile);
            const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
            console.log(`     ✅ Año ${year} completado: ${outputFile} (${sizeMB} MB)`);
            
            if (stats.size > 50 * 1024 * 1024) {
                console.log(`     ⚠️ ADVERTENCIA: El archivo del año ${year} supera los 50MB.`);
            }
        } catch (e) {
            console.error(`     ❌ ERROR en año ${year}: Los archivos trimestrales están corruptos o son ilegibles.`);
        }
    }

    console.log('\n✨ FUSIÓN FINALIZADA ✨');
    console.log(`Los archivos listos para subir están en: ${TARGET_DIR}`);
}

mergeYearly().catch(console.error);
