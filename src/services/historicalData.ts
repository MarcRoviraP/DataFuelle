import * as duckdb from '@duckdb/duckdb-wasm';
import { SUPABASE_URL } from './supabaseClient';

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
  const _db = new duckdb.AsyncDuckDB(logger, worker);
  
  try {
    await _db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    
    // Intentar abrir con multi-threading si el bundle lo soporta
    try {
      await _db.open({
        query: { castBigIntToDouble: true },
        maximumThreads: bundle.pthreadWorker ? (navigator.hardwareConcurrency || 4) : 1,
      });
    } catch (openErr: any) {
      console.warn('[DuckDB] Error en open (posible hilo), reintentando modo simple...', openErr.message);
      await _db.open({
        query: { castBigIntToDouble: true },
        maximumThreads: 1
      });
    }

    db = _db;
    URL.revokeObjectURL(worker_url);
    console.log('[DuckDB] Instancia lista y operativa.');
    return db;
  } catch (err) {
    console.error('[DuckDB] Error fatal en instanciación:', err);
    URL.revokeObjectURL(worker_url);
    throw err;
  }
}

/**
 * Determina qué años calendarios son necesarios para cubrir un rango de días.
 */
const getYearsForRange = (days: number | null): number[] => {
  const currentYear = new Date().getFullYear();
  if (days === null) {
    // Si no hay límite, devolvemos desde el inicio del histórico (2007) hasta hoy
    const years: number[] = [];
    for (let y = 2007; y <= currentYear; y++) years.push(y);
    return years;
  }
  
  const startYear = new Date(Date.now() - days * 24 * 60 * 60 * 1000).getFullYear();
  const years: number[] = [];
  for (let y = startYear; y <= currentYear; y++) years.push(y);
  return years;
};

/**
 * Construye las URLs públicas de Supabase Storage de forma determinista.
 */
const buildParquetUrls = (years: number[]): string[] => {
  return years.map(year => `${SUPABASE_URL}/storage/v1/object/public/historical-data/fuel_prices_${year}.parquet`);
};

export const fetchHistoryFromParquet = async (idEstacion: number, days: number | null = null): Promise<any[]> => {
  console.log(`[HistoricalData] Iniciando búsqueda predictiva para estación ${idEstacion}... (Días: ${days ?? 'Todos'})`);
  
  try {
    const instance = await initDuckDB();
    const conn = await instance.connect();

    // 1. Determinar años y construir URLs
    const years = getYearsForRange(days);
    const parquetFiles = buildParquetUrls(years);
    
    console.log('[HistoricalData] Años seleccionados:', years);
    console.log('[HistoricalData] URLs de Parquets a consultar:', parquetFiles);

    if (parquetFiles.length === 0) return [];

    // 2. Ejecutar query en DuckDB
    // Usamos read_parquet con la lista de URLs construidas
    const urls = parquetFiles.map(url => `'${url}'`).join(',');
    
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

    console.log('[HistoricalData] Ejecutando query en DuckDB...');
    const result = await conn.query(query);
    console.log('[HistoricalData] Query finalizada.');

    const rawRows = result.toArray();
    
    const rows = rawRows
      .map(row => {
        const obj = row.toJSON();
        
        let dateStr: string;
        if (obj.recorded_at instanceof Date) {
          dateStr = obj.recorded_at.toISOString();
        } else if (typeof obj.recorded_at === 'number' || typeof obj.recorded_at === 'bigint') {
          dateStr = new Date(Number(obj.recorded_at)).toISOString();
        } else {
          dateStr = String(obj.recorded_at);
        }

        const cleanPrice = (val: any) => {
          if (val === null || val === undefined) return null;
          const n = Number(val);
          return (!isNaN(n) && n >= 0.1) ? n : null;
        };

        return {
          station_id: Number(obj.station_id),
          recorded_at: dateStr,
          price_95: cleanPrice(obj.price_95),
          price_98: cleanPrice(obj.price_98),
          price_diesel: cleanPrice(obj.price_diesel)
        };
      })
      .filter(row => {
        if (isNaN(new Date(row.recorded_at).getTime())) return false;
        return row.price_95 !== null || row.price_98 !== null || row.price_diesel !== null;
      });

    console.log(`[HistoricalData] Proceso finalizado. ${rows.length} filas obtenidas.`);
    await conn.close();
    return rows;
  } catch (err) {
    console.error('[DuckDB Error]', err);
    return [];
  }
};
