import { create } from 'zustand'
import type { Station, FuelType } from '../services/api'
import { fetchStationsByRadius, fetchRecentPriceChanges } from '../services/api'
import type { User } from '@supabase/supabase-js'
import { calculateDistance } from '../utils/geo'
import { supabase } from '../services/supabaseClient'

let syncTimeout: any = null

export interface Car {
  id: number
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
  selectedCarId: number | null
  fetchUserCars: () => Promise<void>
  addUserCar: (car: Car) => Promise<void>
  removeUserCar: (carId: number) => Promise<void>
  setSelectedCarId: (id: number | null) => Promise<void>

  // Actions
  fetchStations: () => Promise<void>
  updateFilteredStations: () => void
  syncProfile: () => Promise<void>
  signOut: () => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  isSidebarOpen: false,
  setIsSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
  viewMode: 'map',
  setViewMode: (mode) => set({ viewMode: mode }),
  currentLocation: { lat: 39.4699, lon: -0.3763 },
  setCurrentLocation: (lat, lon) => {
    set({ currentLocation: { lat, lon } })
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
  setStations: (stations) => {
    const { currentLocation } = get()
    let stationsWithDist = stations
    if (currentLocation) {
      stationsWithDist = stations.map((s) => ({
        ...s,
        distancia: calculateDistance(currentLocation.lat, currentLocation.lon, s.latitud, s.longitud),
      }))
    }
    
    // Apply existing price changes if any
    const changes = get().priceChanges
    const stationsWithChanges = stationsWithDist.map(s => {
      const change = changes.get(s.idEstacion)
      return { 
        ...s, 
        precioBase: s.precioCombustible,
        diff: change ? parseFloat(change.diferencia) : undefined,
        delta_pct: change ? parseFloat(change.delta_pct) : undefined,
        precioAnterior: change ? parseFloat(change.precioAnterior) : undefined
      }
    })

    set({ stations: stationsWithChanges })
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
  setSelectedStationId: (id) => set({ selectedStationId: id }),

  isLoading: false,
  setIsLoading: (isLoading) => set({ isLoading }),

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
    const { currentLocation, radius, selectedFuelTypeId, setIsLoading, setStations, setPriceChanges } = get()
    
    if (!currentLocation) return

    setIsLoading(true)
    try {
      const [data, priceChanges] = await Promise.all([
        fetchStationsByRadius(
          currentLocation.lat,
          currentLocation.lon,
          radius,
          selectedFuelTypeId
        ),
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
          is_default,
          car:cars (*)
        `)
        .eq('user_id', user.id)

      if (error) throw error

      if (data) {
        const cars = data.map((d: any) => ({
          ...d.car,
          is_default: d.is_default
        }))
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
      const { error } = await supabase
        .from('user_cars')
        .insert({
          user_id: user.id,
          car_id: car.id,
          is_default: isFirst
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
      const { error } = await supabase
        .from('user_cars')
        .delete()
        .eq('user_id', user.id)
        .eq('car_id', carId)

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
        await supabase
          .from('user_cars')
          .update({ is_default: true })
          .eq('user_id', user.id)
          .eq('car_id', id)
      }

      await get().fetchUserCars()
      get().updateFilteredStations()
    } catch (error) {
      console.error('[Store Garage] Error setting default:', error)
    }
  },

  updateFilteredStations: () => {
    const { stations, radius, selectedBrands, sortBy, showOnlyOpen, showOnlyUpdatedToday, stationDiscounts, userCars, selectedCarId } = get()
    
    let filtered = stations.map(s => ({
      ...s,
      precioCombustible: (s.precioBase || 0) - (stationDiscounts.get(s.idEstacion) || 0)
    })).filter(s => (s.distancia || 0) <= radius && (s.precioBase || 0) > 0)

    // Filter by Brand
    if (selectedBrands.length > 0) {
      filtered = filtered.filter(s => {
        const marca = s.marca?.toUpperCase() || ''
        return selectedBrands.some(b => marca.includes(b.toUpperCase()))
      })
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
        const LITROS_REPOSTAJE_ESTIMADO = 35 // Un tanque parcial más realista
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
    const { user, selectedFuelTypeId, radius, showOnlyOpen, showOnlyUpdatedToday, selectedBrands, searchHistory, stationDiscounts } = get()
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
  
  // Avoid redundant work if the event is just a token refresh without user change
  if (event === 'TOKEN_REFRESHED') return

  try {
    if (user && !isSyncingProfile) {
      isSyncingProfile = true
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)

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
            stationDiscounts: new Map(profile.station_discounts || [])
          })

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
          console.log('ℹ️ [Auth] No profile yet, sync current defaults')
          if (!isInitialLoad) {
            store.syncProfile()
          }
        }
      } catch (err: any) {
        clearTimeout(timeoutId)
        if (err.name === 'AbortError') {
          console.error('❌ [Auth] Profile fetch timed out after 8s')
        } else {
          console.error('❌ [Auth] Error in Auth sequence:', err)
        }
      } finally {
        isSyncingProfile = false
      }
    }
  } catch (err: any) {
    console.error('❌ [Auth] Top-level error in Listener:', err)
    isSyncingProfile = false
  } finally {
    store.setIsLoading(false)
    useAppStore.setState({ isLoadingAuth: false })
    isInitialLoad = false
    console.log('🏁 [Auth] Initial load sequence complete')
  }
})
