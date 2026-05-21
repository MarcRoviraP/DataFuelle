import { supabase } from './supabaseClient'
import { fetchHistoryFromParquet } from './historicalData'

export interface FuelType {
  idFuelType: number
  fuelTypeName: string
}

export interface Station {
  idEstacion: number
  nombreEstacion: string
  direccion: string
  longitud: number
  latitud: number
  margen: string
  codPostal: string
  horario: string
  municipio: string
  provincia: string
  marca: string
  precioCombustible: number
  precioBase?: number
  precioG95: number | null
  precioG98: number | null
  precioDiesel: number | null
  distancia?: number
  // Price changes
  diff?: number
  delta_pct?: number
  precioAnterior?: number
  lastUpdate: string
}

const MITECO_URL = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/'

// In-memory cache for MITECO data
let mitecoCache: {
  data: any[]
  timestamp: number
} | null = null

const CACHE_DURATION = 30 * 60 * 1000 // 30 minutes
let pendingMitecoFetch: Promise<any[]> | null = null

const parseMitecoNumber = (val: string): number => {
  if (!val) return 0
  return parseFloat(val.replace(',', '.')) || 0
}

import { calculateDistance } from '../utils/geo'

export const fetchFuelTypes = async (): Promise<FuelType[]> => {
  // Return static fuel types since MITECO is different
  return [
    { idFuelType: 9, fuelTypeName: 'Gasolina 95' },
    { idFuelType: 12, fuelTypeName: 'Gasolina 98' },
    { idFuelType: 6, fuelTypeName: 'Diésel' },
  ]
}

const cleanStationName = (name: string) => {
  if (!name) return ''
  // Replace + and _ with space, collapse multiple spaces
  const cleaned = name.replace(/[+_]/g, ' ').replace(/\s+/g, ' ').trim()
  // Title Case
  return cleaned
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

const fetchStationsFromSupabaseBackup = async (
  latitud: number,
  longitud: number,
  radio: number,
  idFuelType: number
): Promise<Station[]> => {
  console.log('⚠️ [Supabase Backup] Iniciando consulta de respaldo en Supabase...');
  try {
    // Cálculo aproximado de la caja delimitadora (bounding box) para optimizar la consulta
    // 1 grado de latitud es aproximadamente 111 km
    const deltaLat = radio / 111
    // 1 grado de longitud es aproximadamente 111 * cos(latitud) km
    const deltaLon = radio / (111 * Math.cos(latitud * Math.PI / 180))

    const minLat = latitud - deltaLat
    const maxLat = latitud + deltaLat
    const minLon = longitud - deltaLon
    const maxLon = longitud + deltaLon

    console.log(`[Supabase Backup] Rango de búsqueda: Lat [${minLat.toFixed(4)}, ${maxLat.toFixed(4)}], Lon [${minLon.toFixed(4)}, ${maxLon.toFixed(4)}]`);

    // Consultamos la tabla 'stations' usando el cliente de supabase
    const { data, error } = await supabase
      .from('stations')
      .select('*')
      .gte('latitude', minLat)
      .lte('latitude', maxLat)
      .gte('longitude', minLon)
      .lte('longitude', maxLon)

    if (error) throw error

    if (!data || data.length === 0) {
      console.warn('[Supabase Backup] No se encontraron estaciones en el bounding box de Supabase.');
      return []
    }

    console.log(`[Supabase Backup] Se recuperaron ${data.length} estaciones de Supabase.`);

    const fuelKey = idFuelType === 9 ? 'last_price_95' : 
                    idFuelType === 12 ? 'last_price_98' : 
                    'last_price_diesel'

    return data
      .map((s: any) => {
        const price = s[fuelKey] || 0
        const dist = calculateDistance(latitud, longitud, s.latitude, s.longitude)
        
        return {
          idEstacion: s.external_id,
          nombreEstacion: cleanStationName(s.name || 'Estación sin nombre'),
          direccion: s.address || '',
          municipio: s.municipality || '',
          provincia: s.province || '',
          latitud: s.latitude,
          longitud: s.longitude,
          horario: s.schedule || '',
          marca: s.brand || '',
          margen: '',
          codPostal: s.postal_code || '',
          precioCombustible: price,
          precioBase: price,
          precioG95: s.last_price_95 || null,
          precioG98: s.last_price_98 || null,
          precioDiesel: s.last_price_diesel || null,
          distancia: dist,
          lastUpdate: s.updated_at || new Date().toISOString()
        }
      })
      .filter(s => s.distancia <= radio && s.precioCombustible >= 0.1)
      .sort((a, b) => a.distancia - b.distancia)
  } catch (dbErr) {
    console.error('❌ [Supabase Backup Error] Falló la recuperación de respaldo de base de datos:', dbErr)
    return []
  }
}

let isMitecoHealthy = true
let lastHealthCheck = 0
let isCheckingHealth = false

export const prefetchMitecoData = async (force = false): Promise<any[]> => {
  const now = Date.now()
  if (!force && mitecoCache && (now - mitecoCache.timestamp) < CACHE_DURATION) {
    return mitecoCache.data
  }

  if (isCheckingHealth) {
    if (pendingMitecoFetch) return pendingMitecoFetch
    return mitecoCache?.data || []
  }
  
  isCheckingHealth = true
  console.log('📡 [MITECO Prefetch] Precargando todas las gasolineras de España en segundo plano para cachear en memoria...')
  
  pendingMitecoFetch = (async () => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 12000) // 12s para descargar el listado completo

    try {
      const response = await fetch(MITECO_URL, { signal: controller.signal })
      clearTimeout(timeoutId)

      if (!response.ok) throw new Error(`MITECO API error status: ${response.status}`)
      
      const json = await response.json()
      const data = json.ListaEESSPrecio || []
      
      mitecoCache = { data, timestamp: Date.now() }
      isMitecoHealthy = true
      console.log(`📡 [MITECO Prefetch] ¡Éxito! ${data.length} gasolineras precargadas en caché de memoria.`)
      return data
    } catch (err) {
      clearTimeout(timeoutId)
      console.error('❌ [MITECO Prefetch Error] No se pudo descargar la base de datos de MITECO en segundo plano:', err)
      isMitecoHealthy = false
      return []
    } finally {
      pendingMitecoFetch = null
      isCheckingHealth = false
      lastHealthCheck = Date.now()
    }
  })()

  return pendingMitecoFetch
}

export const checkMitecoHealthStatus = async (force = false): Promise<boolean> => {
  if (force || (Date.now() - lastHealthCheck) > CACHE_DURATION) {
    await prefetchMitecoData(true)
  }
  return isMitecoHealthy
}

// Ejecución periódica cada 30 minutos para renovar la caché
setInterval(async () => {
  await prefetchMitecoData(true)
}, CACHE_DURATION)

// Arrancamos la precarga completa en segundo plano inmediatamente al importar el módulo
prefetchMitecoData(true)

export const fetchStationsByRadius = async (
  latitud: number,
  longitud: number,
  radio: number,
  idFuelType: number
): Promise<Station[]> => {
  const now = Date.now()

  // Si sabemos de antemano que la API de MITECO está caída por la precarga en segundo plano,
  // cargamos directamente de Supabase evitando esperas inútiles.
  if (!isMitecoHealthy) {
    console.warn('⚠️ [MITECO Health] API marcada como caída en segundo plano. Cargando directamente de Supabase para la zona actual...');
    return fetchStationsFromSupabaseBackup(latitud, longitud, radio, idFuelType)
  }
  
  let rawStations: any[] = []
  if (mitecoCache && (now - mitecoCache.timestamp) < CACHE_DURATION) {
    console.log('[MITECO] Usando datos ya precargados y cacheados en memoria.')
    rawStations = mitecoCache.data
  } else {
    try {
      console.log('[MITECO] Datos no disponibles en caché o vencidos. Iniciando o esperando precarga en segundo plano...')
      rawStations = await prefetchMitecoData()
    } catch (err) {
      console.error('[MITECO] Error al precargar datos para consulta por radio:', err)
      rawStations = []
    }
  }

  // Si la API de MITECO retornó un array vacío por error (por ejemplo, por un 503 o falla de conexión),
  // se activa el respaldo con la base de datos de Supabase.
  if (rawStations.length === 0) {
    console.warn('⚠️ [MITECO] API no disponible o retornó error (0 estaciones). Activando respaldo desde la base de datos de Supabase para la zona actual...');
    return fetchStationsFromSupabaseBackup(latitud, longitud, radio, idFuelType)
  }

  // Map MITECO fields to our Station interface
  const fuelKey = idFuelType === 9 ? 'Precio Gasolina 95 E5' : 
                  idFuelType === 12 ? 'Precio Gasolina 98 E5' : 
                  'Precio Gasoleo A'

  return rawStations
    .map((s: any) => {
      const sLat = parseMitecoNumber(s['Latitud'])
      const sLon = parseMitecoNumber(s['Longitud (WGS84)'])
      const dist = calculateDistance(latitud, longitud, sLat, sLon)
      
      const price = parseMitecoNumber(s[fuelKey])
      
      return {
        idEstacion: parseInt(s['IDEESS']),
        nombreEstacion: cleanStationName(s['Rótulo'] || 'Estación sin nombre'),
        direccion: s['Dirección'],
        municipio: s['Municipio'],
        provincia: s['Provincia'],
        latitud: sLat,
        longitud: sLon,
        horario: s['Horario'],
        marca: s['Rótulo'],
        margen: s['Margen'],
        codPostal: s['C.P.'],
        precioCombustible: price,
        precioBase: price,
        precioG95: parseMitecoNumber(s['Precio Gasolina 95 E5']),
        precioG98: parseMitecoNumber(s['Precio Gasolina 98 E5']),
        precioDiesel: parseMitecoNumber(s['Precio Gasoleo A']),
        distancia: dist,
        lastUpdate: new Date().toISOString()
      }
    })
    .filter(s => s.distancia <= radio && s.precioCombustible >= 0.1)
    .sort((a, b) => a.distancia - b.distancia)
}

export const fetchRecentPriceChanges = async (
  _idFuelType: number,
  _params?: { fechaInicio?: string; fechaFin?: string }
): Promise<any[]> => {
  // MITECO API doesn't provide deltas directly. 
  // We return empty for now to maintain store compatibility.
  return []
}
export const fetchStationHistory = async (idEstacion: number, days: number | null = 30): Promise<any[]> => {
  console.log('🚀 [API] fetchStationHistory LLAMADA para estación:', idEstacion, 'días:', days);

  // 1. Preparar queries en paralelo
  const fetchDbData = async () => {
    try {
      // Use the client directly instead of manual fetch to benefit from internal session management
      let query = supabase
        .from('price_history')
        .select('*')
        .eq('station_id', idEstacion)
        .order('recorded_at', { ascending: true });

      if (days !== null) {
        const since = new Date();
        since.setDate(since.getDate() - days);
        query = query.gte('recorded_at', since.toISOString());
      }

      const { data: rawDbData, error } = await query;

      if (error) throw error;

      console.log(`[API] Se obtuvieron ${rawDbData?.length || 0} registros de la DB`);
      
      const cleanPrice = (val: any) => {
        if (val === null || val === undefined) return null;
        const n = Number(val);
        return (!isNaN(n) && n >= 0.1) ? n : null;
      };

      return (rawDbData || [])
        .map((d: any) => ({
          ...d,
          price_95: cleanPrice(d.price_95),
          price_98: cleanPrice(d.price_98),
          price_diesel: cleanPrice(d.price_diesel)
        }))
        .filter((d: any) => {
          if (isNaN(new Date(d.recorded_at).getTime())) return false;
          return d.price_95 !== null || d.price_98 !== null || d.price_diesel !== null;
        });
    } catch (error) {
      console.error('[DB History Error]', error);
      return [];
    }
  };

  const fetchParquetData = async () => {
    try {
      // Siempre buscamos en Parquet si se piden 7 días o más, o si es el historial completo
      if (days === null || days >= 7) {
        console.log('[API] Buscando histórico en Parquet vía DuckDB para estación:', idEstacion, 'días:', days)
        let historicalData = await fetchHistoryFromParquet(idEstacion, days)
        console.log(`[API] Se obtuvieron ${historicalData.length} registros del historial Parquet`)
        
        if (days !== null) {
          const since = new Date()
          since.setDate(since.getDate() - days)
          historicalData = historicalData.filter(d => new Date(d.recorded_at) >= since)
        }
        return historicalData
      }
    } catch (error) {
      console.error('[API] Error al obtener datos de Parquet:', error)
      return []
    }
    return []
  }

  // 2. Ejecutar en paralelo
  const [dbData, historicalData] = await Promise.all([fetchDbData(), fetchParquetData()])

  // 3. Combinar y de-duplicar (por si hay solapamiento)
  const combined = [...historicalData, ...dbData]
  
  // Filter out any entries with invalid dates or missing all prices
  const validCombined = combined.filter(item => {
    if (!item.recorded_at) return false
    const date = new Date(item.recorded_at)
    return !isNaN(date.getTime()) && (item.price_95 !== null || item.price_98 !== null || item.price_diesel !== null)
  })

  // Deduplicate by timestamp (recorded_at)
  const uniqueMap = new Map()
  validCombined.forEach(item => {
    uniqueMap.set(item.recorded_at, item)
  })
  
  const unique = Array.from(uniqueMap.values())
  
  return unique.sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
}

export const fetchPredictions = async (_idFuelType: number, stationIds?: number[]): Promise<any[]> => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  // Fetch predictions and join with station details
  let query = supabase
    .from('price_predictions')
    .select(`
      *,
      station:stations!inner(external_id, name, brand, province, municipality, address, last_price_95, last_price_98, last_price_diesel)
    `)
    .gte('target_date', todayStr)
    .order('target_date', { ascending: true });

  if (stationIds) {
    if (stationIds.length === 0) return [];
    query = query.in('station_id', stationIds);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[Prediction Fetch Error]', error);
    return [];
  }

  return data || [];
}
