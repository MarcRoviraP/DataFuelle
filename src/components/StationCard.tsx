import type { Station } from '../services/api'
import { MapPin, Clock, Navigation, Tag, Calendar } from 'lucide-react'
import { shouldShowLastUpdate, formatLastUpdate } from '../utils/date'
import { formatDistance } from '../utils/geo'
import { useAppStore } from '../store/useAppStore'

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

export const StationCard = ({ station, isSelected, onClick }: StationCardProps) => {
  const { stationDiscounts, setStationDiscount } = useAppStore()
  const currentDiscount = stationDiscounts.get(station.idEstacion) || 0

  const handleGoogleMaps = (e: React.MouseEvent) => {
    e.stopPropagation()
    const url = `https://www.google.com/maps/dir/?api=1&destination=${station.latitud},${station.longitud}`
    window.open(url, '_blank')
  }

  return (
    <div
      className={`p-4 rounded-xl border-2 transition-all cursor-pointer hover:shadow-lg ${
        isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-100 bg-white'
      }`}
      onClick={onClick}
    >
      <div className="flex justify-between items-start mb-2 group">
        <h3 className="font-semibold text-gray-900 leading-tight flex-1 pr-2">{station.nombreEstacion}</h3>
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
          if (!raw || raw <= 0) return null
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
      </div>

      <div className="space-y-2 text-sm text-gray-500">
        <div className="flex items-start gap-2">
          <MapPin size={14} className="text-gray-400 mt-0.5 shrink-0" />
          <span className="line-clamp-2 leading-snug">{station.direccion}</span>
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
}
