import { useState, useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { StationList } from './components/StationList'
import { MapView } from './components/MapView'
import { Filter, X } from 'lucide-react'
import { useAppStore } from './store/useAppStore'

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const setCurrentLocation = useAppStore(state => state.setCurrentLocation)

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
    <div className="flex flex-col md:flex-row h-screen w-screen bg-slate-100 overflow-hidden font-sans text-slate-800 antialiased">
      
      {/* Sidebar Overlay for Mobile / Sidebar for Desktop */}
      <div className={`fixed inset-0 z-50 md:relative md:z-auto transition-all duration-300 md:translate-x-0 ${
        isSidebarOpen ? 'opacity-100 pointer-events-auto translate-x-0' : 'opacity-0 pointer-events-none -translate-x-10 md:opacity-100 md:pointer-events-auto md:translate-x-0 outline-none'
      }`}>
        <div 
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm md:hidden" 
          onClick={() => setIsSidebarOpen(false)}
        />
        <div className="relative h-full flex shrink-0 w-[90%] sm:w-[380px] md:w-auto shadow-2xl md:shadow-none">
          <Sidebar setIsOpen={setIsSidebarOpen} />
          {/* Close button for mobile sidebar */}
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden absolute top-6 -right-12 w-10 h-10 bg-white rounded-r-xl shadow-xl flex items-center justify-center text-slate-600 active:bg-slate-50 border-l border-slate-100"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        
        {/* Floating Toggle Buttons for Mobile (Filters) */}
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="md:hidden absolute top-4 right-4 z-[40] bg-white p-3 rounded-full shadow-xl border border-slate-200 text-blue-600 active:scale-95 transition-transform"
        >
          <Filter size={24} />
        </button>

        {/* Results List - Bottom 60% on Mobile, Left 40% on Desktop */}
        <section className="w-full h-[60%] md:h-full md:w-[400px] lg:w-[450px] shrink-0 flex flex-col border-t md:border-t-0 md:border-r border-slate-200 bg-white order-2 md:order-1">
          <StationList />
        </section>

        {/* Map View - Top 40% on Mobile, Center/Right on Desktop */}
        <section className="w-full h-[40%] md:h-full flex-1 shadow-inner relative order-1 md:order-2">
          <MapView />
          
          <div className="absolute top-4 left-4 md:top-6 md:left-6 z-30 bg-white/80 backdrop-blur-md px-4 md:px-6 py-2 md:py-2.5 rounded-full shadow-2xl border border-white/50">
            <p className="text-[10px] md:text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2 md:gap-3">
              <span className="w-1.5 h-1.5 md:w-2 md:h-2 bg-green-500 rounded-full animate-pulse ring-4 ring-green-100" />
              Vista del Mapa
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
