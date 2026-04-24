import { supabaseFetch } from './supabaseClient'
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

const API_BASE_URL = 'https://api.precioil.es'

export const fetchFuelTypes = async (): Promise<FuelType[]> => {
  const response = await fetch(`${API_BASE_URL}/fuel-types`)
  if (!response.ok) throw new Error('Failed to fetch fuel types')
  return response.json()
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

export const fetchStationsByRadius = async (
  latitud: number,
  longitud: number,
  radio: number,
  idFuelType: number
): Promise<Station[]> => {
  const url = new URL(`${API_BASE_URL}/estaciones/radio`)
  url.searchParams.append('latitud', latitud.toString())
  url.searchParams.append('longitud', longitud.toString())
  url.searchParams.append('radio', radio.toString())
  url.searchParams.append('idFuelType', idFuelType.toString())
  url.searchParams.append('limite', '1000')

  console.log('[API Request] GET', url.toString())

  const response = await fetch(url.toString())
  if (!response.ok) {
    const errorBody = await response.text()
    console.error(`[API Error] Status ${response.status}:`, errorBody)
    throw new Error(`Failed to fetch stations: ${response.status}`)
  }
  const data = await response.json()
  console.log(`[API Success] Found ${data.length} stations`)

  const fuelKeyMap: Record<number, string> = {
    1: 'Biodiesel',
    2: 'Bioetanol',
    3: 'GNC',
    4: 'GNL',
    5: 'GLP',
    6: 'Diesel',
    7: 'GasoleoB',
    8: 'DieselPremium',
    9: 'Gasolina95',
    10: 'Gasolina95',
    11: 'Gasolina95_E5_Premium',
    12: 'Gasolina98',
    13: 'Gasolina98',
  }

  const key = fuelKeyMap[idFuelType] || 'Diesel'

  return data.map((s: any) => ({
    ...s,
    nombreEstacion: cleanStationName(s.nombreEstacion || s.rotulo || s.marca || 'Estación sin nombre'),
    precioCombustible: s[key] || 0,
    precioG95: s['Gasolina95'] || null,
    precioG98: s['Gasolina98'] || null,
    precioDiesel: s['Diesel'] || null,
  }))
}

export const fetchRecentPriceChanges = async (
  idFuelType: number,
  params?: { fechaInicio?: string; fechaFin?: string }
): Promise<any[]> => {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const fmt = (d: Date) => d.toISOString().split('T')[0]
  
  const fechaInicio = params?.fechaInicio || fmt(yesterday)
  const fechaFin = params?.fechaFin || fmt(today)

  const url = `${API_BASE_URL}/cambios/precios?idFuelType=${idFuelType}&fechaInicio=${fechaInicio}&fechaFin=${fechaFin}`
  const response = await fetch(url)
  if (!response.ok) return []
  const data = await response.json()
  return Array.isArray(data) ? data : []
}
export const fetchStationHistory = async (idEstacion: number, days: number | null = 30): Promise<any[]> => {
  console.log('🚀 [API] fetchStationHistory LLAMADA para estación:', idEstacion, 'días:', days);

  // 1. Preparar queries en paralelo
  const fetchDbData = async () => {
    let dbQuery = `price_history?station_id=eq.${idEstacion}&order=recorded_at.asc`
    if (days !== null) {
      const since = new Date()
      since.setDate(since.getDate() - days)
      dbQuery += `&recorded_at=gte.${since.toISOString()}`
    }

    try {
      const rawDbData = await supabaseFetch(dbQuery)
      console.log(`[API] Se obtuvieron ${rawDbData.length} registros de la DB`)
      
      const cleanPrice = (val: any) => {
        if (val === null || val === undefined) return null;
        const n = Number(val);
        return (!isNaN(n) && n >= 0.1) ? n : null;
      };

      return rawDbData
        .map((d: any) => ({
          ...d,
          price_95: cleanPrice(d.price_95),
          price_98: cleanPrice(d.price_98),
          price_diesel: cleanPrice(d.price_diesel)
        }))
        .filter((d: any) => {
          if (isNaN(new Date(d.recorded_at).getTime())) return false;
          return d.price_95 !== null || d.price_98 !== null || d.price_diesel !== null;
        })
    } catch (error) {
      console.error('[DB History Error]', error)
      return []
    }
  }

  const fetchParquetData = async () => {
    try {
      if (days === null || days > 7) {
        console.log('[API] Buscando histórico en Parquet vía DuckDB para estación:', idEstacion)
        let historicalData = await fetchHistoryFromParquet(idEstacion)
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
  const unique = Array.from(new Map(combined.map(item => [item.recorded_at, item])).values())
  
  return unique.sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
}
