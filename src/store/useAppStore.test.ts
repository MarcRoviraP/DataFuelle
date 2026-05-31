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
