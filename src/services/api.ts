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
  precioG95: number | null
  precioG98: number | null
  precioDiesel: number | null
  distancia?: number
}

const API_BASE_URL = 'https://api.precioil.es'

export const fetchFuelTypes = async (): Promise<FuelType[]> => {
  const response = await fetch(`${API_BASE_URL}/fuel-types`)
  if (!response.ok) throw new Error('Failed to fetch fuel types')
  return response.json()
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
    precioCombustible: s[key] || s.Diesel || s.Gasolina95 || 0,
    precioG95: s['Gasolina95'] || null,
    precioG98: s['Gasolina98'] || null,
    precioDiesel: s['Diesel'] || null,
  }))
}

export const fetchRecentPriceChanges = async (idFuelType: number): Promise<any[]> => {
  const response = await fetch(`${API_BASE_URL}/cambios/precios?idFuelType=${idFuelType}`)
  if (!response.ok) throw new Error('Failed to fetch price changes')
  return response.json()
}
