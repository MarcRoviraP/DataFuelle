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
  // 1. Obtener datos "calientes" de la DB (últimos 7 días)
  let dbQuery = `price_history?station_id=eq.${idEstacion}&order=recorded_at.asc`
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  dbQuery += `&recorded_at=gte.${sevenDaysAgo.toISOString()}`

  let dbData: any[] = []
  try {
    const rawDbData = await supabaseFetch(dbQuery)
    console.log(`[API] Se obtuvieron ${rawDbData.length} registros de la DB (últimos 7 días)`)
    
    // Limpieza de datos de la DB: 0 a null y filtrar sospechosos
    dbData = rawDbData.map((d: any) => ({
      ...d,
      price_95: d.price_95 > 0.5 ? d.price_95 : null,
      price_98: d.price_98 > 0.5 ? d.price_98 : null,
      price_diesel: d.price_diesel > 0.5 ? d.price_diesel : null
    }))
  } catch (error) {
    console.error('[DB History Error]', error)
  }

  // 2. Si necesitamos más de 7 días, buscamos en el histórico (Parquet)
  let historicalData: any[] = []
  if (days === null || days > 7) {
    console.log('[API] Buscando histórico en Parquet vía DuckDB para estación:', idEstacion)
    historicalData = await fetchHistoryFromParquet(idEstacion)
    console.log(`[API] Se obtuvieron ${historicalData.length} registros del historial Parquet`)
    
    // Si hay un límite de días, filtramos el histórico
    if (days !== null) {
      const since = new Date()
      since.setDate(since.getDate() - days)
      historicalData = historicalData.filter(d => new Date(d.recorded_at) >= since)
    }
  }

  // 3. Combinar y de-duplicar (por si hay solapamiento)
  const combined = [...historicalData, ...dbData]
  const unique = Array.from(new Map(combined.map(item => [item.recorded_at, item])).values())
  
  return unique.sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
}
