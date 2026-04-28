import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://msetjsrlioiysxmgybdg.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET_NAME = 'historical-data';

if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ ERROR: SUPABASE_SERVICE_ROLE_KEY no encontrada.');
    console.log('\nUso: SUPABASE_SERVICE_ROLE_KEY=tu_key_aqui node scripts/upload_to_supabase.js\n');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function uploadFiles() {
    const dataDir = 'data/year';
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.parquet')).sort();

    console.log(`🚀 Iniciando subida de ${files.length} archivos al bucket "${BUCKET_NAME}"...`);

    for (const file of files) {
        const filePath = path.join(dataDir, file);
        const fileContent = fs.readFileSync(filePath);

        process.stdout.write(`  -> Subiendo ${file}... `);
        const { error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(file, fileContent, {
                upsert: true,
                contentType: 'application/octet-stream'
            });

        if (error) {
            console.log(`\n  ❌ Error en ${file}:`, error.message);
        } else {
            console.log('✅ OK');
        }
    }
    
    console.log('\n✨ TODO SUBIDO CORRECTAMENTE A SUPABASE ✨');
}

uploadFiles().catch(console.error);
