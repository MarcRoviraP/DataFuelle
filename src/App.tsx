import { useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { StationList } from './components/StationList'
import { MapView } from './components/MapView'
import { useAppStore } from './store/useAppStore'
import { X, Map as MapIcon, List, Settings } from 'lucide-react'
import { Menu } from 'lucide-react'
import { AuthScreen } from './components/AuthScreen'

function App() {
  const { 
    isSidebarOpen, 
    setIsSidebarOpen, 
    setCurrentLocation, 
    selectedFuelTypeId, 
    fuelTypes,
    viewMode,
    setViewMode,
    isAuthScreenOpen
  } = useAppStore()
  const selectedFuelName = fuelTypes.find(f => f.idFuelType === selectedFuelTypeId)?.fuelTypeName || 'Combustible'

  useEffect(() => {
    const store = useAppStore.getState()
    
    // 1. Immediate fetch with initial/default location
    store.fetchStations()

    // 2. Geolocation in background — non-blocking
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords
          setCurrentLocation(latitude, longitude)
          // Re-fetch only if user location is actually changed
          store.fetchStations()
        },
        (error) => {
          console.warn('Geolocation unavailable, using default center.', error)
        },
        { timeout: 5000 } // Reduced timeout for better responsiveness
      )
    }
  }, [setCurrentLocation])

  return (
    <div className="flex h-[100dvh] w-screen bg-slate-100 overflow-hidden font-sans text-slate-800 antialiased relative">
      {!isAuthScreenOpen && (
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="lg:hidden fixed top-6 left-4 z-[1000] p-3 bg-white/80 backdrop-blur-xl border border-white/40 rounded-2xl shadow-xl text-slate-600 hover:bg-white transition-all active:scale-95"
        >
          <Menu size={24} />
        </button>
      )}

      {isAuthScreenOpen && <AuthScreen />}
      
      {/* Filters Drawer (Mobile) / Sidebar (Desktop) */}
      <div className={`fixed inset-0 z-[2000] lg:relative lg:z-10 transition-transform duration-300 transform ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        <div 
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm lg:hidden shadow-2xl" 
          onClick={() => setIsSidebarOpen(false)}
        />
        <div className="relative h-full flex shrink-0 w-[300px] sm:w-[380px] lg:w-auto shadow-2xl lg:shadow-none bg-white">
          <Sidebar />
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden absolute top-4 right-4 p-2.5 bg-blue-700/80 hover:bg-blue-800 text-white rounded-xl shadow-lg transition-all active:scale-95"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <main className="flex-1 flex flex-col xl:flex-row overflow-hidden relative">
        {/* Results List - Visible on XL or if explicitly selected on mobile */}
        <section className={`flex-1 xl:flex-none min-h-0 xl:w-[350px] xl:shrink-0 xl:flex flex-col border-r border-slate-200 bg-white ${
          viewMode === 'list' ? 'flex' : 'hidden xl:flex'
        }`}>
          <StationList />
        </section>

        {/* Map View - Full screen on mobile unless List is active, or persistent on XL */}
        <section className={`flex-1 min-h-0 shadow-inner relative pt-20 lg:pt-0 ${
          viewMode === 'map' ? 'flex' : 'hidden xl:flex'
        }`}>
          <MapView />
          
          <div className="absolute top-6 left-4 md:top-8 md:left-1/2 md:-translate-x-1/2 lg:left-8 lg:translate-x-0 z-[400] bg-white/80 backdrop-blur-md px-4 md:px-6 py-2 md:py-2.5 rounded-full shadow-2xl border border-white/50 pointer-events-none">
            <p className="text-[10px] md:text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2 md:gap-3">
              <span className="w-1.5 h-1.5 md:w-2 md:h-2 bg-green-500 rounded-full animate-pulse ring-4 ring-green-100" />
              Precios de {selectedFuelName}
            </p>
          </div>
        </section>

        {/* Bottom Navigation for Mobile */}
        <nav className="xl:hidden h-20 bg-white border-t border-slate-200 flex items-center justify-around px-4 pb-2 pt-2 z-[1001] shadow-[0_-5px_20px_-10px_rgba(0,0,0,0.1)]">
          <button 
            onClick={() => setViewMode('map')}
            className={`flex flex-col items-center gap-1.5 px-6 py-2 rounded-2xl transition-all ${
              viewMode === 'map' ? 'text-blue-600 bg-blue-50' : 'text-slate-400'
            }`}
          >
            <MapIcon size={20} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Mapa</span>
          </button>
          
          <button 
            onClick={() => setViewMode('list')}
            className={`flex flex-col items-center gap-1.5 px-6 py-2 rounded-2xl transition-all ${
              viewMode === 'list' ? 'text-blue-600 bg-blue-50' : 'text-slate-400'
            }`}
          >
            <List size={20} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Lista</span>
          </button>

          <button 
            onClick={() => setIsSidebarOpen(true)}
            className={`flex flex-col items-center gap-1.5 px-6 py-2 rounded-2xl transition-all ${
              isSidebarOpen ? 'text-blue-600 bg-blue-50' : 'text-slate-400'
            }`}
          >
            <Settings size={20} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Filtros</span>
          </button>
        </nav>
      </main>
    </div>
  )
}

export default App
