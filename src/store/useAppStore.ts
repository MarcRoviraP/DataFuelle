import { create } from 'zustand'
import type { Station, FuelType } from '../services/api'
import { fetchStationsByRadius, fetchRecentPriceChanges, fetchStationsByProvinceOrMunicipality } from '../services/api'
import type { User } from '@supabase/supabase-js'
import { calculateDistance } from '../utils/geo'
import { supabase } from '../services/supabaseClient'

let syncTimeout: any = null

export interface Car {
  id: number | string
  make: string
  model: string
  year: number
  combustible: string
  consumo_l_100km: number
}

interface AppState {
  // Location
  currentLocation: { lat: number; lon: number } | null
  setCurrentLocation: (lat: number, lon: number) => void

  // Filters
  radius: number
  setRadius: (radius: number) => void
  selectedFuelTypeId: number
  setSelectedFuelTypeId: (id: number) => void
  fuelTypes: FuelType[]
  setFuelTypes: (types: FuelType[]) => void

  // Data
  stations: Station[]
  setStations: (stations: Station[]) => void
  filteredStations: Station[]
  setFilteredStations: (stations: Station[]) => void
  isLoading: boolean
  setIsLoading: (isLoading: boolean) => void

  // New Filters & Sort
  selectedBrands: string[]
  setSelectedBrands: (brands: string[]) => void
  sortBy: 'smart' | 'distance' | 'price'
  setSortBy: (sortBy: 'smart' | 'distance' | 'price') => void
  refuelLiters: number
  setRefuelLiters: (liters: number) => void
  showOnlyOpen: boolean
  setShowOnlyOpen: (open: boolean) => void
  showOnlyUpdatedToday: boolean
  setShowOnlyUpdatedToday: (show: boolean) => void

  // Search History
  searchHistory: string[]
  addToHistory: (query: string) => void
  clearHistory: () => void

  // Selected station (shared between list and map)
  selectedStationId: number | null
  setSelectedStationId: (id: number | null) => void
  // UI State
  isSidebarOpen: boolean
  setIsSidebarOpen: (isOpen: boolean) => void
  isListExpanded: boolean
  setIsListExpanded: (isExpanded: boolean) => void
  // Price changes data
  priceChanges: Map<number, any>
  setPriceChanges: (changes: any[]) => void
  // Discounts per station
  stationDiscounts: Map<number, number>
  setStationDiscount: (stationId: number, discount: number) => void
  // Tab/View Mode for Mobile
  viewMode: 'map' | 'list'
  setViewMode: (mode: 'map' | 'list') => void

  // Auth & Profile
  user: User | null
  setUser: (user: User | null) => void
  isLoadingAuth: boolean
  isAuthScreenOpen: boolean
  setIsAuthScreenOpen: (isOpen: boolean) => void
  
  // Cars (Garage)
  userCars: Car[]
  selectedCarId: number | string | null
  fetchUserCars: () => Promise<void>
  addUserCar: (car: Car) => Promise<void>
  removeUserCar: (carId: number | string) => Promise<void>
  setSelectedCarId: (id: number | string | null) => Promise<void>

  // Favorites
  favoriteStationIds: number[]
  toggleFavorite: (stationId: number) => void
  showOnlyFavorites: boolean
  setShowOnlyFavorites: (showOnlyFavorites: boolean) => void

  // SEO Local Filtering
  activeSEOFilter: { provincia: string; municipio?: string } | null
  setActiveSEOFilter: (filter: { provincia: string; municipio?: string } | null) => void

  // Actions
  fetchStations: () => Promise<void>
  updateFilteredStations: () => void
  syncProfile: () => Promise<void>
  signOut: () => Promise<void>

  // Routing
  routeCoordinates: [number, number][] | null
  routeInfo: { distance: number; duration: number } | null
  activeRouteStationId: number | null
  fetchRoute: (stationId: number, stationLat: number, stationLng: number) => Promise<void>
  clearRoute: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  isSidebarOpen: false,
  setIsSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
  isListExpanded: false,
  setIsListExpanded: (isExpanded) => set({ isListExpanded: isExpanded }),
  viewMode: 'map',
  setViewMode: (mode) => set({ viewMode: mode }),
  currentLocation: (() => {
    try {
      const stored = localStorage.getItem('datafuelle_current_location')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed && typeof parsed.lat === 'number' && typeof parsed.lon === 'number') {
          return { lat: parsed.lat, lon: parsed.lon }
        }
      }
    } catch {}
    return { lat: 39.4699, lon: -0.3763 }
  })(),
  setCurrentLocation: (lat, lon) => {
    set({ currentLocation: { lat, lon } })
    try {
      localStorage.setItem('datafuelle_current_location', JSON.stringify({ lat, lon }))
    } catch {}
  },
  activeSEOFilter: null,
  setActiveSEOFilter: (filter) => {
    set({ activeSEOFilter: filter })
    get().fetchStations()
  },
  stationDiscounts: new Map(),
  setStationDiscount: (stationId, discount) => {
    const discounts = new Map(get().stationDiscounts)
    if (discount <= 0) {
      discounts.delete(stationId)
    } else {
      discounts.set(stationId, discount)
    }
    set({ stationDiscounts: discounts })
    get().updateFilteredStations()
  },

  radius: 40,
  setRadius: (radius) => {
    set({ radius })
    get().updateFilteredStations()
  },

  selectedFuelTypeId: 9, // Default to Gasolina 95
  setSelectedFuelTypeId: (id) => {
    set({ selectedFuelTypeId: id })
    get().updateFilteredStations()
  },

  selectedBrands: [],
  setSelectedBrands: (brands) => {
    set({ selectedBrands: brands })
    get().updateFilteredStations()
  },
  sortBy: 'smart',
  setSortBy: (sortBy) => {
    set({ sortBy })
    get().updateFilteredStations()
  },
  refuelLiters: (() => {
    try {
      const stored = localStorage.getItem('datafuelle_refuel_liters')
      if (stored) {
        const parsed = parseInt(stored, 10)
        if (!isNaN(parsed) && parsed > 0) return parsed
      }
    } catch {}
    return 35
  })(),
  setRefuelLiters: (liters) => {
    set({ refuelLiters: liters })
    try {
      localStorage.setItem('datafuelle_refuel_liters', liters.toString())
    } catch {}
    get().updateFilteredStations()
  },
  showOnlyOpen: false,
  setShowOnlyOpen: (showOnlyOpen) => {
    set({ showOnlyOpen })
    get().updateFilteredStations()
  },
  showOnlyUpdatedToday: false,
  setShowOnlyUpdatedToday: (showOnlyUpdatedToday) => {
    set({ showOnlyUpdatedToday })
    get().updateFilteredStations()
  },

  fuelTypes: [
    { idFuelType: 9, fuelTypeName: 'Gasolina 95' },
    { idFuelType: 12, fuelTypeName: 'Gasolina 98' },
    { idFuelType: 6, fuelTypeName: 'Diesel' },
  ],
  setFuelTypes: (types) => set({ fuelTypes: types }),

  stations: [],
  setStations: (newStations) => {
    const { currentLocation, stations: currentStations, priceChanges } = get()
    
    const currentStationsMap = new Map(currentStations.map(s => [s.idEstacion, s]))
    const nextStations = []

    for (const newS of newStations) {
      const change = priceChanges.get(newS.idEstacion)
      const diff = change ? parseFloat(change.diferencia) : undefined
      const delta_pct = change ? parseFloat(change.delta_pct) : undefined
      const precioAnterior = change ? parseFloat(change.precioAnterior) : undefined
      
      const dist = currentLocation 
        ? calculateDistance(currentLocation.lat, currentLocation.lon, newS.latitud, newS.longitud) 
        : newS.distancia

      const existing = currentStationsMap.get(newS.idEstacion)
      
      // Keep existing reference if core data hasn't changed to avoid React re-renders
      if (
        existing &&
        existing.precioBase === newS.precioCombustible &&
        existing.distancia === dist &&
        existing.diff === diff
      ) {
        nextStations.push(existing)
        continue
      }

      nextStations.push({
        ...newS,
        distancia: dist,
        precioBase: newS.precioCombustible,
        diff,
        delta_pct,
        precioAnterior
      })
    }

    set({ stations: nextStations })
    get().updateFilteredStations()
  },

  priceChanges: new Map(),
  setPriceChanges: (changes) => {
    const { selectedFuelTypeId } = get()
    const changeMap = new Map()
    if (Array.isArray(changes)) {
      // API returns changes for all fuels; filter to match current selection
      changes
        .filter(c => Number(c.idFuelType) === selectedFuelTypeId)
        .forEach(c => changeMap.set(c.idEstacion, c))
    }
    set({ priceChanges: changeMap })
    
    // Refresh stations to apply new changes
    const { stations } = get()
    const updated = stations.map(s => {
      const change = changeMap.get(s.idEstacion)
      if (change) {
        return { 
          ...s, 
          diff: parseFloat(change.diferencia),
          delta_pct: parseFloat(change.delta_pct),
          precioAnterior: parseFloat(change.precioAnterior)
        }
      }
      return { ...s, diff: undefined, delta_pct: undefined, precioAnterior: undefined }
    })
    set({ stations: updated })
    get().updateFilteredStations()
  },

  filteredStations: [],
  setFilteredStations: (stations) => set({ filteredStations: stations }),

  selectedStationId: null,
  setSelectedStationId: (id) => {
    set({ selectedStationId: id })
  },

  routeCoordinates: null,
  routeInfo: null,
  activeRouteStationId: null,

  fetchRoute: async (stationId, stationLat, stationLng) => {
    const { currentLocation } = get()
    if (!currentLocation) {
      alert("⚠️ No se puede trazar la ruta sin ubicación actual. Por favor, activa tu ubicación.")
      return
    }

    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${currentLocation.lon},${currentLocation.lat};${stationLng},${stationLat}?overview=full&geometries=geojson`
      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error("Error en la respuesta de OSRM (Servicio no disponible o ruta demasiado compleja)")
      }
      
      const data = await response.json()
      
      if (data.code === 'NoRoute' || !data.routes || data.routes.length === 0) {
        alert("🚗 No se ha podido encontrar una ruta en coche hasta esta gasolinera (puede estar en otra isla o en una zona sin carreteras mapeadas).")
        return
      }

      const route = data.routes[0]
      const coords = route.geometry.coordinates.map((c: any) => [c[1], c[0]] as [number, number])
      
      set({
        routeCoordinates: coords,
        routeInfo: {
          distance: route.distance,
          duration: route.duration
        },
        activeRouteStationId: stationId
      })
    } catch (error: any) {
      console.error("❌ [Store Route] Error al obtener ruta:", error)
      alert("❌ Fallo al intentar conectar con el servicio de rutas. Revisa tu conexión a internet o inténtalo más tarde. (" + error.message + ")")
    }
  },

  clearRoute: () => set({ routeCoordinates: null, routeInfo: null, activeRouteStationId: null }),

  isLoading: false,
  setIsLoading: (isLoading) => set({ isLoading }),

  favoriteStationIds: (() => {
    try {
      const stored = localStorage.getItem('datafuelle_favorites')
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })(),
  toggleFavorite: (stationId: number) => {
    const favorites = [...get().favoriteStationIds]
    const index = favorites.indexOf(stationId)
    if (index > -1) {
      favorites.splice(index, 1)
    } else {
      favorites.push(stationId)
    }
    set({ favoriteStationIds: favorites })
    try {
      localStorage.setItem('datafuelle_favorites', JSON.stringify(favorites))
    } catch (e) {
      console.error('Error saving favorites to localStorage:', e)
    }
    get().updateFilteredStations()
    if (get().user) {
      get().syncProfile()
    }
  },
  showOnlyFavorites: false,
  setShowOnlyFavorites: (showOnlyFavorites) => {
    set({ showOnlyFavorites })
    get().updateFilteredStations()
  },

  searchHistory: [],
  addToHistory: (query) => {
    const history = get().searchHistory
    const newHistory = [query, ...history.filter((q) => q !== query)].slice(0, 10)
    set({ searchHistory: newHistory })
    get().syncProfile()
  },
  clearHistory: () => {
    set({ searchHistory: [] })
    get().syncProfile()
  },

  fetchStations: async () => {
    const { currentLocation, radius, selectedFuelTypeId, setIsLoading, setStations, setPriceChanges, activeSEOFilter } = get()
    
    if (!currentLocation && !activeSEOFilter) return

    setIsLoading(true)
    try {
      let stationsPromise;
      if (activeSEOFilter) {
        stationsPromise = fetchStationsByProvinceOrMunicipality(
          activeSEOFilter.provincia,
          activeSEOFilter.municipio || null,
          selectedFuelTypeId,
          currentLocation?.lat,
          currentLocation?.lon
        )
      } else {
        stationsPromise = fetchStationsByRadius(
          currentLocation!.lat,
          currentLocation!.lon,
          radius,
          selectedFuelTypeId
        )
      }

      const [data, priceChanges] = await Promise.all([
        stationsPromise,
        fetchRecentPriceChanges(selectedFuelTypeId)
      ])
      
      setPriceChanges(priceChanges)
      setStations(data)
    } catch (error) {
      console.error('[Store Fetch] Error:', error)
    } finally {
      setIsLoading(false)
    }
  },

  userCars: [],
  selectedCarId: null,

  fetchUserCars: async () => {
    const { user } = get()
    if (!user) return

    try {
      const { data, error } = await supabase
        .from('user_cars')
        .select(`
          id,
          is_default,
          custom_make,
          custom_model,
          custom_consumo,
          car:cars (*)
        `)
        .eq('user_id', user.id)

      if (error) throw error

      if (data) {
        const cars = data.map((d: any) => {
          if (d.car) {
            return {
              ...d.car,
              is_default: d.is_default
            }
          } else {
            return {
              id: d.id,
              make: d.custom_make || 'Personalizado',
              model: d.custom_model || 'Coche manual',
              year: new Date().getFullYear(),
              combustible: 'Personalizado',
              consumo_l_100km: d.custom_consumo || 0,
              is_default: d.is_default
            }
          }
        })
        const defaultCar = cars.find(c => c.is_default)
        set({ 
          userCars: cars,
          selectedCarId: defaultCar?.id || (cars.length > 0 ? cars[0].id : null)
        })
      }
    } catch (error) {
      console.error('[Store Garage] Error fetching:', error)
    }
  },

  addUserCar: async (car) => {
    const { user, userCars } = get()
    if (!user) return
    if (userCars.some(c => c.id === car.id)) return
    
    try {
      const isFirst = userCars.length === 0
      const isCustom = typeof car.id === 'string' || car.id > 1000000000
      
      const { error } = await supabase
        .from('user_cars')
        .insert({
          user_id: user.id,
          car_id: isCustom ? null : car.id,
          is_default: isFirst,
          custom_make: isCustom ? car.make : null,
          custom_model: isCustom ? car.model : null,
          custom_consumo: isCustom ? car.consumo_l_100km : null
        })

      if (error) throw error
      await get().fetchUserCars()
      get().updateFilteredStations()
    } catch (error) {
      console.error('[Store Garage] Error adding:', error)
    }
  },

  removeUserCar: async (carId) => {
    const { user } = get()
    if (!user) return

    try {
      const isCustom = typeof carId === 'string'
      let query = supabase
        .from('user_cars')
        .delete()
        .eq('user_id', user.id)
        
      if (isCustom) query = query.eq('id', carId)
      else query = query.eq('car_id', carId)

      const { error } = await query

      if (error) throw error
      await get().fetchUserCars()
      get().updateFilteredStations()
    } catch (error) {
      console.error('[Store Garage] Error removing:', error)
    }
  },

  setSelectedCarId: async (id) => {
    const { user } = get()
    if (!user) return

    try {
      // Atomic update: unset all, set one
      await supabase
        .from('user_cars')
        .update({ is_default: false })
        .eq('user_id', user.id)

      if (id) {
        const isCustom = typeof id === 'string'
        let query = supabase
          .from('user_cars')
          .update({ is_default: true })
          .eq('user_id', user.id)
          
        if (isCustom) query = query.eq('id', id)
        else query = query.eq('car_id', id)
        
        await query
      }

      await get().fetchUserCars()
      get().updateFilteredStations()
    } catch (error) {
      console.error('[Store Garage] Error setting default:', error)
    }
  },

  updateFilteredStations: () => {
    const { stations, radius, selectedBrands, sortBy, showOnlyOpen, showOnlyUpdatedToday, stationDiscounts, userCars, selectedCarId, showOnlyFavorites, favoriteStationIds, refuelLiters, activeSEOFilter } = get()
    
    const currentFilteredMap = new Map(get().filteredStations.map(s => [s.idEstacion, s]))

    let filtered = stations.map(s => {
      const discount = stationDiscounts.get(s.idEstacion) || 0
      const newPrecio = (s.precioBase || 0) - discount
      
      const existing = currentFilteredMap.get(s.idEstacion)
      // Reutiliza la referencia en memoria si el precio y la distancia son idénticos
      if (existing && existing.precioCombustible === newPrecio && existing.distancia === s.distancia) {
        return existing
      }
      
      return {
        ...s,
        precioCombustible: newPrecio
      }
    }).filter(s => (s.precioBase || 0) > 0)

    if (activeSEOFilter) {
      const { provincia, municipio } = activeSEOFilter
      filtered = filtered.filter(s => {
        const provMatch = s.provincia?.toLowerCase().trim() === provincia.toLowerCase().trim()
        if (!provMatch) return false
        if (municipio) {
          return s.municipio?.toLowerCase().trim() === municipio.toLowerCase().trim()
        }
        return true
      })
    } else {
      filtered = filtered.filter(s => (s.distancia || 0) <= radius)
    }

    // Filter by Brand
    if (selectedBrands.length > 0) {
      filtered = filtered.filter(s => {
        const marca = s.marca?.toUpperCase() || ''
        return selectedBrands.some(b => marca.includes(b.toUpperCase()))
      })
    }

    // Filter by Favorites
    if (showOnlyFavorites) {
      filtered = filtered.filter(s => favoriteStationIds.includes(s.idEstacion))
    }

    // Filter by Open Now
    if (showOnlyOpen) {
      const now = new Date()
      // day of week: 1 (Mon) - 7 (Sun)
      const currentTime = now.getHours() * 100 + now.getMinutes()
      
      filtered = filtered.filter(s => {
        const horario = s.horario?.toUpperCase() || ''
        if (horario.includes('24H')) return true
        
        // Match HH:MM-HH:MM
        const match = horario.match(/(\d{2}):(\d{2})-(\d{2}):(\d{2})/)
        if (match) {
          const start = parseInt(match[1]) * 100 + parseInt(match[2])
          const end = parseInt(match[3]) * 100 + parseInt(match[4])
          
          if (end < start) { // Over midnight
            return currentTime >= start || currentTime <= end
          }
          return currentTime >= start && currentTime <= end
        }
        return true // Default if unparseable
      })
    }

    // Filter by Updated Today
    if (showOnlyUpdatedToday) {
      const now = new Date()
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      filtered = filtered.filter(s => {
        if (!s.lastUpdate) return false
        return s.lastUpdate.startsWith(today)
      })
    }

    // Sorting
    if (sortBy === 'smart' && filtered.length > 0) {
      const selectedCar = userCars.find(c => c.id === selectedCarId)
      
      if (selectedCar && selectedCar.consumo_l_100km > 0) {
        // Advanced Smart Filter: Based on REAL COST (Fuel + Time)
        const consumo_km = selectedCar.consumo_l_100km / 100
        const LITROS_REPOSTAJE_ESTIMADO = refuelLiters || 35 // Usar los litros indicados por el usuario
        const VALOR_TIEMPO_HORA = 12 // €/hora (costo de oportunidad)
        const VELOCIDAD_MEDIA_KMH = 35 // km/h (estimación urbana/mixta)

        const scoredStations = filtered.map(s => {
          const dist = s.distancia || 0
          const precio = s.precioCombustible || 9.99
          
          // Coste de combustible (ir y volver)
          const costeCombustibleViaje = dist * 2 * precio * consumo_km
          // Coste de tiempo (estimado)
          const tiempoViajeHoras = (dist * 2) / VELOCIDAD_MEDIA_KMH
          const costeTiempo = tiempoViajeHoras * VALOR_TIEMPO_HORA
          
          // Gasto Total = Precio del combustible + Gasto de viaje + Coste de tiempo
          const gastoTotal = (precio * LITROS_REPOSTAJE_ESTIMADO) + costeCombustibleViaje + costeTiempo
          
          return { station: s, score: gastoTotal }
        })

        scoredStations.sort((a, b) => a.score - b.score)
        filtered = scoredStations.map(item => item.station)
      } else {
        // Fallback to basic smart normalization with HEAVY distance weight
        const distances = filtered.map(s => s.distancia || 0)
        const prices = filtered.map(s => s.precioCombustible || 9.99)

        const minDist = Math.min(...distances)
        const maxDist = Math.max(...distances)
        const minPrice = Math.min(...prices)
        const maxPrice = Math.max(...prices)

        // Normalización con "colchón" para que diferencias de 1-2 céntimos no pesen tanto
        const norm = (val: number, min: number, max: number, margin = 0) => {
          const range = max - min
          if (range <= margin) return 0
          return (val - min) / range
        }

        const scoredStations = filtered.map(s => {
          // Le damos 70% de peso a la distancia y 30% al precio
          const dScore = norm(s.distancia || 0, minDist, maxDist)
          // Usamos un margen de 0.03€ para que variaciones pequeñas no disparen el score
          const pScore = norm(s.precioCombustible || 9.99, minPrice, maxPrice, 0.03)
          
          return { station: s, score: dScore * 0.7 + pScore * 0.3 }
        })

        scoredStations.sort((a, b) => a.score - b.score)
        filtered = scoredStations.map(item => item.station)
      }
    } else {
      filtered.sort((a, b) => {
        if (sortBy === 'price') {
          const priceA = a.precioCombustible || 999
          const priceB = b.precioCombustible || 999
          if (priceA !== priceB) return priceA - priceB
          return (a.distancia || 0) - (b.distancia || 0)
        } else {
          return (a.distancia || 0) - (b.distancia || 0)
        }
      })
    }

    // 🔥 VIRTUALIZACIÓN / LÍMITE:
    // Nunca renderizar más de 1500 estaciones a la vez para evitar congelamientos en el DOM
    // tanto en la lista de estaciones como en el MarkerCluster de Leaflet.
    // Como la lista ya está ordenada (por smart, precio o distancia), el usuario siempre
    // verá las 1500 "mejores" opciones, lo cual es más que suficiente.
    const MAX_RENDER_STATIONS = 1500
    if (filtered.length > MAX_RENDER_STATIONS) {
      filtered = filtered.slice(0, MAX_RENDER_STATIONS)
    }

    const currentFiltered = get().filteredStations
    // Pure data comparison to avoid reference changes if content is identical
    const isIdentical = filtered.length === currentFiltered.length && 
      filtered.every((s, i) => s.idEstacion === currentFiltered[i].idEstacion && s.precioCombustible === currentFiltered[i].precioCombustible)

    if (!isIdentical) {
      set({ filteredStations: filtered })
      get().syncProfile()
    }
  },

  // Auth implementation
  user: null,
  setUser: (user) => set({ user }),
  isLoadingAuth: true,
  isAuthScreenOpen: false,
  setIsAuthScreenOpen: (isAuthScreenOpen) => set({ isAuthScreenOpen }),

  signOut: async () => {
    try {
      console.log('🔄 [Auth] Starting sign out process...')
      
      console.log('📡 [Auth] Calling supabase.auth.signOut()...')
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('❌ [Auth] Supabase error during sign out:', error)
        throw error
      }
      console.log('✅ [Auth] Supabase sign out call successful')
      
      console.log('💾 [Auth] Resetting store state...')
      try {
        localStorage.removeItem('datafuelle_map_center')
        localStorage.removeItem('datafuelle_map_zoom')
        localStorage.removeItem('datafuelle_map_layer')
        localStorage.removeItem('datafuelle_current_location')
      } catch {}

      set({ 
        user: null, 
        searchHistory: [], 
        stations: [], 
        filteredStations: [],
        selectedStationId: null,
        userCars: [],
        selectedCarId: null,
        stationDiscounts: new Map(),
        currentLocation: { lat: 39.4699, lon: -0.3763 }
      })
      console.log('✅ [Auth] Store state reset')
      
      console.log('🚀 [Auth] Triggering page reload...')
      window.location.reload()
      
    } catch (error) {
      console.error('💥 [Auth] Critical error during sign out:', error)
      set({ user: null })
      window.location.reload()
    }
  },

  syncProfile: async () => {
    const { user, selectedFuelTypeId, radius, showOnlyOpen, showOnlyUpdatedToday, selectedBrands, searchHistory, stationDiscounts, favoriteStationIds } = get()
    if (!user || isInitialLoad) return

    if (syncTimeout) clearTimeout(syncTimeout)

    syncTimeout = setTimeout(async () => {
      console.log('📡 [Store Sync] Debounced sync starting...')
      try {
        const { error } = await supabase.from('profiles').upsert({
          id: user.id,
          fuel_type_id: selectedFuelTypeId,
          search_radius: radius,
          show_only_open: showOnlyOpen,
          show_only_updated_today: showOnlyUpdatedToday,
          selected_brands: selectedBrands,
          search_history: searchHistory,
          station_discounts: Array.from(stationDiscounts.entries()),
          favorite_station_ids: favoriteStationIds,
          updated_at: new Date().toISOString()
        })
        
        if (error) {
          console.error('❌ [Store Sync] Supabase Error:', error.message, error.details)
        } else {
          console.log('✅ [Store Sync] Success')
        }
      } catch (error) {
        console.error('❌ [Store Sync] Unexpected Error:', error)
      } finally {
        syncTimeout = null
      }
    }, 1000)
  },
}))

// Initialize Auth Listener
let isInitialLoad = true
let isSyncingProfile = false

supabase.auth.onAuthStateChange(async (event, session) => {
  const store = useAppStore.getState()
  const user = session?.user || null
  
  console.log(`🔑 [Auth] Event: ${event}`, user ? `User: ${user.email}` : 'No user')
  
  // Always update user state immediately
  if (store.user?.id !== user?.id) {
    store.setUser(user)
  }
  
  // Avoid redundant work for certain events
  if (event === 'TOKEN_REFRESHED') return
  if (!user) {
    if (event === 'SIGNED_OUT') {
      console.log('👋 [Auth] User signed out')
      useAppStore.setState({ isLoadingAuth: false })
    }
    return
  }

  // Use a small timeout to avoid race conditions with multiple rapid events
  // or parallel requests at startup.
  setTimeout(async () => {
    if (isSyncingProfile) return
    isSyncingProfile = true

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      try {
        console.log('📡 [Auth] Fetching user profile...')
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        clearTimeout(timeoutId)

        if (error && error.code !== 'PGRST116') {
          console.warn('⚠️ [Auth] Profile fetch warning:', error.message)
        }

        if (profile) {
          console.log('✅ [Auth] Profile found, restoring state')
          const oldRadius = useAppStore.getState().radius
          const oldFuel = useAppStore.getState().selectedFuelTypeId

          useAppStore.setState({
            selectedFuelTypeId: profile.fuel_type_id,
            radius: profile.search_radius,
            showOnlyOpen: profile.show_only_open,
            showOnlyUpdatedToday: profile.show_only_updated_today,
            selectedBrands: profile.selected_brands || [],
            searchHistory: profile.search_history || [],
            stationDiscounts: new Map(profile.station_discounts || []),
            favoriteStationIds: profile.favorite_station_ids || []
          })

          try {
            localStorage.setItem('datafuelle_favorites', JSON.stringify(profile.favorite_station_ids || []))
          } catch (e) {
            console.error('Error syncing loaded favorites to localStorage:', e)
          }

          console.log('🏎️ [Auth] Loading garage...')
          try {
            await store.fetchUserCars()
          } catch (e) {
            console.warn('⚠️ [Auth] Garage fetch failed')
          }
          
          if (profile.search_radius > oldRadius || profile.fuel_type_id !== oldFuel) {
            console.log('🔄 [Auth] Filters changed, re-fetching stations...')
            await store.fetchStations()
          } else {
            store.updateFilteredStations()
          }
        } else {
          console.log('ℹ [Auth] No profile yet, sync current defaults')
          if (!isInitialLoad) {
            store.syncProfile()
          }
        }
      } catch (err: any) {
        clearTimeout(timeoutId)
        console.error('❌ [Auth] Error in Auth sequence:', err.message || err)
      } finally {
        isSyncingProfile = false
        store.setIsLoading(false)
        useAppStore.setState({ isLoadingAuth: false })
        if (isInitialLoad) {
          isInitialLoad = false
          console.log('🏁 [Auth] Initial load sequence complete')
        }
      }
    } catch (err: any) {
      console.error('❌ [Auth] Top-level error in Listener:', err)
      isSyncingProfile = false
    }
  }, isInitialLoad ? 100 : 0)
})
