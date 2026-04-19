export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371 // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export const formatDistance = (km: number): string => {
  if (km < 1) {
    return `${(km * 1000).toFixed(0)}m`
  }
  return `${km.toFixed(1)}km`
}

export const geocodeAddress = async (query: string): Promise<{ lat: number; lon: number } | null> => {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.append('q', query)
    url.searchParams.append('format', 'json')
    url.searchParams.append('limit', '1')
    url.searchParams.append('countrycodes', 'es') // Limit to Spain
    
    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': 'GasolinerasApp/1.0' }
    })
    
    const data = await response.json()
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon)
      }
    }
  } catch (error) {
    console.error('Geocoding error:', error)
  }
  return null
}

export const fetchSuggestions = async (query: string, lat?: number, lon?: number): Promise<any[]> => {
  if (!query || query.length < 3) return []
  
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.append('q', query)
    url.searchParams.append('format', 'json')
    url.searchParams.append('limit', '5')
    url.searchParams.append('addressdetails', '1')
    url.searchParams.append('countrycodes', 'es') // Limit to Spain
    
    if (lat && lon) {
      // Proximity bias: focus on a 1 degree window around the location
      const viewbox = `${lon - 0.5},${lat + 0.5},${lon + 0.5},${lat - 0.5}`
      url.searchParams.append('viewbox', viewbox)
    }
    
    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': 'GasolinerasApp/1.0' }
    })
    
    return await response.json()
  } catch (error) {
    console.error('Suggestions error:', error)
    return []
  }
}
