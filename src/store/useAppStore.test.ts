import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAppStore } from './useAppStore'

describe('useAppStore - fetchRoute', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    useAppStore.setState({
      currentLocation: null,
      routeCoordinates: null,
      routeInfo: null,
      activeRouteStationId: null,
    })
  })

  it('should not fetch route if currentLocation is missing', async () => {
    global.fetch = vi.fn()
    const store = useAppStore.getState()
    
    await store.fetchRoute(123, 40.0, -3.0)
    
    expect(global.fetch).not.toHaveBeenCalled()
    expect(useAppStore.getState().routeCoordinates).toBeNull()
  })

  it('should fetch route successfully when currentLocation is present', async () => {
    // Mock the successful fetch response from OSRM
    const mockRouteData = {
      routes: [{
        distance: 15000,
        duration: 900, // 15 mins
        geometry: {
          coordinates: [
            [-3.7038, 40.4168], // [lon, lat] from OSRM
            [-3.7040, 40.4170]
          ]
        }
      }]
    }

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRouteData)
    })

    // Set a current location
    useAppStore.setState({
      currentLocation: { lat: 40.4, lon: -3.7 }
    })

    const store = useAppStore.getState()
    await store.fetchRoute(999, 40.4168, -3.7038)

    expect(global.fetch).toHaveBeenCalledTimes(1)
    
    const state = useAppStore.getState()
    expect(state.activeRouteStationId).toBe(999)
    expect(state.routeInfo).toEqual({
      distance: 15000,
      duration: 900
    })
    // Coordinates are transformed from [lon, lat] to [lat, lon] for Leaflet
    expect(state.routeCoordinates).toEqual([
      [40.4168, -3.7038],
      [40.4170, -3.7040]
    ])
  })

  it('should handle API errors gracefully', async () => {
    // Mock a failed fetch response
    global.fetch = vi.fn().mockRejectedValue(new Error("Network Error"))

    // Set a current location
    useAppStore.setState({
      currentLocation: { lat: 40.4, lon: -3.7 }
    })

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const store = useAppStore.getState()
    await store.fetchRoute(999, 40.4168, -3.7038)

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Error al obtener ruta"),
      expect.any(Error)
    )
    
    // State should remain unaffected
    const state = useAppStore.getState()
    expect(state.activeRouteStationId).toBeNull()
    expect(state.routeCoordinates).toBeNull()

    consoleErrorSpy.mockRestore()
  })

  it('should clear route correctly', () => {
    useAppStore.setState({
      routeCoordinates: [[40.4168, -3.7038]],
      routeInfo: { distance: 1000, duration: 600 },
      activeRouteStationId: 999
    })

    const store = useAppStore.getState()
    store.clearRoute()

    const state = useAppStore.getState()
    expect(state.routeCoordinates).toBeNull()
    expect(state.routeInfo).toBeNull()
    expect(state.activeRouteStationId).toBeNull()
  })
})

describe('useAppStore - cost estimation and smart profitability sorting', () => {
  const dummyStationNear = {
    idEstacion: 1,
    nombreEstacion: 'Cercana pero cara',
    direccion: 'Calle 1',
    longitud: 0,
    latitud: 0,
    margen: 'D',
    codPostal: '46001',
    horario: '24H',
    municipio: 'Valencia',
    provincia: 'Valencia',
    marca: 'Repsol',
    precioCombustible: 1.60,
    precioBase: 1.60,
    precioG95: 1.60,
    precioG98: null,
    precioDiesel: null,
    distancia: 2,
    lastUpdate: '2026-10-04'
  }

  const dummyStationFar = {
    idEstacion: 2,
    nombreEstacion: 'Lejana pero muy barata',
    direccion: 'Calle 2',
    longitud: 0,
    latitud: 0,
    margen: 'D',
    codPostal: '46002',
    horario: '24H',
    municipio: 'Valencia',
    provincia: 'Valencia',
    marca: 'Plenoil',
    precioCombustible: 1.30,
    precioBase: 1.30,
    precioG95: 1.30,
    precioG98: null,
    precioDiesel: null,
    distancia: 10,
    lastUpdate: '2026-10-04'
  }

  it('calculates refuel cost, travel cost, and estimated cost accurately with round trip', () => {
    useAppStore.setState({
      stations: [dummyStationNear],
      refuelLiters: 50,
      vehicleConsumption: 6.0,
      isRoundTrip: true,
      sortBy: 'smart',
      radius: 50,
      selectedBrands: [],
      showOnlyFavorites: false,
      showOnlyOpen: false,
      showOnlyUpdatedToday: false,
      activeSEOFilter: null
    })

    useAppStore.getState().updateFilteredStations()
    const [station] = useAppStore.getState().filteredStations

    expect(station.refuelCost).toBe(80.00)
    expect(station.travelCost).toBe(0.38)
    expect(station.estimatedCost).toBe(80.38)
    expect(station.isBestOption).toBe(true)
  })

  it('determines the most worthwhile station considering volume of refuel and travel consumption', () => {
    useAppStore.setState({
      stations: [dummyStationNear, dummyStationFar],
      refuelLiters: 10,
      vehicleConsumption: 6.0,
      isRoundTrip: true,
      sortBy: 'smart',
      radius: 50,
      selectedBrands: [],
      showOnlyFavorites: false,
      showOnlyOpen: false,
      showOnlyUpdatedToday: false,
      activeSEOFilter: null
    })

    useAppStore.getState().updateFilteredStations()
    const stations = useAppStore.getState().filteredStations

    expect(stations[0].idEstacion).toBe(2)
    expect(stations[0].isBestOption).toBe(true)
    expect(stations[0].savingsVsNearest).toBeCloseTo(1.82, 1)
  })
})

