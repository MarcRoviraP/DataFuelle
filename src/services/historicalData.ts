import * as duckdb from '@duckdb/duckdb-wasm';
import { supabase } from './supabaseClient';

let db: duckdb.AsyncDuckDB | null = null;

const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();

async function initDuckDB() {
  if (db) return db;
  console.log('[DuckDB] Iniciando instancia...');

  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
  console.log('[DuckDB] Bundle seleccionado:', bundle);
  const worker_url = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker!}");`], { type: 'text/javascript' })
  );

  const worker = new Worker(worker_url);
  const logger = new duckdb.ConsoleLogger();
  db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(worker_url);
  console.log('[DuckDB] Instancia lista y operativa.');
  return db;
}

export const fetchHistoryFromParquet = async (idEstacion: number): Promise<any[]> => {
  console.log(`[HistoricalData] Iniciando búsqueda para estación ${idEstacion}...`);
  try {
    const instance = await initDuckDB();
    console.log('[HistoricalData] Conectando a DuckDB...');
    const conn = await instance.connect();

    // 1. Listar archivos en el bucket
    const { data: files, error } = await supabase.storage.from('historical-data').list();
    console.log('[HistoricalData] Archivos en bucket:', files);
    
    if (error || !files || files.length === 0) {
      console.warn('[HistoricalData] No se encontraron archivos o hubo error:', error);
      return [];
    }

    // 2. Obtener las URLs de los parquets
    const parquetFiles = files
      .filter(f => f.name.endsWith('.parquet'))
      .map(f => {
        const { data } = supabase.storage.from('historical-data').getPublicUrl(f.name);
        return data.publicUrl;
      });

    console.log('[HistoricalData] URLs de Parquets a consultar:', parquetFiles);

    if (parquetFiles.length === 0) return [];

    // 3. Registrar los archivos en DuckDB y consultar
    // Usamos read_parquet con la lista de URLs
    console.log('[HistoricalData] Ejecutando query en DuckDB...');
    
    // Lista de URLs para la consulta
    const urls = parquetFiles.map(url => `'${url}'`).join(',');

    // Log para ver el total de filas en los parquets sin filtrar por estación
    const countResult = await conn.query(`SELECT count(*) as total FROM read_parquet([${urls}])`);
    console.log('[HistoricalData] Total de filas en Parquets (todos):', countResult.toArray()[0].toJSON().total);

    const query = `
      SELECT 
        station_id,
        recorded_at,
        price_95,
        price_98,
        price_diesel
      FROM read_parquet([${urls}])
      WHERE station_id = ${idEstacion}
      ORDER BY recorded_at ASC
    `;

    const result = await conn.query(query);
    console.log('[HistoricalData] Query finalizada.');

    const rawRows = result.toArray();
    if (rawRows.length > 0) {
      console.log('[HistoricalData] Muestra de la primera fila:', rawRows[0].toJSON());
    } else {
      console.warn('[HistoricalData] La query no devolvió nada para la estación:', idEstacion);
      
      // DIAGNÓSTICO: Ver qué IDs existen en el Parquet realmente
      const diag = await conn.query(`SELECT DISTINCT station_id FROM read_parquet([${urls}]) LIMIT 10`);
      console.log('[HistoricalData] IDs de estaciones disponibles en el Parquet (muestra):', diag.toArray().map(r => r.toJSON().station_id));
    }

    const rows = rawRows.map(row => {
        const obj = row.toJSON();
        return {
            station_id: obj.station_id,
            recorded_at: obj.recorded_at instanceof Date ? obj.recorded_at.toISOString() : obj.recorded_at,
            price_95: obj.price_95,
            price_98: obj.price_98,
            price_diesel: obj.price_diesel
        };
    });

    console.log(`[HistoricalData] Proceso finalizado. ${rows.length} filas obtenidas.`);
    await conn.close();
    return rows;
  } catch (err) {
    console.error('[DuckDB Error]', err);
    return [];
  }
};
