import { useState, useRef, useMemo } from 'react'
import { useAppStore } from '../store/useAppStore'
import { fetchSuggestions, geocodeAddress } from '../utils/geo'
import { Search, MapPin, Fuel, Navigation, History, Filter, X, Tag, LogIn, LogOut, Zap, ArrowUpDown, Car } from 'lucide-react'
import { Garage } from './Garage'

export const Sidebar = () => {
  const {
    currentLocation,
    setCurrentLocation,
    radius,
    setRadius,
    selectedFuelTypeId,
    setSelectedFuelTypeId,
    stations,
    searchHistory,
    addToHistory,
    isLoading,
    selectedBrands,
    setSelectedBrands,
    showOnlyOpen,
    setShowOnlyOpen,
    showOnlyUpdatedToday,
    setShowOnlyUpdatedToday,
    setIsSidebarOpen,
    user,
    signOut,
    sortBy,
    setSortBy,
    userCars,
    selectedCarId,
  } = useAppStore()

  const [isGarageOpen, setIsGarageOpen] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const debounceRef = useRef<number | null>(null)

  // Verified major brands with >= 100 stations in the global database (Updated from Real DB Stats)
  const brandsToShow = useMemo(() => [
    'REPSOL', 'GALP', 'CEPSA', 'MOEVE', 'BP', 'SHELL', 'BALLENOIL', 'PLENERGY', 'INTERMARCHÉ', 'PRIO', 'PETROPRIX', 'PETRONOR', 'ALVES BANDEIRA', 'CARREFOUR', 'AVIA'
  ], [])


  // Handle autocomplete input changes
  const handleInputChange = (val: string) => {
    setSearchQuery(val)
    
    if (debounceRef.current) clearTimeout(debounceRef.current)
    
    if (val.length < 3) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    debounceRef.current = window.setTimeout(async () => {
      const results = await fetchSuggestions(val, currentLocation?.lat, currentLocation?.lon)
      setSuggestions(results)
      setShowSuggestions(results.length > 0)
    }, 300)
  }

  const handleSelectSuggestion = (suggestion: any) => {
    const { lat, lon, display_name } = suggestion
    const simpleName = display_name.split(',')[0]
    
    setSearchQuery(simpleName)
    setSuggestions([])
    setShowSuggestions(false)
    setCurrentLocation(parseFloat(lat), parseFloat(lon))
    addToHistory(simpleName)
    
    // Explicitly call fetchStations via store action - immediate update
    useAppStore.getState().fetchStations()
  }

  const handleSearch = async (overrideQuery?: string) => {
    const query = overrideQuery ?? searchQuery;

    if (query.trim()) {
      useAppStore.getState().setIsLoading(true)
      const coords = await geocodeAddress(query)
      if (coords) {
        setCurrentLocation(coords.lat, coords.lon)
        if (query) addToHistory(query)
        setShowSuggestions(false)
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

  const activeCar = userCars.find(c => c.id === selectedCarId)

  return (
    <>
      <aside className="w-[300px] md:w-[380px] max-w-[90vw] h-full bg-white flex flex-col shadow-2xl z-20 overflow-hidden custom-scrollbar">
      {/* Integrated Header: Identity + Auth */}
      <div className="p-6 pb-2 shrink-0 flex flex-col gap-4 animate-in fade-in duration-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 group cursor-pointer" onClick={() => window.location.reload()}>
            <div className="bg-blue-600 p-1.5 rounded-xl shadow-lg shadow-blue-100">
              <Fuel size={18} className="text-white" />
            </div>
            <span className="text-xl font-black text-slate-900 tracking-tighter">
              Data<span className="text-blue-600">Fuelle</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {!user ? (
              <button
                onClick={() => useAppStore.getState().setIsAuthScreenOpen(true)}
                className="text-sm font-black text-slate-900 hover:text-blue-600 transition-colors flex items-center gap-1.5"
              >
                <LogIn size={16} />
                <span>Entrar</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 group">
                <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-xs ring-2 ring-white shadow-md">
                  {user.email?.[0].toUpperCase()}
                </div>
                <button
                  onClick={() => signOut()}
                  className="flex items-center gap-2 px-3 py-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl border border-slate-100 hover:border-red-100 transition-all duration-200 cursor-pointer group"
                  title="Cerrar sesión"
                >
                  <LogOut size={16} className="group-hover:translate-x-0.5 transition-transform" />
                  <span className="text-xs font-black uppercase tracking-tight">Salir</span>
                </button>
              </div>
            )}

          </div>
        </div>

        <div className="text-center">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Busca el mejor precio cerca de ti</p>
        </div>
        
        {/* Divider */}
        <div className="h-[1px] w-full bg-slate-100" />
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 space-y-8 scroll-smooth">
        {/* Search & Location Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-slate-800 font-bold px-1 border-l-4 border-blue-500">
            <Navigation size={18} />
            <h2>Búsqueda y Ubicación</h2>
          </div>

          <div className="flex flex-col gap-3 relative">
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
                onChange={(e) => handleInputChange(e.target.value)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true) }}
              />
              
              {searchQuery && (
                <button 
                  type="button"
                  onClick={() => handleInputChange('')}
                  className="absolute right-12 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={16} />
                </button>
              )}

              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:scale-95 transition-all shadow-lg shadow-blue-200"
                title="Buscar ubicación"
              >
                <Search size={18} />
              </button>
            </form>

            {/* Autocomplete Dropdown */}
            {showSuggestions && (
              <div className="absolute top-[100%] left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-slate-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelectSuggestion(s)}
                    className="w-full text-left px-5 py-3.5 hover:bg-blue-50 transition-colors flex items-start gap-3 border-b border-slate-50 last:border-none group/item"
                  >
                    <div className="mt-0.5 p-1.5 bg-slate-100 group-hover/item:bg-blue-100 text-slate-400 group-hover/item:text-blue-600 rounded-lg transition-colors">
                      <MapPin size={14} />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-700">{s.display_name.split(',')[0]}</span>
                      <span className="text-[10px] text-slate-400 font-medium line-clamp-1 italic">{s.display_name.split(',').slice(1).join(',')}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Garage Section - Highlighted if logged in */}
        {user && (
          <section className="space-y-4 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2 text-slate-800 font-bold border-l-4 border-blue-500 pl-1">
                <Car size={18} />
                <h2>Mi Garaje</h2>
              </div>
              <button 
                onClick={() => setIsGarageOpen(true)}
                className="text-[10px] font-black text-blue-600 hover:text-blue-700 uppercase tracking-tighter"
              >
                Gestionar
              </button>
            </div>
            
            <button
              onClick={() => setIsGarageOpen(true)}
              className={`w-full p-4 rounded-2xl border-2 transition-all text-left flex items-center gap-4 group ${
                activeCar 
                  ? 'border-blue-100 bg-blue-50/30 hover:border-blue-200' 
                  : 'border-slate-100 bg-slate-50 hover:bg-slate-100 border-dashed'
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                activeCar ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400'
              }`}>
                <Car size={20} />
              </div>
              <div className="flex-1">
                {activeCar ? (
                  <>
                    <h4 className="text-xs font-black text-slate-900 truncate">{activeCar.make} {activeCar.model}</h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] font-bold text-slate-400 uppercase">{activeCar.year}</span>
                      <span className="w-1 h-1 bg-slate-300 rounded-full" />
                      <span className="text-[9px] font-black text-blue-600 uppercase">{activeCar.consumo_l_100km} L/100KM</span>
                    </div>
                  </>
                ) : (
                  <>
                    <h4 className="text-xs font-black text-slate-500">Sin vehículo configurado</h4>
                    <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">Añade uno para el filtro inteligente</p>
                  </>
                )}
              </div>
              <Zap size={14} className={activeCar ? 'text-blue-500 animate-pulse' : 'text-slate-300'} />
            </button>
          </section>
        )}

        {/* Fuel Type Section */}
        <section className="space-y-4 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2 text-slate-800 font-bold px-1 border-l-4 border-blue-500">
            <Fuel size={18} />
            <h2>Carburante</h2>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 9, name: '95' },
              { id: 12, name: '98' },
              { id: 6, name: 'Diesel' }
            ].map((type) => (
              <button
                key={type.id}
                onClick={() => handleFuelChange(type.id)}
                className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all border-2 flex flex-col items-center justify-center gap-1 ${
                  selectedFuelTypeId === type.id
                    ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-200 scale-[1.02]'
                    : 'bg-white border-slate-100 text-slate-500 hover:border-blue-200 hover:text-blue-500'
                }`}
              >
                <span className="leading-none">{type.name}</span>
                {selectedFuelTypeId === type.id && <div className="w-1 h-1 bg-white rounded-full animate-pulse" />}
              </button>
            ))}
          </div>
        </section>

        {/* Sorting Section */}
        <section className="space-y-4 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2 text-slate-800 font-bold px-1 border-l-4 border-blue-500">
            <ArrowUpDown size={18} />
            <h2>Ordenación</h2>
          </div>
          <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200 mb-2">
            <button
              onClick={() => setSortBy('smart')}
              className={`flex-1 py-3 px-2 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all flex items-center justify-center gap-1.5 ${
                sortBy === 'smart' ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Zap size={10} fill={sortBy === 'smart' ? "currentColor" : "none"} />
              Smart
            </button>
            <button
              onClick={() => setSortBy('distance')}
              className={`flex-1 py-3 px-2 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all text-center ${
                sortBy === 'distance' ? 'bg-white text-blue-600 shadow-md ring-1 ring-black/5' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Distancia
            </button>
            <button
              onClick={() => setSortBy('price')}
              className={`flex-1 py-3 px-2 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all text-center ${
                sortBy === 'price' ? 'bg-white text-blue-600 shadow-md ring-1 ring-black/5' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Precio
            </button>
          </div>
        </section>

        {/* Radius Section */}
        <section className="space-y-4 pt-2 border-t border-slate-100">
          <div className="flex justify-between items-center px-1">
            <div className="flex items-center gap-2 text-slate-800 font-bold border-l-4 border-blue-500 pl-1">
              <Filter size={18} />
              <h2>Radio de búsqueda</h2>
            </div>
            <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-black border border-blue-100">
              {radius} km
            </span>
          </div>
          <div className="px-2">
            <input
              type="range"
              min="1"
              max="50"
              step="1"
              value={radius}
              onChange={(e) => handleRadiusChange(parseInt(e.target.value))}
              className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between mt-2 text-[10px] font-bold text-slate-400 px-1 uppercase tracking-tighter">
              <span>1 km</span>
              <span>25 km</span>
              <span>50 km</span>
            </div>
          </div>
        </section>

        {/* Status Toggles */}
        <section className="space-y-3 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2 text-slate-800 font-bold px-1 border-l-4 border-blue-500 mb-4">
            <Filter size={18} />
            <h2>Estado y Actualización</h2>
          </div>
          
          <label className="flex items-center justify-between p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors group">
            <div className="flex flex-col">
              <span className="text-sm font-bold text-slate-700">Abierta ahora</span>
              <span className="text-[10px] text-slate-400 font-medium">Solo estaciones en servicio</span>
            </div>
            <div className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={showOnlyOpen}
                onChange={(e) => setShowOnlyOpen(e.target.checked)}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </div>
          </label>

          <label className="flex items-center justify-between p-3.5 bg-slate-50 border-2 border-slate-100 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors group">
            <div className="flex flex-col">
              <span className="text-sm font-bold text-slate-700">Actualizada hoy</span>
              <span className="text-[10px] text-slate-400 font-medium">Precios subidos recientemente</span>
            </div>
             <div className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={showOnlyUpdatedToday}
                onChange={(e) => setShowOnlyUpdatedToday(e.target.checked)}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </div>
          </label>
        </section>

        {/* Brands Section */}
        <section className="space-y-4 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2 text-slate-800 font-bold px-1 border-l-4 border-blue-500">
            <Tag size={18} />
            <h2>Marcas Populares</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {brandsToShow.map((brand) => (
              <button
                key={brand}
                onClick={() => {
                  const isBrandSelected = selectedBrands.includes(brand)
                  const newBrands = isBrandSelected
                    ? selectedBrands.filter(b => b !== brand)
                    : [...selectedBrands, brand]
                  
                  setSelectedBrands(newBrands)
                  
                  // If we have a location but no stations (or we want fresh data), fetch!
                  if (currentLocation && (stations.length === 0 || !isBrandSelected)) {
                    useAppStore.getState().fetchStations()
                  }
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border-2 ${
                  selectedBrands.includes(brand)
                    ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                    : 'bg-white border-slate-100 text-slate-400 hover:border-blue-100'
                }`}
              >
                {brand}
              </button>
            ))}
          </div>
          {selectedBrands.length > 0 && (
            <button
              onClick={() => setSelectedBrands([])}
              className="w-full py-2 text-xs font-bold text-red-500 bg-red-50 hover:bg-red-100 rounded-xl transition-colors border border-dashed border-red-200"
            >
              Limpiar filtros de marcas
            </button>
          )}
        </section>

        {/* History Section */}
        {searchHistory.length > 0 && (
          <section className="space-y-4 pt-2 border-t border-slate-100 pb-12">
            <div className="flex items-center gap-2 text-slate-800 font-bold px-1 border-l-4 border-blue-500">
              <History size={18} />
              <h2>Búsquedas Recientes</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {searchHistory.map((h, i) => (
                <button
                  key={i}
                  className="px-3 py-2 bg-slate-50 text-slate-600 text-xs font-bold rounded-xl border border-slate-100 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all flex items-center gap-2"
                  onClick={() => {
                    handleSearch(h)
                    setSearchQuery(h)
                  }}
                >
                  <Search size={12} />
                  {h}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </aside>

    {isGarageOpen && <Garage onClose={() => setIsGarageOpen(false)} />}
    </>
  )
}
