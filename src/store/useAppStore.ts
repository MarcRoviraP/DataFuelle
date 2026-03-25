import { create } from 'zustand'
import type { Station, FuelType } from '../services/api'
import { calculateDistance } from '../utils/geo'

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
  sortBy: 'price' | 'distance'
  setSortBy: (sortBy: 'price' | 'distance') => void
  showOnlyOpen: boolean
  setShowOnlyOpen: (open: boolean) => void

  // Search History
  searchHistory: string[]
  addToHistory: (query: string) => void
  clearHistory: () => void

  // Selected station (shared between list and map)
  selectedStationId: number | null
  setSelectedStationId: (id: number | null) => void

  // Actions
  updateFilteredStations: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  currentLocation: null, // Default to null, will fetch user location on startup
  setCurrentLocation: (lat, lon) => set({ currentLocation: { lat, lon } }),

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
  sortBy: 'price',
  setSortBy: (sortBy) => {
    set({ sortBy })
    get().updateFilteredStations()
  },
  showOnlyOpen: false,
  setShowOnlyOpen: (showOnlyOpen) => {
    set({ showOnlyOpen })
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
    set({ stations: stationsWithDist })
    get().updateFilteredStations()
  },

  filteredStations: [],
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

  updateFilteredStations: () => {
    const { stations, radius, selectedBrands, sortBy, showOnlyOpen } = get()
    
    let filtered = stations.filter(s => (s.distancia || 0) <= radius && (s.precioCombustible || 0) > 0)

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

    // Sorting
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

    set({ filteredStations: filtered })
  },
}))
