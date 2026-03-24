import { useAppStore } from '../store/useAppStore'
import { StationCard } from './StationCard'
import { LoadingSkeleton } from './LoadingSkeleton'

export const StationList = () => {
  const { filteredStations, isLoading, selectedStationId, setSelectedStationId } = useAppStore()

  if (isLoading) {
    return <LoadingSkeleton />
  }

  if (filteredStations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-gray-50/50">
        <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mb-4 text-gray-400">
          📍
        </div>
        <h3 className="font-semibold text-gray-900">No hay estaciones cerca</h3>
        <p className="text-sm text-gray-500 mt-2">Prueba a aumentar el radio de búsqueda o cambiar el tipo de combustible.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 border-r border-slate-200">
      <div className="p-4 bg-white border-b border-slate-200 sticky top-0 z-10 flex items-center justify-between">
        <h2 className="font-bold text-slate-800 flex items-center gap-2">
          Estaciones encontradas
          <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-semibold">
            {filteredStations.length}
          </span>
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-3 custom-scrollbar">
        {filteredStations.map((station) => (
          <StationCard
            key={station.idEstacion}
            station={station}
            isSelected={selectedStationId === station.idEstacion}
            onClick={() => setSelectedStationId(station.idEstacion)}
          />
        ))}
      </div>
    </div>
  )
}
