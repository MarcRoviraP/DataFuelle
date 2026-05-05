import { useState } from 'react'
import { Sparkles, ArrowRight, MapPin, Calendar, TrendingDown } from 'lucide-react'
import { fetchBestPrediction } from '../services/api'
import { getGeminiAdvice } from '../services/gemini'
import { useAppStore } from '../store/useAppStore'

export const SmartPrediction = () => {
  const { selectedFuelTypeId, fuelTypes, filteredStations } = useAppStore()
  const [bestStation, setBestStation] = useState<any | null>(null)
  const [advice, setAdvice] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  const selectedFuelName = fuelTypes.find(f => f.idFuelType === selectedFuelTypeId)?.fuelTypeName || 'Combustible'

  const handleReveal = async () => {
    setLoading(true)
    setIsOpen(true)
    
    // Solo predecir para las estaciones que están en el radio/zona actual
    const stationIds = filteredStations.map(s => s.idEstacion)
    const data = await fetchBestPrediction(selectedFuelTypeId, stationIds)
    setBestStation(data)

    if (data) {
      const fuelKey = selectedFuelTypeId === 9 ? 'last_price_95' : 
                      selectedFuelTypeId === 12 ? 'last_price_98' : 
                      'last_price_diesel';
      const predKey = selectedFuelTypeId === 9 ? 'predicted_95' : 
                      selectedFuelTypeId === 12 ? 'predicted_98' : 
                      'predicted_diesel';
      
      const adviceText = await getGeminiAdvice(
        data.station.municipality || 'tu zona',
        data.station[fuelKey] || 0,
        data[predKey] || 0
      )
      setAdvice(adviceText)
    }

    setLoading(false)
  }

  const fuelKey = selectedFuelTypeId === 9 ? 'predicted_95' : 
                  selectedFuelTypeId === 12 ? 'predicted_98' : 
                  'predicted_diesel';

  return (
    <section className="space-y-4 pt-2 border-t border-slate-100">
      <div className="flex items-center gap-2 text-slate-800 font-bold px-1 border-l-4 border-purple-500">
        <Sparkles size={18} className="text-purple-500" />
        <h2>Predicción Inteligente</h2>
      </div>

      {!isOpen ? (
        <button
          onClick={handleReveal}
          className="w-full group relative overflow-hidden p-4 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-700 text-white shadow-xl shadow-purple-200 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
          <div className="relative flex items-center justify-between">
            <div className="flex flex-col items-start">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-80">IA Predictiva</span>
              <h3 className="text-sm font-black">¿Cuál será la más barata?</h3>
              <p className="text-[9px] opacity-70 mt-1">Descubre el ahorro para la semana que viene</p>
            </div>
            <div className="bg-white/20 p-2 rounded-xl backdrop-blur-md group-hover:translate-x-1 transition-transform">
              <ArrowRight size={20} />
            </div>
          </div>
        </button>
      ) : (
        <div className="bg-slate-50 border-2 border-purple-100 rounded-2xl p-4 animate-in zoom-in-95 duration-300 relative overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-6 gap-3">
              <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
              <p className="text-[10px] font-black text-purple-600 uppercase tracking-widest animate-pulse">Consultando el futuro...</p>
            </div>
          ) : bestStation ? (
            <>
              <div className="flex items-start justify-between mb-4">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-purple-600 uppercase tracking-widest flex items-center gap-1">
                    <TrendingDown size={10} />
                    Ganadora de la semana
                  </span>
                  <h4 className="text-sm font-black text-slate-900 mt-1 leading-tight">
                    {bestStation.station.name}
                  </h4>
                </div>
                <div className="bg-purple-600 text-white px-3 py-1.5 rounded-xl flex flex-col items-center shadow-lg shadow-purple-100">
                  <span className="text-[16px] font-black leading-none">
                    {bestStation[fuelKey].toFixed(3)}
                  </span>
                  <span className="text-[8px] font-bold uppercase tracking-tighter mt-1 opacity-80">€/L {selectedFuelName}</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-slate-500 text-[10px] font-bold">
                  <MapPin size={12} className="shrink-0" />
                  <span className="truncate">{bestStation.station.municipality}, {bestStation.station.province}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500 text-[10px] font-bold">
                  <Calendar size={12} className="shrink-0" />
                  <span>Para el día: {new Date(bestStation.target_date).toLocaleDateString()}</span>
                </div>
              </div>

              {advice && (
                <div className="mt-4 p-3 bg-purple-50 rounded-xl border border-purple-100 relative">
                  <div className="absolute -top-2 left-4 px-2 bg-purple-600 text-white text-[8px] font-black uppercase rounded-full">
                    Consejo del Experto
                  </div>
                  <p className="text-[11px] text-slate-700 italic leading-snug font-medium">
                    "{advice}"
                  </p>
                </div>
              )}

              <button 
                onClick={() => {
                  setIsOpen(false)
                  setAdvice('')
                }}
                className="mt-4 w-full py-2 bg-white text-purple-600 border border-purple-100 rounded-xl text-[10px] font-black uppercase hover:bg-purple-50 transition-colors"
              >
                Cerrar predicción
              </button>
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-xs font-bold text-slate-400">No hay predicciones disponibles para este combustible aún.</p>
              <button 
                onClick={() => setIsOpen(false)}
                className="mt-2 text-[10px] font-black text-purple-600 uppercase"
              >
                Volver
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
