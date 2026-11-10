'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix for Leaflet's default marker icons broken by webpack
const markerIcon = L.icon({
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize:    [25, 41],
  iconAnchor:  [12, 41],
  popupAnchor: [1, -34],
  shadowSize:  [41, 41],
})

interface Props {
  latitude:  number | null
  longitude: number | null
  onChange: (lat: number, lng: number) => void
}

// Default center: Santiago de Chile
const DEFAULT_LAT = -33.4489
const DEFAULT_LNG = -70.6693
const DEFAULT_ZOOM = 13

export default function MapPicker({ latitude, longitude, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<L.Map | null>(null)
  const markerRef    = useRef<L.Marker | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const lat = latitude  ?? DEFAULT_LAT
    const lng = longitude ?? DEFAULT_LNG

    const map = L.map(containerRef.current, { zoomControl: true }).setView([lat, lng], DEFAULT_ZOOM)
    mapRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map)

    if (latitude != null && longitude != null) {
      const marker = L.marker([latitude, longitude], { icon: markerIcon, draggable: true }).addTo(map)
      marker.on('dragend', () => {
        const pos = marker.getLatLng()
        onChange(
          Math.round(pos.lat * 1e6) / 1e6,
          Math.round(pos.lng * 1e6) / 1e6,
        )
      })
      markerRef.current = marker
    }

    map.on('click', (e: L.LeafletMouseEvent) => {
      const lat = Math.round(e.latlng.lat * 1e6) / 1e6
      const lng = Math.round(e.latlng.lng * 1e6) / 1e6

      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng])
      } else {
        const marker = L.marker([lat, lng], { icon: markerIcon, draggable: true }).addTo(map)
        marker.on('dragend', () => {
          const pos = marker.getLatLng()
          onChange(
            Math.round(pos.lat * 1e6) / 1e6,
            Math.round(pos.lng * 1e6) / 1e6,
          )
        })
        markerRef.current = marker
      }

      onChange(lat, lng)
    })

    return () => {
      map.remove()
      mapRef.current  = null
      markerRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync marker when parent updates coords (e.g. "usar mi ubicación")
  useEffect(() => {
    if (!mapRef.current) return
    if (latitude == null || longitude == null) return

    if (markerRef.current) {
      markerRef.current.setLatLng([latitude, longitude])
    } else {
      const marker = L.marker([latitude, longitude], { icon: markerIcon, draggable: true }).addTo(mapRef.current)
      marker.on('dragend', () => {
        const pos = marker.getLatLng()
        onChange(
          Math.round(pos.lat * 1e6) / 1e6,
          Math.round(pos.lng * 1e6) / 1e6,
        )
      })
      markerRef.current = marker
    }

    mapRef.current.setView([latitude, longitude], mapRef.current.getZoom())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude])

  return (
    <div
      ref={containerRef}
      style={{ height: 280, borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb' }}
    />
  )
}
