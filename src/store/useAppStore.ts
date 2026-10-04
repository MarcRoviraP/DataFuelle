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

export interface PinnedLocation {
  id: string
  lat: number
  lon: number
  label: string
}

interface AppState {
  // Location
  currentLocation: { lat: number; lon: number } | null
  setCurrentLocation: (lat: number, lon: number) => void
  pinnedLocations: PinnedLocation[]
  addPinnedLocation: (lat: number, lon: number, label?: string) => void
  removePinnedLocation: (id: string) => void
  clearPinnedLocations: () => void

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
  vehicleConsumption: number
  setVehicleConsumption: (consumption: number) => void
  isRoundTrip: boolean
  setIsRoundTrip: (isRoundTrip: boolean) => void
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
  pinnedLocations: (() => {
    try {
      const stored = localStorage.getItem('datafuelle_pinned_locations')
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })(),
  addPinnedLocation: (lat, lon, label) => {
    const pins = get().pinnedLocations
    const nextNum = pins.length + 1
    const newPin: PinnedLocation = {
      id: `pin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      lat,
      lon,
      label: label || `Chincheta ${nextNum}`
    }
    const updated = [...pins, newPin]
    set({ pinnedLocations: updated })
    try {
      localStorage.setItem('datafuelle_pinned_locations', JSON.stringify(updated))
    } catch {}
    get().fetchStations()
  },
  removePinnedLocation: (id) => {
    const updated = get().pinnedLocations.filter(p => p.id !== id)
    set({ pinnedLocations: updated })
    try {
      localStorage.setItem('datafuelle_pinned_locations', JSON.stringify(updated))
    } catch {}
    get().fetchStations()
  },
  clearPinnedLocations: () => {
    set({ pinnedLocations: [] })
    try {
      localStorage.removeItem('datafuelle_pinned_locations')
    } catch {}
    get().fetchStations()
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
  vehicleConsumption: (() => {
    try {
      const stored = localStorage.getItem('datafuelle_vehicle_consumption')
      if (stored) {
        const parsed = parseFloat(stored)
        if (!isNaN(parsed) && parsed > 0) return parsed
      }
    } catch {}
    return 6.5
  })(),
  setVehicleConsumption: (consumption) => {
    set({ vehicleConsumption: consumption })
    try {
      localStorage.setItem('datafuelle_vehicle_consumption', consumption.toString())
    } catch {}
    get().updateFilteredStations()
  },
  isRoundTrip: (() => {
    try {
      const stored = localStorage.getItem('datafuelle_round_trip')
      if (stored !== null) return stored === 'true'
    } catch {}
    return true
  })(),
  setIsRoundTrip: (isRoundTrip) => {
    set({ isRoundTrip })
    try {
      localStorage.setItem('datafuelle_round_trip', isRoundTrip.toString())
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
    const { currentLocation, pinnedLocations, stations: currentStations, priceChanges } = get()
    
    const currentStationsMap = new Map(currentStations.map(s => [s.idEstacion, s]))
    const nextStations = []

    const anchors = [
      ...(currentLocation ? [{ lat: currentLocation.lat, lon: currentLocation.lon, label: 'Ubicación actual' }] : []),
      ...pinnedLocations.map(p => ({ lat: p.lat, lon: p.lon, label: p.label }))
    ]

    for (const newS of newStations) {
      const change = priceChanges.get(newS.idEstacion)
      const diff = change ? parseFloat(change.diferencia) : undefined
      const delta_pct = change ? parseFloat(change.delta_pct) : undefined
      const precioAnterior = change ? parseFloat(change.precioAnterior) : undefined
      
      let dist = newS.distancia
      let anchorLabel = newS.anchorLabel || 'Ubicación actual'
      if (anchors.length > 0) {
        let minDist = Infinity
        let bestLabel = ''
        for (const a of anchors) {
          const d = calculateDistance(a.lat, a.lon, newS.latitud, newS.longitud)
          if (d < minDist) {
            minDist = d
            bestLabel = a.label
          }
        }
        dist = minDist
        anchorLabel = bestLabel
      }

      const existing = currentStationsMap.get(newS.idEstacion)
      
      // Keep existing reference if core data hasn't changed to avoid React re-renders
      if (
        existing &&
        existing.precioBase === newS.precioCombustible &&
        existing.distancia === dist &&
        existing.anchorLabel === anchorLabel &&
        existing.diff === diff
      ) {
        nextStations.push(existing)
        continue
      }

      nextStations.push({
        ...newS,
        distancia: dist,
        anchorLabel,
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
    const { currentLocation, pinnedLocations, radius, selectedFuelTypeId, setIsLoading, setStations, setPriceChanges, activeSEOFilter } = get()
    
    if (!currentLocation && pinnedLocations.length === 0 && !activeSEOFilter) return

    setIsLoading(true)
    try {
      const promises: Promise<Station[]>[] = []

      if (activeSEOFilter) {
        promises.push(
          fetchStationsByProvinceOrMunicipality(
            activeSEOFilter.provincia,
            activeSEOFilter.municipio || null,
            selectedFuelTypeId,
            currentLocation?.lat,
            currentLocation?.lon
          )
        )
      } else {
        if (currentLocation) {
          promises.push(
            fetchStationsByRadius(
              currentLocation.lat,
              currentLocation.lon,
              radius,
              selectedFuelTypeId
            )
          )
        }
        for (const pin of pinnedLocations) {
          promises.push(
            fetchStationsByRadius(
              pin.lat,
              pin.lon,
              radius,
              selectedFuelTypeId
            )
          )
        }
      }

      const [stationsResults, priceChanges] = await Promise.all([
        Promise.all(promises),
        fetchRecentPriceChanges(selectedFuelTypeId)
      ])

      const mergedMap = new Map<number, Station>()
      for (const list of stationsResults) {
        for (const s of list) {
          if (!mergedMap.has(s.idEstacion)) {
            mergedMap.set(s.idEstacion, s)
          }
        }
      }

      setPriceChanges(priceChanges)
      setStations(Array.from(mergedMap.values()))
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
        const selectedId = defaultCar?.id || (cars.length > 0 ? cars[0].id : null)
        const activeCar = cars.find(c => c.id === selectedId)
        set({ 
          userCars: cars,
          selectedCarId: selectedId,
          ...(activeCar && activeCar.consumo_l_100km > 0 ? { vehicleConsumption: activeCar.consumo_l_100km } : {})
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

      if (id) {
        const found = get().userCars.find(c => c.id === id)
        if (found && found.consumo_l_100km > 0) {
          get().setVehicleConsumption(found.consumo_l_100km)
        }
      }

      await get().fetchUserCars()
      get().updateFilteredStations()
    } catch (error) {
      console.error('[Store Garage] Error setting default:', error)
    }
  },

  updateFilteredStations: () => {
    const { stations, radius, selectedBrands, sortBy, showOnlyOpen, showOnlyUpdatedToday, stationDiscounts, showOnlyFavorites, favoriteStationIds, refuelLiters, vehicleConsumption, isRoundTrip, activeSEOFilter } = get()
    
    const currentFilteredMap = new Map(get().filteredStations.map(s => [s.idEstacion, s]))

    const liters = refuelLiters > 0 ? refuelLiters : 35
    const consumption = vehicleConsumption > 0 ? vehicleConsumption : 6.5
    const tripMultiplier = isRoundTrip ? 2 : 1

    let filtered = stations.map(s => {
      const discount = stationDiscounts.get(s.idEstacion) || 0
      const newPrecio = (s.precioBase || 0) - discount
      const dist = s.distancia || 0
      const tripDistance = dist * tripMultiplier
      const travelLiters = tripDistance * (consumption / 100)
      const travelCost = Number((travelLiters * newPrecio).toFixed(2))
      const refuelCost = Number((liters * newPrecio).toFixed(2))
      const estimatedCost = Number((refuelCost + travelCost).toFixed(2))
      
      const existing = currentFilteredMap.get(s.idEstacion)
      if (
        existing &&
        existing.precioCombustible === newPrecio &&
        existing.distancia === dist &&
        existing.estimatedCost === estimatedCost
      ) {
        return existing
      }
      
      return {
        ...s,
        precioCombustible: newPrecio,
        travelCost,
        refuelCost,
        estimatedCost,
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
      const currentTime = now.getHours() * 100 + now.getMinutes()
      
      filtered = filtered.filter(s => {
        const horario = s.horario?.toUpperCase() || ''
        if (horario.includes('24H')) return true
        
        const match = horario.match(/(\d{2}):(\d{2})-(\d{2}):(\d{2})/)
        if (match) {
          const start = parseInt(match[1]) * 100 + parseInt(match[2])
          const end = parseInt(match[3]) * 100 + parseInt(match[4])
          
          if (end < start) {
            return currentTime >= start || currentTime <= end
          }
          return currentTime >= start && currentTime <= end
        }
        return true
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

    // Calculate comparative metrics: find nearest station and lowest estimated cost
    const validStationsWithDist = filtered.filter(s => typeof s.distancia === 'number' && s.distancia >= 0)
    let nearestStation: Station | undefined
    if (validStationsWithDist.length > 0) {
      nearestStation = validStationsWithDist.reduce((prev, curr) => 
        (curr.distancia ?? Infinity) < (prev.distancia ?? Infinity) ? curr : prev
      )
    }

    let minEstimatedCost = Infinity
    filtered.forEach(s => {
      if (s.estimatedCost !== undefined && s.estimatedCost > 0 && s.estimatedCost < minEstimatedCost) {
        minEstimatedCost = s.estimatedCost
      }
    })

    filtered = filtered.map(s => {
      const isBest = s.estimatedCost !== undefined && s.estimatedCost > 0 && s.estimatedCost === minEstimatedCost
      let savingsVsNearest: number | undefined
      if (nearestStation && nearestStation.estimatedCost !== undefined && s.estimatedCost !== undefined) {
        savingsVsNearest = Number((nearestStation.estimatedCost - s.estimatedCost).toFixed(2))
      }
      return {
        ...s,
        isBestOption: isBest,
        savingsVsNearest,
      }
    })

    // Sorting
    if (sortBy === 'smart' && filtered.length > 0) {
      filtered.sort((a, b) => {
        const costA = a.estimatedCost ?? 99999
        const costB = b.estimatedCost ?? 99999
        if (costA !== costB) return costA - costB
        return (a.distancia || 0) - (b.distancia || 0)
      })
    } else if (sortBy === 'price') {
      filtered.sort((a, b) => {
        const priceA = a.precioCombustible || 999
        const priceB = b.precioCombustible || 999
        if (priceA !== priceB) return priceA - priceB
        return (a.distancia || 0) - (b.distancia || 0)
      })
    } else {
      filtered.sort((a, b) => {
        return (a.distancia || 0) - (b.distancia || 0)
      })
    }

    const MAX_RENDER_STATIONS = 1500
    if (filtered.length > MAX_RENDER_STATIONS) {
      filtered = filtered.slice(0, MAX_RENDER_STATIONS)
    }

    const currentFiltered = get().filteredStations
    const isIdentical = filtered.length === currentFiltered.length && 
      filtered.every((s, i) => 
        s.idEstacion === currentFiltered[i].idEstacion && 
        s.precioCombustible === currentFiltered[i].precioCombustible &&
        s.estimatedCost === currentFiltered[i].estimatedCost &&
        s.isBestOption === currentFiltered[i].isBestOption
      )

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
