import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import { useAppStore } from '../store/useAppStore'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect } from 'react'

// Fix generic Leaflet icon issue
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41],
})

L.Marker.prototype.options.icon = DefaultIcon

const MapEvents = () => {
  const setCurrentLocation = useAppStore((state) => state.setCurrentLocation)
  useMapEvents({
    click(e) {
      setCurrentLocation(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

const MapController = ({ center }: { center: { lat: number; lon: number } | null }) => {
  const map = useMap()
  useEffect(() => {
    if (center) {
      map.setView([center.lat, center.lon], map.getZoom())
    }
  }, [center, map])
  return null
}

export const MapView = () => {
  const { filteredStations, currentLocation } = useAppStore()
  const defaultCenter: [number, number] = [39.4699, -0.3763] // Valencia

  return (
    <div className="w-full h-full relative group">
      <MapContainer
        center={currentLocation ? [currentLocation.lat, currentLocation.lon] : defaultCenter}
        zoom={13}
        className="w-full h-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapController center={currentLocation} />
        <MapEvents />

        {currentLocation && (
          <Marker position={[currentLocation.lat, currentLocation.lon]}>
            <Popup>Tu ubicación actual</Popup>
          </Marker>
        )}

        {filteredStations.map((station) => (
          <Marker key={station.idEstacion} position={[station.latitud, station.longitud]}>
            <Popup>
              <div className="p-1">
                <h4 className="font-bold text-gray-900 border-b border-gray-100 pb-1 mb-1">
                  {station.nombreEstacion}
                </h4>
                <p className="text-sm text-blue-600 font-bold mb-1">
                  {station.precioCombustible.toFixed(3)} €/L
                </p>
                <div className="text-[11px] text-gray-500 leading-tight">
                  <p>{station.direccion}</p>
                  <p>{station.horario}</p>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
