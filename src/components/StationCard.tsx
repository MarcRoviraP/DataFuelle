import { useState, memo, useRef, useMemo } from 'react'
import { fetchStationHistory, type Station } from '../services/api'
import { MapPin, Clock, Navigation, Tag, Calendar, TrendingUp, ChevronDown, ChevronUp, Heart, Zap } from 'lucide-react'
import { shouldShowLastUpdate, formatLastUpdate } from '../utils/date'
import { formatDistance } from '../utils/geo'
import { useAppStore } from '../store/useAppStore'
import { LightweightChart } from './LightweightChart'

interface StationCardProps {
  station: Station
  isSelected?: boolean
  onClick?: () => void
}

const fuelTypes = [
  { key: 'precioG95' as const,    label: 'G95' },
  { key: 'precioG98' as const,    label: 'G98' },
  { key: 'precioDiesel' as const, label: 'DSL' },
]

// Tab config: label + days (null = all)
const PERIOD_TABS: { label: string; days: number | null }[] = [
  { label: '7 d',  days: 7 },
  { label: '30 d', days: 30 },
  { label: 'Todo', days: null },
]

// SVG line chart removed in favor of Lightweight Charts

export const StationCard = memo(({ station, isSelected, onClick }: StationCardProps) => {
  const currentDiscount = useAppStore(state => state.stationDiscounts.get(station.idEstacion) || 0)
  const setStationDiscount = useAppStore(state => state.setStationDiscount)
  const selectedFuelTypeId = useAppStore(state => state.selectedFuelTypeId)
  const favoriteStationIds = useAppStore(state => state.favoriteStationIds)
  const toggleFavorite = useAppStore(state => state.toggleFavorite)
  const isFav = favoriteStationIds.includes(station.idEstacion)

  const [showHistory, setShowHistory] = useState(false)
  const [activeDays, setActiveDays] = useState<number | null>(7)
  const [historyData, setHistoryData] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const fetchRequestId = useRef(0)
  
  const fuelKey = selectedFuelTypeId === 9 ? 'price_95' : selectedFuelTypeId === 12 ? 'price_98' : 'price_diesel'
  const fuelLabel = fuelKey === 'price_95' ? 'G95' : fuelKey === 'price_98' ? 'G98' : 'DSL'

  const loadHistory = async (days: number | null) => {
    const rid = ++fetchRequestId.current
    setLoadingHistory(true)
    setHistoryData([])
    
    try {
      const fetchDays = days === null ? null : Math.max(days, 30);
      const data = await fetchStationHistory(station.idEstacion, fetchDays, (chunkData) => {
        if (rid === fetchRequestId.current) {
          setHistoryData(chunkData)
          setLoadingHistory(false)
        }
      })
      // Only update if this is still the latest request
      if (rid === fetchRequestId.current) {
        setHistoryData(data)
        setLoadingHistory(false)
      }
    } catch (error) {
      console.error('[StationCard] Error loading history:', error)
      if (rid === fetchRequestId.current) {
        setLoadingHistory(false)
      }
    }
  }

  const handleTab = async (days: number | null) => {
    if (days === activeDays) return
    setActiveDays(days)
    // If we already have 30 days (or all) of history loaded, we might not even need to re-fetch!
    // But since fetchStationHistory is cached well, let's keep it simple.
    await loadHistory(days)
  }

  const handleGoogleMaps = (e: React.MouseEvent) => {
    e.stopPropagation()
    const url = `https://www.google.com/maps/dir/?api=1&destination=${station.latitud},${station.longitud}`
    window.open(url, '_blank')
  }

  const visibleHistoryData = useMemo(() => {
    if (activeDays === null) return historyData;
    const since = new Date();
    since.setDate(since.getDate() - activeDays);
    return historyData.filter(d => new Date(d.recorded_at) >= since);
  }, [historyData, activeDays]);

  // Trend badge: last vs first in the current window
  const trendBadge = visibleHistoryData.length > 1 ? (() => {
    const first = Number(visibleHistoryData[0][fuelKey])
    const last  = Number(visibleHistoryData[visibleHistoryData.length - 1][fuelKey])
    const diff  = last - first
    const color = diff > 0 ? 'bg-red-100 text-red-600' : diff < 0 ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-500'
    const icon  = diff > 0 ? '▲' : diff < 0 ? '▼' : '='
    return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${color}`}>{icon} {Math.abs(diff).toFixed(3)}€</span>
  })() : null

  // Memoize chart data to stabilize reference across renders
  const chartData = useMemo(() => {
    return visibleHistoryData
      .filter(d => d[fuelKey] !== null && d[fuelKey] !== undefined && Number(d[fuelKey]) >= 0.1)
      .map(d => {
        try {
          const date = new Date(d.recorded_at)
          if (isNaN(date.getTime())) return null
          return {
            time: date.toISOString().split('T')[0],
            value: Number(d[fuelKey])
          }
        } catch (e) {
          return null
        }
      })
      .filter((item): item is { time: string; value: number } => item !== null)
  }, [historyData, fuelKey])

  const cheapestDay = useMemo(() => {
    if (historyData.length === 0) return null;
    
    // 1. Group data by week (0 to 3, where 0 is most recent week 0-7 days ago)
    const now = new Date().getTime();
    
    // Array of 4 weeks, each containing an array of 7 days (0=Sunday...6=Saturday), storing prices
    const weeksData = Array.from({ length: 4 }, () => 
      Array.from({ length: 7 }, () => [] as number[])
    );
    
    historyData.forEach(d => {
      const price = Number(d[fuelKey]);
      if (price >= 0.1) {
        const date = new Date(d.recorded_at);
        const time = date.getTime();
        if (!isNaN(time)) {
          const deltaDays = (now - time) / (1000 * 60 * 60 * 24);
          if (deltaDays <= 28) { // Only last 4 weeks
            const weekIdx = Math.floor(deltaDays / 7);
            if (weekIdx >= 0 && weekIdx < 4) {
              const day = date.getDay();
              weeksData[weekIdx][day].push(price);
            }
          }
        }
      }
    });

    const dayWeights = [0, 0, 0, 0, 0, 0, 0];
    // Weights: week 0 (most recent) = 1.0, week 1 = 0.83, week 2 = 0.66, week 3 (oldest) = 0.5
    const weights = [1.0, 0.83, 0.66, 0.5];

    // For each week, find the cheapest day
    for (let w = 0; w < 4; w++) {
      let minAvg = Infinity;
      let minDay = -1;
      
      for (let day = 0; day < 7; day++) {
        const prices = weeksData[w][day];
        if (prices.length > 0) {
          const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
          if (avg < minAvg) {
            minAvg = avg;
            minDay = day;
          }
        }
      }
      
      if (minDay !== -1) {
        dayWeights[minDay] += weights[w];
      }
    }

    let bestDay = -1;
    let maxWeight = -1;
    for (let i = 0; i < 7; i++) {
      if (dayWeights[i] > maxWeight && dayWeights[i] > 0) {
        maxWeight = dayWeights[i];
        bestDay = i;
      }
    }

    let savingDiff = 0;
    if (bestDay !== -1) {
      const bestDayPrices = weeksData[0][bestDay];
      const otherPrices: number[] = [];
      for (let i = 0; i < 7; i++) {
        if (i !== bestDay) {
          otherPrices.push(...weeksData[0][i]);
        }
      }
      if (bestDayPrices.length > 0 && otherPrices.length > 0) {
        const bestAvg = bestDayPrices.reduce((a, b) => a + b, 0) / bestDayPrices.length;
        const otherAvg = otherPrices.reduce((a, b) => a + b, 0) / otherPrices.length;
        savingDiff = bestAvg - otherAvg;
      }
    }

    if (bestDay === -1) return null;
    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return { name: dayNames[bestDay], diff: savingDiff };
  }, [historyData, fuelKey])

  return (
    <div
      className={`p-4 rounded-xl border-2 transition-all cursor-pointer hover:shadow-lg ${
        isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-100 bg-white'
      }`}
      onClick={onClick}
    >
      <div className="flex justify-between items-start mb-2 group">
        <div className="flex items-start gap-2 flex-1 min-w-0 pr-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              toggleFavorite(station.idEstacion)
            }}
            className="p-1 text-slate-300 hover:text-red-500 hover:scale-110 active:scale-95 transition-all shrink-0 cursor-pointer"
            title={isFav ? "Quitar de favoritos" : "Guardar en favoritos"}
          >
            <Heart 
              size={18} 
              className={isFav ? "text-red-500 fill-red-500 animate-in zoom-in duration-300" : "text-slate-300 hover:text-red-400"} 
            />
          </button>
          <h3 className="font-bold text-gray-900 leading-tight line-clamp-3 overflow-hidden text-xs uppercase">{station.nombreEstacion}</h3>
        </div>
        <div className="flex flex-col items-end">
          <div className="flex items-baseline gap-1.5 flex-wrap justify-end">
            {currentDiscount > 0 && station.precioBase && (
              <span className="text-[10px] font-bold text-slate-400 line-through">
                {station.precioBase.toFixed(3)}
              </span>
            )}
            <span className="text-xl font-black text-blue-600">
              {station.precioCombustible ? `${station.precioCombustible.toFixed(3)}€` : '---'}
            </span>
            {station.diff !== undefined && station.diff !== 0 && (
              <span className={`text-xs font-bold leading-none translate-y-[-2px] ${
                station.diff < 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {station.diff > 0 ? '+' : ''}{station.diff.toFixed(3)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 mt-1 justify-end">
            <div className="flex items-center gap-2 px-2 py-1 bg-green-50 text-green-700 rounded-lg text-[10px] font-extrabold border border-green-100 group-hover:border-green-300 transition-colors">
              <Tag size={12} />
              <input
                type="number"
                step="0.01"
                min="0"
                max="1.5"
                placeholder="0.00"
                value={currentDiscount || ''}
                onChange={(e) => setStationDiscount(station.idEstacion, parseFloat(e.target.value) || 0)}
                onClick={(e) => e.stopPropagation()}
                className="w-10 bg-transparent outline-none focus:ring-0 text-green-700 border-none p-0 h-auto text-[10px] font-black"
              />
              <span>Dto. €/L</span>
            </div>
          </div>
        </div>
      </div>

      {/* All fuel prices with discount applied */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {fuelTypes.map(({ key, label }) => {
          const raw = station[key]
          if (!raw || raw < 0.1) return null
          const final = currentDiscount > 0 ? raw - currentDiscount : null
          return (
            <div key={key} className="flex flex-col items-center bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 min-w-[52px]">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">{label}</span>
              {final !== null ? (
                <>
                  <span className="text-[9px] text-slate-400 line-through">{raw.toFixed(3)}</span>
                  <span className="text-[11px] font-black text-blue-600">{final.toFixed(3)}</span>
                </>
              ) : (
                <span className="text-[11px] font-black text-slate-600">{raw.toFixed(3)}</span>
              )}
            </div>
          )
        })}
        
        <button 
          className="flex flex-col items-center justify-center bg-blue-50 border border-blue-100 rounded-lg px-2 py-1 min-w-[52px] hover:bg-blue-100 transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            const next = !showHistory
            setShowHistory(next)
            if (next && historyData.length === 0) loadHistory(activeDays)
          }}
        >
          <span className="text-[9px] font-bold text-blue-500 uppercase tracking-wide">HIST.</span>
          {showHistory ? <ChevronUp size={12} className="text-blue-600" /> : <ChevronDown size={12} className="text-blue-600" />}
        </button>
      </div>

      {/* History Panel — SVG Line Chart */}
      {showHistory && (
        <div className="mb-4 p-3 bg-slate-50 rounded-xl border border-blue-100 animate-in fade-in slide-in-from-top-2 shadow-inner">
          {/* Header */}
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-1.5">
              <TrendingUp size={13} className="text-blue-500" />
              <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider">
                Historial · {fuelLabel}
              </span>
            </div>
            {trendBadge}
          </div>

          {/* Period tabs */}
          <div className="flex gap-1.5 mb-3">
            {PERIOD_TABS.map(({ label, days }) => (
              <button
                key={label}
                onClick={(e) => { e.stopPropagation(); handleTab(days) }}
                className={`text-[9px] px-2.5 py-0.5 rounded-full font-bold transition-all ${
                  activeDays === days
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white text-slate-400 border border-slate-200 hover:border-blue-300 hover:text-blue-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Chart area */}
          {loadingHistory ? (
            <div className="h-20 flex flex-col items-center justify-center text-[10px] text-slate-400 italic">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mb-2" />
              Cargando...
            </div>
          ) : historyData.length > 0 ? (
            <>
              <LightweightChart 
                data={chartData} 
              />
              <div className="flex justify-between items-center mt-2">
                {cheapestDay ? (
                  <div className="flex items-center gap-1.5 text-[10px] text-blue-700 font-bold bg-blue-50 px-2 py-1.5 rounded-lg border border-blue-100 shadow-sm transition-all hover:bg-blue-100 cursor-help" title="Basado en el análisis del patrón histórico de precios">
                    <Zap size={12} className="text-blue-500 fill-blue-500 animate-pulse" />
                    <span>Mejor día: <span className="font-black uppercase">{cheapestDay.name}</span></span>
                    {cheapestDay.diff !== 0 && (
                      <span className={`ml-0.5 px-1 py-0.5 rounded ${cheapestDay.diff < 0 ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`} title="Diferencia con la media del resto de la última semana">
                        {cheapestDay.diff > 0 ? '+' : ''}{cheapestDay.diff.toFixed(3)}€
                      </span>
                    )}
                  </div>
                ) : <div />}
                <p className="text-[9px] text-slate-400 text-right">
                  {historyData.length} registros
                </p>
              </div>
            </>
          ) : (
            <div className="h-16 flex items-center justify-center text-[10px] text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
              Sin datos para este período
            </div>
          )}
        </div>
      )}

      <div className="space-y-2 text-sm text-gray-500">
        <div className="flex items-start gap-2">
          <MapPin size={14} className="text-gray-400 mt-0.5 shrink-0" />
          <span className="line-clamp-3 leading-snug text-[11px] text-slate-500 font-medium">{station.direccion}</span>
        </div>
        <div className="flex items-start gap-2">
          <Clock size={14} className="text-gray-400 mt-0.5 shrink-0" />
          <span className="text-xs leading-snug">{station.horario}</span>
        </div>
        {shouldShowLastUpdate(station.lastUpdate) && (
          <div className="flex items-start gap-2 text-amber-600 font-medium">
            <Calendar size={14} className="mt-0.5 shrink-0" />
            <span className="text-xs leading-snug">{formatLastUpdate(station.lastUpdate)}</span>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold px-2 py-1 bg-gray-100 rounded text-gray-600 uppercase">
            {station.municipio}
          </span>
          {station.distancia !== undefined && (
            <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">
              {formatDistance(station.distancia)}
            </span>
          )}
        </div>

        <button
          onClick={handleGoogleMaps}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-md"
        >
          <Navigation size={12} fill="currentColor" />
          IR
        </button>
      </div>
    </div>
  )
})


