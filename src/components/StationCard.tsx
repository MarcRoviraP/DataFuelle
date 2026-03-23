import type { Station } from '../services/api'
import { MapPin, Clock } from 'lucide-react'
import { formatDistance } from '../utils/geo'

interface StationCardProps {
  station: Station
  isSelected?: boolean
  onClick?: () => void
}

export const StationCard = ({ station, isSelected, onClick }: StationCardProps) => {
  return (
    <div
      className={`p-4 rounded-xl border-2 transition-all cursor-pointer hover:shadow-lg ${
        isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-100 bg-white'
      }`}
      onClick={onClick}
    >
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-bold text-gray-900 leading-tight flex-1">{station.nombreEstacion}</h3>
        <span className="text-xl font-black text-blue-600">
          {station.precioCombustible ? `${station.precioCombustible.toFixed(3)}€` : '---'}
        </span>
      </div>

      <div className="space-y-1 text-sm text-gray-500">
        <div className="flex items-center gap-2">
          <MapPin size={14} className="text-gray-400" />
          <span className="truncate">{station.direccion}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-gray-400" />
          <span className="truncate text-xs">{station.horario}</span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs font-semibold px-2 py-1 bg-gray-100 rounded text-gray-600">
          {station.municipio}
        </span>
        {station.distancia !== undefined && (
          <span className="text-sm font-medium text-blue-600">
            {formatDistance(station.distancia)}
          </span>
        )}
      </div>
    </div>
  )
}
