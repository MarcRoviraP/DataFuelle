import { useRef, useEffect } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { useAppStore } from '../store/useAppStore'
import { StationCard } from './StationCard'
import { LoadingSkeleton } from './LoadingSkeleton'

export const StationList = () => {
  const { filteredStations, isLoading, selectedStationId, setSelectedStationId, setViewMode } = useAppStore()
  const virtuosoRef = useRef<VirtuosoHandle>(null)

  // Auto-scroll to selected station when it changes (e.g. from map click)
  useEffect(() => {
    if (selectedStationId && filteredStations.length > 0) {
      const index = filteredStations.findIndex(s => s.idEstacion === selectedStationId)
      if (index !== -1) {
        virtuosoRef.current?.scrollToIndex({
          index,
          align: 'center',
          behavior: 'smooth'
        })
      }
    }
  }, [selectedStationId, filteredStations])

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
        <button 
          onClick={() => setViewMode('map')}
          className="xl:hidden mt-6 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold shadow-lg active:scale-95 transition-all flex items-center gap-2"
        >
          ← Volver al Mapa
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 border-r border-slate-200">
      <div className="p-4 bg-white border-b border-slate-200 sticky top-0 z-10 flex items-center justify-between shadow-sm">
        <h2 className="font-bold text-slate-800 flex items-center gap-2">
          Estaciones
          <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-semibold">
            {filteredStations.length}
          </span>
        </h2>
      </div>

      <div className="flex-1 min-h-0 bg-slate-50">
        <Virtuoso
          ref={virtuosoRef}
          data={filteredStations}
          initialTopMostItemIndex={selectedStationId ? filteredStations.findIndex(s => s.idEstacion === selectedStationId) : 0}
          itemContent={(_index, station) => (
            <div className="p-2 pb-1">
              <StationCard
                station={station}
                isSelected={selectedStationId === station.idEstacion}
                onClick={() => setSelectedStationId(station.idEstacion)}
              />
            </div>
          )}
          style={{ height: '100%' }}
          className="custom-scrollbar"
        />
      </div>
    </div>
  )
}
