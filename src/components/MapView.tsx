import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import { useAppStore } from '../store/useAppStore'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'

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

// Distinctive location icon — pulsing blue circle via SVG DivIcon
const LocationIcon = L.divIcon({
  className: '',
  html: `
    <div style="position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center;">
      <div style="position:absolute;width:36px;height:36px;border-radius:50%;background:rgba(37,99,235,0.2);animation:pulse 1.8s ease-out infinite;"></div>
      <div style="width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 2px 8px rgba(37,99,235,0.6);z-index:1;"></div>
    </div>
    <style>@keyframes pulse{0%{transform:scale(0.8);opacity:1}100%{transform:scale(2.2);opacity:0}}</style>
  `,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -20],
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

// Programmatically open the popup of the selected marker
const MarkerOpener = ({
  stationId,
  markerRefs,
}: {
  stationId: number | null
  markerRefs: React.MutableRefObject<Map<number, L.Marker>>
}) => {
  const map = useMap()
  useEffect(() => {
    if (stationId === null) return
    const marker = markerRefs.current.get(stationId)
    if (marker) {
      const latlng = marker.getLatLng()
      map.setView(latlng, Math.max(map.getZoom(), 15), { animate: true })
      marker.openPopup()
    }
  }, [stationId, map, markerRefs])
  return null
}

const fmt = (v: number | null | undefined) =>
  v && v > 0 ? `${v.toFixed(3)} €/L` : '—'

export const MapView = () => {
  const { filteredStations, currentLocation, selectedFuelTypeId, selectedStationId } = useAppStore()
  const defaultCenter: [number, number] = [39.4699, -0.3763]
  const markerRefs = useRef<Map<number, L.Marker>>(new Map())

  // Fuel badge config
  const fuels = [
    { id: 9,  label: 'G 95',   key: 'precioG95'    as const, color: '#16a34a' },
    { id: 12, label: 'G 98',   key: 'precioG98'    as const, color: '#7c3aed' },
    { id: 6,  label: 'Diesel', key: 'precioDiesel' as const, color: '#b45309' },
  ] as const

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
        <MarkerOpener stationId={selectedStationId} markerRefs={markerRefs} />

        {currentLocation && (
          <Marker position={[currentLocation.lat, currentLocation.lon]} icon={LocationIcon}>
            <Popup>
              <div style={{ fontWeight: 700, color: '#2563eb', fontSize: 13 }}>
                📍 Tu ubicación actual
              </div>
            </Popup>
          </Marker>
        )}

        {filteredStations.map((station) => (
          <Marker
            key={station.idEstacion}
            position={[station.latitud, station.longitud]}
            ref={(ref) => {
              if (ref) markerRefs.current.set(station.idEstacion, ref)
              else markerRefs.current.delete(station.idEstacion)
            }}
          >
            <Popup minWidth={200}>
              <div style={{ padding: '4px 2px', minWidth: 200 }}>
                <h4 style={{
                  fontWeight: 800, fontSize: 13, color: '#0f172a',
                  borderBottom: '1px solid #e2e8f0', paddingBottom: 6, marginBottom: 8
                }}>
                  {station.nombreEstacion}
                </h4>

                {/* 3 fuel prices */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8 }}>
                  {fuels.map(({ id, label, key, color }) => {
                    const isActive = selectedFuelTypeId === id
                    const price = station[key]
                    return (
                      <div
                        key={id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '5px 10px',
                          borderRadius: 8,
                          background: isActive ? color : '#f8fafc',
                          border: isActive ? `2px solid ${color}` : '2px solid #e2e8f0',
                          transition: 'all 0.2s',
                        }}
                      >
                        <span style={{
                          fontWeight: 700, fontSize: 12,
                          color: isActive ? '#fff' : '#64748b',
                        }}>
                          {isActive ? '★ ' : ''}{label}
                        </span>
                        <span style={{
                          fontWeight: 800, fontSize: 13,
                          color: isActive ? '#fff' : color,
                        }}>
                          {fmt(price)}
                        </span>
                      </div>
                    )
                  })}
                </div>

                <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>
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
