import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useRef, useState } from 'react'
import { isLocationConfigured, mapStyleUrl, type LngLat } from '../lib/location'
import './geo.css'

// MapLibre looks for its worker next to its own script, which does not exist once
// Vite bundles it; without this the map stays blank.
maplibregl.setWorkerUrl(workerUrl)

export type MapMarker = { position: LngLat; label?: string; color?: string }

type Props = {
  /** Route line to draw, as [lng, lat] points. */
  route?: LngLat[]
  /** Pins, e.g. the start, destination and the rider's pickup. */
  markers?: MapMarker[]
  /** Moving dot for a live trip; updating it does not re-fit the view. */
  vehicle?: LngLat | null
  className?: string
}

// Centre of India, shown until there is something to fit.
const INDIA: LngLat = [78.9, 22.5]
const ROUTE_SOURCE = 'route'

export function RouteMap({ route, markers, vehicle, className }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const pins = useRef<maplibregl.Marker[]>([])
  const car = useRef<maplibregl.Marker | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!isLocationConfigured || !container.current) return
    const map = new maplibregl.Map({
      container: container.current,
      style: mapStyleUrl(),
      center: INDIA,
      zoom: 3.5,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }))
    map.on('load', () => {
      map.addSource(ROUTE_SOURCE, {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
      })
      map.addLayer({
        id: ROUTE_SOURCE,
        type: 'line',
        source: ROUTE_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#1a73e8', 'line-width': 5 },
      })
      setLoaded(true)
    })
    mapRef.current = map
    return () => {
      pins.current = []
      car.current = null
      setLoaded(false)
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Route line and pins; re-fit the view whenever they change.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return
    const line = route ?? []
    ;(map.getSource(ROUTE_SOURCE) as maplibregl.GeoJSONSource).setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: line },
    })

    pins.current.forEach((m) => m.remove())
    pins.current = (markers ?? []).map((m) =>
      new maplibregl.Marker({ color: m.color ?? '#d93025' })
        .setLngLat(m.position)
        .setPopup(m.label ? new maplibregl.Popup({ offset: 24 }).setText(m.label) : undefined)
        .addTo(map),
    )

    const points = [...line, ...(markers ?? []).map((m) => m.position)]
    if (points.length > 0) {
      const bounds = points.reduce(
        (b, p) => b.extend(p),
        new maplibregl.LngLatBounds(points[0], points[0]),
      )
      map.fitBounds(bounds, { padding: 48, maxZoom: 16, duration: 0 })
    }
  }, [loaded, route, markers])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return
    if (!vehicle) {
      car.current?.remove()
      car.current = null
    } else if (car.current) {
      car.current.setLngLat(vehicle)
    } else {
      car.current = new maplibregl.Marker({ color: '#188038' }).setLngLat(vehicle).addTo(map)
    }
  }, [loaded, vehicle])

  if (!isLocationConfigured) {
    return (
      <div className={`route-map route-map--missing ${className ?? ''}`}>
        Map not configured. Run <code>npm run geo:env</code>.
      </div>
    )
  }
  return <div ref={container} className={`route-map ${className ?? ''}`} />
}
