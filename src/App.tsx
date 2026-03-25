import { useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { StationList } from './components/StationList'
import { MapView } from './components/MapView'
import { useAppStore } from './store/useAppStore'
import { Filter, X } from 'lucide-react'

function App() {
  const { isSidebarOpen, setIsSidebarOpen, setCurrentLocation, selectedFuelTypeId, fuelTypes } = useAppStore()
  const selectedFuelName = fuelTypes.find(f => f.idFuelType === selectedFuelTypeId)?.fuelTypeName || 'Combustible'

  useEffect(() => {
    // Try to get user's location on mount
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCurrentLocation(position.coords.latitude, position.coords.longitude)
        },
        (error) => {
          console.error('Error getting location:', error)
          // Fallback to Valencia if denied or fails
          setCurrentLocation(39.4699, -0.3763)
        }
      )
    } else {
      // Fallback if not supported
      setCurrentLocation(39.4699, -0.3763)
    }
  }, [setCurrentLocation])

  return (
    <div className="flex h-screen w-screen bg-slate-100 overflow-hidden font-sans text-slate-800 antialiased relative">
      
      {/* Sidebar Overlay for Mobile / Sidebar for Desktop */}
      <div className={`fixed inset-0 z-[2000] lg:relative lg:z-10 transition-transform duration-300 transform ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        <div 
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm lg:hidden shadow-2xl" 
          onClick={() => setIsSidebarOpen(false)}
        />
        <div className="relative h-full flex shrink-0 w-[320px] sm:w-[380px] lg:w-auto shadow-2xl lg:shadow-none bg-white">
          <Sidebar />
          {/* Close button for mobile sidebar */}
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden absolute top-4 right-4 p-2 bg-white/20 hover:bg-white/40 text-white rounded-full"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden relative overflow-y-auto lg:overflow-hidden lg:flex-row">
        
        {/* Floating Toggle Button for Mobile - Placed on the map with high z-index */}
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="lg:hidden fixed bottom-8 right-6 z-[1001] bg-blue-600 text-white p-4 rounded-full shadow-2xl hover:bg-blue-700 active:scale-95 transition-all flex items-center gap-2 font-bold ring-4 ring-blue-100"
        >
          <Filter size={24} />
          <span className="text-sm">Filtros</span>
        </button>

        {/* Results List - Hidden on small screens as per goal to prioritize the map */}
        <section className="hidden xl:flex w-[450px] h-full shrink-0 flex-col border-r border-slate-200 bg-white">
          <StationList />
        </section>

        {/* Map View */}
        <section className="flex-1 h-full shadow-inner relative">
          <MapView />
          
          <div className="absolute top-4 left-4 md:top-6 md:left-6 z-[400] bg-white/80 backdrop-blur-md px-4 md:px-6 py-2 md:py-2.5 rounded-full shadow-2xl border border-white/50 pointer-events-none">
            <p className="text-[10px] md:text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2 md:gap-3">
              <span className="w-1.5 h-1.5 md:w-2 md:h-2 bg-green-500 rounded-full animate-pulse ring-4 ring-green-100" />
              Precios de {selectedFuelName}
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
