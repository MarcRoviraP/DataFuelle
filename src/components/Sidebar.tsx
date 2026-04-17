import { useState, useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import { geocodeAddress } from '../utils/geo'
import { Search, MapPin, Fuel, Navigation, History, Filter } from 'lucide-react'

export const Sidebar = () => {
  const {
    currentLocation,
    setCurrentLocation,
    radius,
    setRadius,
    selectedFuelTypeId,
    setSelectedFuelTypeId,
    fuelTypes,
    stations,
    searchHistory,
    addToHistory,
    isLoading,
    selectedBrands,
    setSelectedBrands,
    sortBy,
    setSortBy,
    showOnlyOpen,
    setShowOnlyOpen,
    showOnlyUpdatedToday,
    setShowOnlyUpdatedToday,
    setIsSidebarOpen,
  } = useAppStore()

  const [searchQuery, setSearchQuery] = useState('')

  // Auto-fetch on mount/location change if no stations yet
  useEffect(() => {
    if (currentLocation && stations.length === 0 && !isLoading) {
      handleSearch()
    }
  }, [currentLocation])


  const handleSearch = async (overrideQuery?: string) => {
    const query = overrideQuery ?? searchQuery;

    if (query.trim()) {
      useAppStore.getState().setIsLoading(true)
      const coords = await geocodeAddress(query)
      if (coords) {
        setCurrentLocation(coords.lat, coords.lon)
        if (query) addToHistory(query)
      } else {
        alert('No se ha podido encontrar la ubicación del municipio o CP especificado.')
        useAppStore.getState().setIsLoading(false)
        return
      }
    }

    if (!currentLocation && !query.trim()) {
      alert('Por favor, permite el acceso a tu ubicación, selecciona una en el mapa o escribe un municipio.')
      return
    }

    try {
      await useAppStore.getState().fetchStations()
      setSearchQuery('')
      // Close sidebar on mobile after search
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false)
      }
    } catch (error) {
      alert(`Error en la búsqueda: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }

  const handleGeoLocation = () => {
    useAppStore.getState().setIsLoading(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentLocation(position.coords.latitude, position.coords.longitude)
        useAppStore.getState().fetchStations()
      },
      (error) => {
        useAppStore.getState().setIsLoading(false)
        let message = 'No se pudo obtener tu ubicación.'
        if (error.code === error.PERMISSION_DENIED) message = 'Se denegó el acceso a la ubicación. Cambia los permisos de tu navegador.'
        if (error.code === error.POSITION_UNAVAILABLE) message = 'La información de ubicación no está disponible.'
        if (error.code === error.TIMEOUT) message = 'Se agotó el tiempo de espera para obtener la ubicación.'
        alert(message)
      }
    )
  }

  const handleFuelChange = async (id: number) => {
    setSelectedFuelTypeId(id)
    if (stations.length > 0 && currentLocation) {
      useAppStore.getState().fetchStations()
    }
  }

  const handleRadiusChange = async (r: number) => {
    setRadius(r)
    if (stations.length > 0 && currentLocation) {
      useAppStore.getState().fetchStations()
    }
  }

  return (
    <aside className="w-[300px] md:w-[380px] max-w-[90vw] h-full bg-white flex flex-col shadow-2xl z-20 overflow-hidden custom-scrollbar">
      <div className="p-6 bg-blue-600 text-white shrink-0">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Fuel size={28} className="text-blue-200" />
          DataFuelle
        </h1>
        <p className="text-blue-100/70 text-sm mt-1">Busca el mejor precio cerca de ti</p>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 space-y-8 scroll-smooth">
        {/* Search & Location Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-slate-800 font-bold px-1 border-l-4 border-blue-500">
            <Navigation size={18} />
            <h2>Búsqueda y Ubicación</h2>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleGeoLocation}
              className="flex items-center justify-center gap-2 w-full py-3 bg-blue-50 text-blue-700 font-bold rounded-xl border-2 border-dashed border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition-all active:scale-[0.98] duration-200 group"
            >
              <MapPin size={18} className="group-hover:animate-bounce" />
              Usar mi ubicación
            </button>

            <form 
              onSubmit={(e) => { e.preventDefault(); handleSearch(); }}
              className="relative group focus-within:ring-2 focus-within:ring-blue-100 rounded-xl transition-all"
            >
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors pointer-events-none">
                {isLoading ? (
                  <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin block" />
                ) : (
                  <MapPin size={18} />
                )}
              </div>
              <input
                type="text"
                placeholder="Municipio o CP (Ej: Valencia)"
                className="w-full pl-11 pr-12 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white transition-all text-slate-700 placeholder:text-slate-400 font-semibold shadow-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:scale-95 transition-all shadow-lg shadow-blue-200"
                title="Buscar ubicación"
              >
                <Search size={18} />
              </button>
            </form>
          </div>
        </section>

        <section className="space-y-4 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2 text-slate-800 font-bold px-1 border-l-4 border-blue-500">
            <Filter size={18} />
            <h2>Filtros Avanzados</h2>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
                Tipo de combustible
              </label>
              <select
                className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:outline-none focus:border-blue-400 transition-all appearance-none cursor-pointer text-slate-700 font-semibold pr-10 relative"
                value={selectedFuelTypeId}
                onChange={(e) => handleFuelChange(Number(e.target.value))}
              >
                {fuelTypes.map((type: any) => (
                  <option key={type.idFuelType} value={type.idFuelType}>
                    {type.fuelTypeName}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
                Ordenar por
              </label>
              <select
                className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:outline-none focus:border-blue-400 transition-all appearance-none cursor-pointer text-slate-700 font-semibold pr-10 relative"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'price' | 'distance' | 'smart')}
              >
                <option value="smart">Smart (Equilibrado)</option>
                <option value="price">Precio (Económico)</option>
                <option value="distance">Proximidad</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
                Marcas principales
              </label>
              <div className="flex flex-wrap gap-2">
                {['REPSOL', 'CEPSA', 'BP', 'GALP', 'SHELL'].map((brand) => (
                  <button
                    key={brand}
                    onClick={() => {
                      if (selectedBrands.includes(brand)) {
                        setSelectedBrands(selectedBrands.filter((b) => b !== brand))
                      } else {
                        setSelectedBrands([...selectedBrands, brand])
                      }
                    }}
                    className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                      selectedBrands.includes(brand)
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {brand}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between px-1">
              <label className="text-sm font-bold text-slate-700">
                Abierto ahora
              </label>
              <button
                onClick={() => setShowOnlyOpen(!showOnlyOpen)}
                className={`w-12 h-6 rounded-full p-1 transition-colors ${
                  showOnlyOpen ? 'bg-blue-500' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    showOnlyOpen ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between px-1">
              <label className="text-sm font-bold text-slate-700">
                Actualizadas hoy
              </label>
              <button
                onClick={() => setShowOnlyUpdatedToday(!showOnlyUpdatedToday)}
                className={`w-12 h-6 rounded-full p-1 transition-colors ${
                  showOnlyUpdatedToday ? 'bg-green-500' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    showOnlyUpdatedToday ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-center px-1">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Radio de búsqueda
                </label>
                <span className="text-sm font-black text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">
                  {radius} km
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="100"
                step="1"
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 hover:accent-blue-700 transition-all"
                value={radius}
                onChange={(e) => handleRadiusChange(Number(e.target.value))}
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-bold px-1">
                <span>1KM</span>
                <span>100KM</span>
              </div>
            </div>
          </div>
        </section>

        {/* Search History Section */}
        {searchHistory.length > 0 && (
          <section className="space-y-4 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2 text-slate-800 font-bold px-1 border-l-4 border-blue-500">
              <History size={18} />
              <h2>Recientes</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {searchHistory.map((h, i) => (
                <button
                  key={i}
                  className="px-3 py-1.5 bg-slate-100 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors"
                  onClick={() => {
                    setSearchQuery(h)
                    handleSearch(h)
                  }}
                >
                  {h}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

    </aside>
  )
}
