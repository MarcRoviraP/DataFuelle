import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, LayersControl, ZoomControl, Circle } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

const { BaseLayer } = LayersControl
import { useAppStore } from '../store/useAppStore'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react'
import { LocateFixed, Calendar } from 'lucide-react'
import { shouldShowLastUpdate, formatLastUpdate } from '../utils/date'

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
    <div style="position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center;animation:marker-pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
      <div style="position:absolute;width:36px;height:36px;border-radius:50%;background:rgba(37,99,235,0.3);animation:pulse 2s ease-out infinite;"></div>
      <div style="width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 2px 12px rgba(37,99,235,0.8);z-index:1;"></div>
    </div>
    <style>
      @keyframes pulse{0%{transform:scale(0.8);opacity:1}100%{transform:scale(3);opacity:0}}
      @keyframes marker-pop{0%{transform:scale(0) translateY(-20px);opacity:0}100%{transform:scale(1) translateY(0);opacity:1}}
    </style>
  `,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -20],
})

L.Marker.prototype.options.icon = DefaultIcon

const MapEvents = () => {
  const fetchStations = useAppStore(state => state.fetchStations)
  const setCurrentLocation = useAppStore(state => state.setCurrentLocation)
  const setSelectedStationId = useAppStore(state => state.setSelectedStationId)
  const selectedStationId = useAppStore(state => state.selectedStationId)

  useMapEvents({
    click(e) {
      if (selectedStationId) {
        // If a card/popup is open, clicking the map just closes it
        setSelectedStationId(null)
      } else {
        // Otherwise, move the search center AND fetch new data
        setCurrentLocation(e.latlng.lat, e.latlng.lng)
        fetchStations()
      }
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

const LocateMeButton = () => {
  const map = useMap()
  const { currentLocation, setCurrentLocation } = useAppStore()
  const buttonRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (buttonRef.current) {
      L.DomEvent.disableClickPropagation(buttonRef.current)
      L.DomEvent.disableScrollPropagation(buttonRef.current)
    }
  }, [])

  const handleLocate = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    
    if (currentLocation) {
      map.setView([currentLocation.lat, currentLocation.lon], 15)
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude, longitude } = pos.coords
        setCurrentLocation(latitude, longitude)
        map.setView([latitude, longitude], 15)
      })
    }
  }

  return (
    <div 
      ref={buttonRef}
      className="leaflet-bottom leaflet-right" 
      style={{ marginBottom: '30px', marginRight: '10px', pointerEvents: 'auto', zIndex: 1000 }}
    >
      <div className="leaflet-control">
        <button
          onClick={handleLocate}
          className="bg-white hover:bg-slate-50 text-blue-600 p-2.5 rounded-xl shadow-2xl border-2 border-white transition-all active:scale-90 flex items-center justify-center group/btn"
          title="Mi ubicación"
          style={{ width: '46px', height: '46px' }}
        >
          <LocateFixed size={24} className="group-hover/btn:scale-110 transition-transform" />
        </button>
      </div>
    </div>
  )
}

const fmt = (v: number | null | undefined) =>
  v && v > 0 ? `${v.toFixed(3)} €/L` : '—'

export const MapView = () => {
  const { filteredStations, currentLocation, selectedFuelTypeId, selectedStationId, stationDiscounts, radius, isLoading } = useAppStore()
  const [visualRadius, setVisualRadius] = useState<number>(0)
  const defaultCenter: [number, number] = [39.4699, -0.3763]
  const markerRefs = useRef<Map<number, L.Marker>>(new Map())
  const sweepIntervalRef = useRef<number | null>(null)
  const lastSearchRef = useRef<{ lat: number, lon: number, radius: number } | null>(null)

  // Purely visual Radar Sweep Animation
  useEffect(() => {
    if (!currentLocation) {
      setVisualRadius(0)
      lastSearchRef.current = null
      return
    }

    const isNewSearch = !lastSearchRef.current || 
      lastSearchRef.current.lat !== currentLocation.lat || 
      lastSearchRef.current.lon !== currentLocation.lon ||
      lastSearchRef.current.radius !== radius

    if (!isNewSearch) return

    lastSearchRef.current = { lat: currentLocation.lat, lon: currentLocation.lon, radius }
    setVisualRadius(0)
    
    if (sweepIntervalRef.current) {
      cancelAnimationFrame(sweepIntervalRef.current)
    }

    const target = radius
    const duration = 1200
    const start = performance.now()

    const animateSweep = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const easeOutQuad = (t: number) => t * (2 - t)
      const easedProgress = easeOutQuad(progress)
      
      setVisualRadius(easedProgress * target)

      if (progress < 1) {
        sweepIntervalRef.current = requestAnimationFrame(animateSweep)
      } else {
        setVisualRadius(target)
      }
    }

    sweepIntervalRef.current = requestAnimationFrame(animateSweep)

    return () => {
      if (sweepIntervalRef.current) cancelAnimationFrame(sweepIntervalRef.current)
    }
  }, [currentLocation?.lat, currentLocation?.lon, radius])

  // Memoize average price and icon generator to avoid overhead during sweep
  const prices = useMemo(() => filteredStations.map(s => s.precioCombustible).filter(p => p > 0), [filteredStations])
  const averagePrice = useMemo(() => prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0, [prices])

  // Icon Cache to prevent flickering
  const iconCache = useRef<Map<string, L.DivIcon>>(new Map())

  const getPriceIcon = useCallback((price: number, isSelected: boolean) => {
    let color = '#64748b' // Default slate
    
    if (price > 0 && averagePrice > 0) {
      if (price < averagePrice * 0.98) color = '#16a34a' // Green (Cheap)
      else if (price > averagePrice * 1.02) color = '#dc2626' // Red (Expensive)
      else color = '#d97706' // Orange (Average)
    }

    const cacheKey = `${price}-${isSelected}-${color}`
    if (iconCache.current.has(cacheKey)) {
      return iconCache.current.get(cacheKey)!
    }

    const icon = L.divIcon({
      className: '',
      html: `
        <div style="
          background: ${isSelected ? '#2563eb' : color};
          color: white;
          padding: 3px 12px 3px 7px;
          border-radius: 6px;
          font-weight: 800;
          font-size: 11px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.2);
          border: 2px solid ${isSelected ? '#fff' : 'transparent'};
          transform: ${isSelected ? 'scale(1.15)' : 'scale(1)'};
          transition: all 0.2s;
          white-space: nowrap;
          pointer-events: none;
          animation: marker-inner-pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        ">
          ${price.toFixed(3)}€
        </div>
      `,
      iconSize: [60, 24],
      iconAnchor: [30, 12],
    })

    iconCache.current.set(cacheKey, icon)
    return icon
  }, [averagePrice])

  // Cluster Icon Cache
  const clusterIconCache = useRef<Map<string, L.DivIcon>>(new Map())

  const createClusterCustomIcon = useCallback((cluster: any) => {
    const count = cluster.getChildCount()
    const markers = cluster.getAllChildMarkers()
    let minPriceInCluster = Infinity
    
    markers.forEach((m: any) => {
      const price = m.options.stationPrice
      if (price && price > 0 && price < minPriceInCluster) {
        minPriceInCluster = price
      }
    })

    let color = '#d97706' // Orange (Default)
    if (minPriceInCluster !== Infinity && averagePrice > 0) {
      if (minPriceInCluster < averagePrice * 0.98) color = '#16a34a' // Green (Cheap)
      else if (minPriceInCluster > averagePrice * 1.02) color = '#dc2626' // Red (Expensive)
    }

    const cacheKey = `${count}-${minPriceInCluster}-${color}`
    if (clusterIconCache.current.has(cacheKey)) {
      return clusterIconCache.current.get(cacheKey)!
    }

    const icon = L.divIcon({
      html: `
        <div style="
          background: ${color};
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 800;
          font-size: 14px;
          box-shadow: 0 0 15px ${color}66, inset 0 0 10px rgba(0,0,0,0.2);
          border: 3px solid rgba(255,255,255,0.8);
          backdrop-filter: blur(4px);
          animation: marker-inner-pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        ">
          <span>${count}</span>
        </div>
      `,
      className: 'custom-marker-cluster',
      iconSize: L.point(40, 40, true),
    })

    clusterIconCache.current.set(cacheKey, icon)
    return icon
  }, [averagePrice])

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
        attributionControl={false}
        zoomControl={false}
        preferCanvas={true} // High-performance graphics: uses Canvas instead of SVG for paths/circles
      >
        <ZoomControl position="bottomright" />
        <LayersControl position="topright">
          <BaseLayer checked name="Mapa">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          </BaseLayer>
          <BaseLayer name="Satélite">
            <TileLayer
              attribution='&copy; CNES, Distribution Airbus DS, © Airbus DS, © PlanetObserver (Contains Copernicus Data) | &copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url={`https://tiles.stadiamaps.com/tiles/alidade_satellite/{z}/{x}/{y}{r}.jpg${import.meta.env.VITE_STADIA_API_KEY ? `?api_key=${import.meta.env.VITE_STADIA_API_KEY}` : ''}`}
            />
          </BaseLayer>
        </LayersControl>
        <MapController center={currentLocation} />
        <MapEvents />
        <LocateMeButton />
        <MarkerOpener stationId={selectedStationId} markerRefs={markerRefs} />

        {currentLocation && (
          <>
            <Marker position={[currentLocation.lat, currentLocation.lon]} icon={LocationIcon} zIndexOffset={1000} />
            
            {/* The expanding Radar Ring */}
            <Circle
              center={[currentLocation.lat, currentLocation.lon]}
              radius={visualRadius * 1000}
              pathOptions={{
                fillColor: '#3b82f6',
                fillOpacity: 0.12,
                color: '#2563eb',
                weight: 2,
                opacity: 0.7,
              }}
              key={`radar-ring-${currentLocation.lat}-${currentLocation.lon}`}
            />

            {/* Faint search limit circle */}
            {!isLoading && visualRadius < radius && (
              <Circle
                center={[currentLocation.lat, currentLocation.lon]}
                radius={radius * 1000}
                pathOptions={{
                  fillColor: '#94a3b8',
                  fillOpacity: 0.05,
                  color: '#cbd5e1',
                  weight: 1,
                  opacity: 0.3,
                }}
              />
            )}
          </>
        )}

        <MarkerClusterGroup
          chunkedLoading={true}
          chunkInterval={100} // Process markers in smaller chunks
          chunkDelay={50}     // Add delay between chunks to let UI breathe
          iconCreateFunction={createClusterCustomIcon}
          disableClusteringAtZoom={14}
          maxClusterRadius={100}
          spiderfyOnMaxZoom={true}
          showCoverageOnHover={false}
        >
          {useMemo(() => filteredStations.map((station) => (
            <Marker
              key={station.idEstacion}
              position={[station.latitud, station.longitud]}
              icon={getPriceIcon(station.precioCombustible, selectedStationId === station.idEstacion)}
              // @ts-ignore - custom property for cluster logic
              stationPrice={station.precioCombustible}
              ref={(ref) => {
                if (ref) markerRefs.current.set(station.idEstacion, ref)
                else markerRefs.current.delete(station.idEstacion)
              }}
              eventHandlers={{
                click: () => useAppStore.getState().setSelectedStationId(station.idEstacion)
              }}
            >
              <Popup minWidth={200}>
                {/* ... existing popup content ... */}
                <div style={{ padding: '4px 2px', minWidth: 200 }}>
                  <h4 style={{
                    fontWeight: 600, fontSize: 13, color: '#0f172a',
                    borderBottom: '1px solid #e2e8f0', paddingBottom: 6, marginBottom: 8
                  }}>
                    {station.nombreEstacion}
                  </h4>

                  {/* 3 fuel prices */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8 }}>
                    {fuels.map(({ id, label, key, color }) => {
                      const isActive = selectedFuelTypeId === id
                      const rawPrice = station[key]
                      const discount = stationDiscounts.get(station.idEstacion) ?? 0
                      const discountedPrice = rawPrice && discount > 0 ? rawPrice - discount : null
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
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}>
                            {discountedPrice !== null ? (
                              <>
                                <span style={{ textDecoration: 'line-through', color: isActive ? 'rgba(255,255,255,0.6)' : '#94a3b8', fontSize: 11 }}>
                                  {fmt(rawPrice)}
                                </span>
                                <span style={{ color: isActive ? '#fff' : '#2563eb', fontWeight: 900 }}>
                                  {fmt(discountedPrice)}
                                </span>
                              </>
                            ) : (
                              <span style={{ color: isActive ? '#fff' : color }}>
                                {isActive && station.diff !== undefined && station.diff !== 0 && (
                                  <span style={{ 
                                     fontSize: 10, 
                                     fontWeight: 800,
                                     color: station.diff < 0 ? '#bbf7d0' : '#fecaca',
                                     marginRight: 4
                                  }}>
                                    {station.diff > 0 ? '+' : ''}{station.diff.toFixed(3)}
                                  </span>
                                )}
                                {fmt(rawPrice)}
                              </span>
                            )}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5, marginBottom: 10 }}>
                    <p>{station.direccion}</p>
                    <p style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{station.horario}</p>
                    {shouldShowLastUpdate(station.lastUpdate) && (
                      <p style={{ color: '#d97706', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        <Calendar size={12} />
                        {formatLastUpdate(station.lastUpdate)}
                      </p>
                    )}
                  </div>

                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${station.latitud},${station.longitud}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '8px',
                      background: '#2563eb',
                      color: 'white',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      textDecoration: 'none',
                      boxShadow: '0 2px 4px rgba(37,99,235,0.2)'
                    }}
                  >
                    Fijar ruta en Google Maps
                  </a>

                  <button
                    onClick={() => {
                      const store = useAppStore.getState()
                      store.setViewMode('list')
                      store.setSelectedStationId(station.idEstacion)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      width: '100%',
                      marginTop: 6,
                      padding: '8px',
                      background: '#f1f5f9',
                      color: '#2563eb',
                      border: '2px solid #e2e8f0',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    📋 Ver en lista
                  </button>
                </div>
              </Popup>
            </Marker>
          )), [filteredStations, selectedStationId, selectedFuelTypeId, stationDiscounts])}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  )
}
