import { useState, useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { Car } from '../store/useAppStore'
import { supabase } from '../services/supabaseClient'
import { Search, ChevronRight, Car as CarIcon, X, Loader2 } from 'lucide-react'

interface CarSelectorProps {
  onClose: () => void
}

export const CarSelector = ({ onClose }: CarSelectorProps) => {
  const { addUserCar } = useAppStore()
  const [step, setStep] = useState<'make' | 'model'>('make')
  const [makes, setMakes] = useState<string[]>([])
  const [models, setModels] = useState<Car[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedMake, setSelectedMake] = useState('')

  // Cache
  const [makesCache, setMakesCache] = useState<string[]>([])

  useEffect(() => {
    fetchMakes()
  }, [])

  const fetchMakes = async () => {
    setLoading(true)
    console.log('📡 [CarSelector] Fetching makes...')
    try {
      if (makesCache.length > 0) {
        console.log('📦 [CarSelector] Using makes from cache')
        setMakes(makesCache)
      } else {
        console.log('📡 [CarSelector] Calling RPC get_unique_car_makes...')
        const { data, error } = await supabase
          .rpc('get_unique_car_makes')
        
        if (error) {
          console.error('❌ [CarSelector] RPC Error:', error)
          throw error
        }
        
        console.log(`✅ [CarSelector] RPC Success! Received ${data?.length} unique makes`)
        
        const uniqueMakes = data.map((d: any) => d.make)
          .filter((m: any) => isNaN(Number(m)))
        
        console.log(`✨ [CarSelector] Final processed makes: ${uniqueMakes.length}`)
        setMakes(uniqueMakes)
        setMakesCache(uniqueMakes)
      }
    } catch (err) {
      console.error('💥 [CarSelector] Critical error in fetchMakes:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchModels = async (make: string) => {
    setLoading(true)
    setSelectedMake(make)
    console.log(`📡 [CarSelector] Fetching models for make: ${make}...`)
    try {
      const { data, error } = await supabase
        .from('cars')
        .select('*')
        .eq('make', make)
        .order('model', { ascending: true })
      
      if (error) {
        console.error(`❌ [CarSelector] Error fetching models for ${make}:`, error)
        throw error
      }
      
      console.log(`✅ [CarSelector] Received ${data?.length} models for ${make}`)
      setModels(data as Car[])
      setStep('model')
      setSearch('')
    } catch (err) {
      console.error('💥 [CarSelector] Critical error in fetchModels:', err)
    } finally {
      setLoading(false)
    }
  }

  const filteredMakes = makes.filter(m => m.toLowerCase().includes(search.toLowerCase()))
  const filteredModels = models.filter(m => m.model.toLowerCase().includes(search.toLowerCase()))

  const handleSelectCar = (car: Car) => {
    addUserCar(car)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-xl font-black text-slate-900">Añadir Vehículo</h3>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-tighter">
              {step === 'make' ? 'Paso 1: Selecciona la marca' : `Paso 2: Modelos de ${selectedMake}`}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl transition-colors">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 bg-white">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
            <input
              type="text"
              placeholder={step === 'make' ? "Buscar marca..." : "Buscar modelo..."}
              className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:outline-none focus:border-blue-500 transition-all font-semibold"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
              <Loader2 className="animate-spin" size={32} />
              <span className="font-bold text-sm uppercase tracking-widest">Cargando...</span>
            </div>
          ) : step === 'make' ? (
            <div className="grid grid-cols-1 gap-1">
              {filteredMakes.map(make => (
                <button
                  key={make}
                  onClick={() => fetchModels(make)}
                  className="flex items-center justify-between p-4 hover:bg-blue-50 rounded-2xl transition-all group border border-transparent hover:border-blue-100"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      <CarIcon size={20} />
                    </div>
                    <span className="font-bold text-slate-700">{make}</span>
                  </div>
                  <ChevronRight size={18} className="text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-1">
              <button 
                onClick={() => setStep('make')}
                className="mb-2 p-3 text-xs font-black text-blue-600 hover:bg-blue-50 rounded-xl transition-all flex items-center gap-2 uppercase"
              >
                ← Volver a marcas
              </button>
              {filteredModels.map(car => (
                <button
                  key={car.id}
                  onClick={() => handleSelectCar(car)}
                  className="flex flex-col p-4 hover:bg-blue-50 rounded-2xl transition-all group border border-transparent hover:border-blue-100 text-left"
                >
                  <div className="flex justify-between items-start">
                    <span className="font-bold text-slate-700">{car.model}</span>
                    <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-black uppercase">
                      {car.year}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                    <span>{car.combustible}</span>
                    <span>•</span>
                    <span className="text-blue-600">{car.consumo_l_100km} L/100KM</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100">
          <p className="text-[10px] text-center text-slate-400 font-bold uppercase tracking-widest">
            Selecciona tu vehículo para activar el filtro inteligente
          </p>
        </div>
      </div>
    </div>
  )
}
