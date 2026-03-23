import { Sidebar } from './components/Sidebar'
import { StationList } from './components/StationList'
import { MapView } from './components/MapView'

function App() {
  return (
    <div className="flex h-screen w-screen bg-slate-100 overflow-hidden font-sans text-slate-800 antialiased">
      {/* Sidebar for filters and search */}
      <Sidebar />

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden">
        {/* Results List */}
        <section className="w-[450px] h-full shrink-0 flex flex-col border-r border-slate-200">
          <StationList />
        </section>

        {/* Map View */}
        <section className="flex-1 h-full shadow-inner relative">
          <MapView />
          
          <div className="absolute top-6 left-6 z-30 bg-white/90 backdrop-blur-md px-6 py-2.5 rounded-full shadow-2xl border border-white/50 animate-in fade-in slide-in-from-top duration-700">
            <p className="text-sm font-black text-slate-700 selection:bg-blue-100 uppercase tracking-widest flex items-center gap-3">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse ring-4 ring-green-100" />
              Vista del Mapa de Precios
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
