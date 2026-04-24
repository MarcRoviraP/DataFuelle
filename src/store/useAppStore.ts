import { create } from 'zustand'
import type { Station, FuelType } from '../services/api'
import { fetchStationsByRadius, fetchRecentPriceChanges } from '../services/api'
import { calculateDistance } from '../utils/geo'
import { supabase } from '../services/supabaseClient'
import type { User } from '@supabase/supabase-js'

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
  currentLocation: JSON.parse(localStorage.getItem('lastLocation') || '{"lat": 39.4699, "lon": -0.3763}'),
  setCurrentLocation: (lat, lon) => {
    const location = { lat, lon }
    localStorage.setItem('lastLocation', JSON.stringify(location))
    set({ currentLocation: location })
  },
  stationDiscounts: new Map(JSON.parse(localStorage.getItem('stationDiscounts') || '[]')),
  setStationDiscount: (stationId, discount) => {
    const discounts = new Map(get().stationDiscounts)
    if (discount <= 0) {
      discounts.delete(stationId)
    } else {
      discounts.set(stationId, discount)
    }
    localStorage.setItem('stationDiscounts', JSON.stringify(Array.from(discounts.entries())))
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
    localStorage.setItem('lastStations', JSON.stringify(stationsWithChanges))
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

  filteredStations: JSON.parse(localStorage.getItem('lastStations') || '[]'),
  setFilteredStations: (stations) => set({ filteredStations: stations }),

  selectedStationId: null,
  setSelectedStationId: (id) => set({ selectedStationId: id }),

  isLoading: false,
  setIsLoading: (isLoading) => set({ isLoading }),

  searchHistory: JSON.parse(localStorage.getItem('searchHistory') || '[]'),
  addToHistory: (query) => {
    const history = get().searchHistory
    const newHistory = [query, ...history.filter((q) => q !== query)].slice(0, 10)
    localStorage.setItem('searchHistory', JSON.stringify(newHistory))
    set({ searchHistory: newHistory })
  },
  clearHistory: () => {
    localStorage.removeItem('searchHistory')
    set({ searchHistory: [] })
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

  updateFilteredStations: () => {
    const { stations, radius, selectedBrands, sortBy, showOnlyOpen, showOnlyUpdatedToday, stationDiscounts } = get()
    
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
      const distances = filtered.map(s => s.distancia || 0)
      const prices = filtered.map(s => s.precioCombustible || 9.99)

      const minDist = Math.min(...distances)
      const maxDist = Math.max(...distances)
      const minPrice = Math.min(...prices)
      const maxPrice = Math.max(...prices)

      const norm = (val: number, min: number, max: number) => 
        max === min ? 0 : (val - min) / (max - min)

      const scoredStations = filtered.map(s => {
        const dScore = norm(s.distancia || 0, minDist, maxDist)
        const pScore = norm(s.precioCombustible || 9.99, minPrice, maxPrice)
        // Weighting: 50% distance, 50% price
        return { station: s, score: dScore * 0.5 + pScore * 0.5 }
      })

      scoredStations.sort((a, b) => a.score - b.score)
      filtered = scoredStations.map(item => item.station)
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
      
      console.log('🧹 [Auth] Clearing local storage keys...')
      localStorage.removeItem('lastStations')
      localStorage.removeItem('searchHistory')
      localStorage.removeItem('lastLocation')
      localStorage.removeItem('stationDiscounts')
      console.log('✅ [Auth] Local storage cleared')
      
      console.log('💾 [Auth] Resetting store state...')
      set({ 
        user: null, 
        searchHistory: [], 
        stations: [], 
        filteredStations: [],
        selectedStationId: null 
      })
      console.log('✅ [Auth] Store state reset')
      
      console.log('🚀 [Auth] Triggering page reload...')
      window.location.reload()
      
    } catch (error) {
      console.error('💥 [Auth] Critical error during sign out:', error)
      // Force local sign out and reload anyway if the API fails
      console.warn('⚠️ [Auth] Attempting forced local reset...')
      set({ user: null })
      window.location.reload()
    }
  },

  syncProfile: async () => {
    const { user, selectedFuelTypeId, radius, showOnlyOpen, showOnlyUpdatedToday, selectedBrands, searchHistory } = get()
    if (!user) return

    try {
      await supabase.from('profiles').upsert({
        id: user.id,
        fuel_type_id: selectedFuelTypeId,
        search_radius: radius,
        show_only_open: showOnlyOpen,
        show_only_updated_today: showOnlyUpdatedToday,
        selected_brands: selectedBrands,
        search_history: searchHistory,
        updated_at: new Date().toISOString()
      })
    } catch (error) {
      console.error('[Store Sync] Error:', error)
    }
  },
}))

// Initialize Auth Listener
supabase.auth.onAuthStateChange(async (_event, session) => {
  const store = useAppStore.getState()
  const user = session?.user || null
  store.setUser(user)
  
  if (user) {
    // Load profile from Supabase
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profile) {
      useAppStore.setState({
        selectedFuelTypeId: profile.fuel_type_id,
        radius: profile.search_radius,
        showOnlyOpen: profile.show_only_open,
        showOnlyUpdatedToday: profile.show_only_updated_today,
        selectedBrands: profile.selected_brands || [],
        searchHistory: profile.search_history || []
      })
      store.updateFilteredStations()
    } else {
      // First time user: save current local preferences as initial profile
      store.syncProfile()
    }
  }
  
  useAppStore.setState({ isLoadingAuth: false })
})
