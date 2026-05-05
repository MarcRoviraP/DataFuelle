import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Configuración
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://msetjsrlioiysxmgybdg.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET_NAME = 'models'; // Cambiamos al bucket de modelos
const MODELS_DIR = 'models';

if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ ERROR: SUPABASE_SERVICE_ROLE_KEY no encontrada.');
    console.log('\nUso: SUPABASE_SERVICE_ROLE_KEY=tu_key_aqui node scripts/upload_models.js\n');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function uploadModels() {
    if (!fs.existsSync(MODELS_DIR)) {
        console.error(`❌ La carpeta "${MODELS_DIR}" no existe.`);
        return;
    }

    const files = fs.readdirSync(MODELS_DIR).filter(f => f.endsWith('.pkl'));

    if (files.length === 0) {
        console.log('⚠️ No se encontraron archivos .pkl en la carpeta models.');
        return;
    }

    console.log(`🚀 Iniciando subida de ${files.length} modelos al bucket "${BUCKET_NAME}"...`);

    for (const file of files) {
        const filePath = path.join(MODELS_DIR, file);
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
            if (error.message.includes('not found')) {
                console.log(`     (Asegurate de que el bucket "${BUCKET_NAME}" exista en Supabase)`);
            }
        } else {
            console.log('✅ OK');
        }
    }
    
    console.log('\n✨ MODELOS SUBIDOS CORRECTAMENTE ✨');
}

uploadModels().catch(console.error);
