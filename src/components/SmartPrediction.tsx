import { useState } from 'react'
import { Sparkles, ArrowRight, MapPin, Calendar, TrendingDown } from 'lucide-react'
import { fetchPredictions } from '../services/api'
import { getGeminiAdvice } from '../services/gemini'
import { useAppStore } from '../store/useAppStore'

const renderMarkdown = (text: string) => {
  if (!text) return null;
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return (
    <>
      {parts.map((part, index) => 
        index % 2 === 1 ? <strong key={index} className="font-extrabold text-purple-900">{part}</strong> : part
      )}
    </>
  );
};

export const SmartPrediction = () => {
  const { 
    selectedFuelTypeId, 
    fuelTypes, 
    filteredStations, 
    userCars, 
    selectedCarId,
    setSelectedStationId,
    setViewMode
  } = useAppStore()
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
    const predictions = await fetchPredictions(selectedFuelTypeId, stationIds)

    const predKey = selectedFuelTypeId === 9 ? 'predicted_95' : 
                    selectedFuelTypeId === 12 ? 'predicted_98' : 
                    'predicted_diesel';

    if (predictions && predictions.length > 0) {
      const selectedCar = userCars.find(c => c.id === selectedCarId)
      let best = null

      if (selectedCar && selectedCar.consumo_l_100km > 0) {
        // Advanced Smart Filter: Based on REAL COST (Fuel + Time)
        const consumo_km = selectedCar.consumo_l_100km / 100
        const LITROS_REPOSTAJE_ESTIMADO = 35 // Un tanque parcial más realista
        const VALOR_TIEMPO_HORA = 12 // €/hora (costo de oportunidad)
        const VELOCIDAD_MEDIA_KMH = 35 // km/h (estimación urbana/mixta)

        const scored = predictions.map(p => {
          const stationInFiltered = filteredStations.find(s => s.idEstacion === p.station_id)
          const dist = stationInFiltered?.distancia || 0
          const predictedPrice = p[predKey] || 9.99

          // Coste de combustible (ir y volver)
          const costeCombustibleViaje = dist * 2 * predictedPrice * consumo_km
          // Coste de tiempo (estimado)
          const tiempoViajeHoras = (dist * 2) / VELOCIDAD_MEDIA_KMH
          const costeTiempo = tiempoViajeHoras * VALOR_TIEMPO_HORA
          
          // Gasto Total = Precio del combustible + Gasto de viaje + Coste de tiempo
          const gastoTotal = (predictedPrice * LITROS_REPOSTAJE_ESTIMADO) + costeCombustibleViaje + costeTiempo
          
          return { prediction: p, score: gastoTotal }
        })

        scored.sort((a, b) => a.score - b.score)
        best = scored[0].prediction
      } else {
        // Fallback to basic smart normalization with HEAVY distance weight
        const predictionsWithDistance = predictions.map(p => {
          const stationInFiltered = filteredStations.find(s => s.idEstacion === p.station_id)
          const dist = stationInFiltered?.distancia || 0
          const predictedPrice = p[predKey] || 9.99
          return { prediction: p, dist, price: predictedPrice }
        })

        const distances = predictionsWithDistance.map(item => item.dist)
        const prices = predictionsWithDistance.map(item => item.price)

        const minDist = Math.min(...distances)
        const maxDist = Math.max(...distances)
        const minPrice = Math.min(...prices)
        const maxPrice = Math.max(...prices)

        const norm = (val: number, min: number, max: number, margin = 0) => {
          const range = max - min
          if (range <= margin) return 0
          return (val - min) / range
        }

        const scored = predictionsWithDistance.map(item => {
          // Le damos 70% de peso a la distancia y 30% al precio predicho
          const dScore = norm(item.dist, minDist, maxDist)
          // Usamos un margen de 0.03€ para que variaciones pequeñas no disparen el score
          const pScore = norm(item.price, minPrice, maxPrice, 0.03)
          const score = dScore * 0.7 + pScore * 0.3
          
          return { prediction: item.prediction, score }
        })

        scored.sort((a, b) => a.score - b.score)
        best = scored[0].prediction
      }

      setBestStation(best)

      if (best) {
        const fuelKey = selectedFuelTypeId === 9 ? 'last_price_95' : 
                        selectedFuelTypeId === 12 ? 'last_price_98' : 
                        'last_price_diesel';
        
        const carModel = selectedCar ? `${selectedCar.make} ${selectedCar.model}` : undefined
        const carConsumo = selectedCar ? selectedCar.consumo_l_100km : undefined

        const adviceText = await getGeminiAdvice(
          best.station.municipality || 'tu zona',
          best.station[fuelKey] || 0,
          best[predKey] || 0,
          best.station.name || 'la estación ganadora',
          best.station.address || 'su ubicación actual',
          carModel,
          carConsumo
        )
        setAdvice(adviceText)
      }
    } else {
      setBestStation(null)
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
              <div 
                onClick={() => {
                  setSelectedStationId(bestStation.station_id)
                  setViewMode('map')
                }}
                className="group/card cursor-pointer border border-purple-100 rounded-xl p-3 bg-white hover:border-purple-300 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                title="Ver en el mapa"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="text-[9px] font-black text-purple-600 uppercase tracking-widest flex items-center gap-1">
                      <TrendingDown size={10} />
                      Ganadora de la semana
                    </span>
                    <h4 className="text-xs font-black text-slate-900 mt-1 leading-tight truncate group-hover/card:text-purple-700 transition-colors">
                      {bestStation.station.name}
                    </h4>
                  </div>
                  <div className="bg-purple-600 text-white px-2.5 py-1 rounded-xl flex flex-col items-center shadow-md shadow-purple-100 shrink-0">
                    <span className="text-[13px] font-black leading-none">
                      {bestStation[fuelKey].toFixed(3)}
                    </span>
                    <span className="text-[7px] font-bold uppercase tracking-tighter mt-1 opacity-90">€/L {selectedFuelName}</span>
                  </div>
                </div>

                <div className="space-y-1.5 border-t border-dashed border-purple-100 pt-2.5">
                  <div className="flex items-center gap-2 text-slate-500 text-[10px] font-bold">
                    <MapPin size={11} className="shrink-0 text-purple-400" />
                    <span className="truncate">{bestStation.station.municipality}, {bestStation.station.province}</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-500 text-[10px] font-bold">
                    <Calendar size={11} className="shrink-0 text-purple-400" />
                    <span>Para el día: {new Date(bestStation.target_date).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              {advice && (
                <div className="mt-4 p-3 bg-purple-50 rounded-xl border border-purple-100 relative">
                  <div className="absolute -top-2 left-4 px-2 bg-purple-600 text-white text-[8px] font-black uppercase rounded-full">
                    Consejo del Experto
                  </div>
                  <p className="text-[11px] text-slate-700 italic leading-snug font-medium">
                    "{renderMarkdown(advice)}"
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
