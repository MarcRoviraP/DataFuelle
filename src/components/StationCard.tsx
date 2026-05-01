import { useState, memo, useRef } from 'react'
import { fetchStationHistory, type Station } from '../services/api'
import { MapPin, Clock, Navigation, Tag, Calendar, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react'
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
    
    try {
      const data = await fetchStationHistory(station.idEstacion, days)
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
    await loadHistory(days)
  }

  const handleGoogleMaps = (e: React.MouseEvent) => {
    e.stopPropagation()
    const url = `https://www.google.com/maps/dir/?api=1&destination=${station.latitud},${station.longitud}`
    window.open(url, '_blank')
  }

  // Trend badge: last vs first in the current window
  const trendBadge = historyData.length > 1 ? (() => {
    const first = Number(historyData[0][fuelKey])
    const last  = Number(historyData[historyData.length - 1][fuelKey])
    const diff  = last - first
    const color = diff > 0 ? 'bg-red-100 text-red-600' : diff < 0 ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-500'
    const icon  = diff > 0 ? '▲' : diff < 0 ? '▼' : '='
    return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${color}`}>{icon} {Math.abs(diff).toFixed(3)}€</span>
  })() : null

  return (
    <div
      className={`p-4 rounded-xl border-2 transition-all cursor-pointer hover:shadow-lg ${
        isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-100 bg-white'
      }`}
      onClick={onClick}
    >
      <div className="flex justify-between items-start mb-2 group">
        <h3 className="font-bold text-gray-900 leading-tight flex-1 pr-1 line-clamp-3 overflow-hidden text-xs uppercase">{station.nombreEstacion}</h3>
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
                data={historyData
                  .filter(d => d[fuelKey] !== null && d[fuelKey] !== undefined && Number(d[fuelKey]) >= 0.1)
                  .map(d => ({
                    time: new Date(d.recorded_at).toISOString().split('T')[0],
                    value: Number(d[fuelKey])
                  }))
                } 
              />
              <p className="text-[9px] text-slate-400 text-right mt-1">
                {historyData.length} registros
              </p>
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


