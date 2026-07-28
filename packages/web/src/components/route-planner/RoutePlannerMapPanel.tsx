import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { EDINBURGH_FALLBACK, getCurrentPositionOrFallback, type LatLng } from "../../lib/geolocation.js";
import type { RoutePlan } from "../../routes/useRoutePlan.js";
import { HeatmapToggleControl } from "./HeatmapToggleControl.js";
import { HeatmapLayer } from "./HeatmapLayer.js";
import { useHeatmapPoints } from "../../api/useRoutePlanner.js";

const DEFAULT_ZOOM = 13;
const ROUTE_COLOR = "#9333ea"; // purple-600, matches the activity map's route markers/line

interface RoutePlannerMapPanelProps {
  plan: RoutePlan;
}

function RecenterOnUser({ center }: { center: LatLng }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lng], DEFAULT_ZOOM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function ClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function RoutePlannerMapPanel({ plan }: RoutePlannerMapPanelProps) {
  const [initialCenter, setInitialCenter] = useState<LatLng | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const { data: heatmapData } = useHeatmapPoints(showHeatmap);

  useEffect(() => {
    getCurrentPositionOrFallback().then(setInitialCenter);
  }, []);

  const center = initialCenter ?? EDINBURGH_FALLBACK;

  return (
    <div className="relative h-full w-full">
      <MapContainer center={[center.lat, center.lng]} zoom={DEFAULT_ZOOM} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={20}
        />
        <RecenterOnUser center={center} />
        <ClickHandler onMapClick={(lat, lng) => void plan.addPoint(lat, lng)} />
        {showHeatmap && heatmapData && <HeatmapLayer points={heatmapData.points} />}
        {plan.routeGeometry.length > 1 && (
          <Polyline positions={plan.routeGeometry.map((p) => [p.lat, p.lng])} pathOptions={{ color: ROUTE_COLOR, weight: 4 }} />
        )}
        {plan.points.map((point, i) => (
          <CircleMarker
            key={i}
            center={[point.lat, point.lng]}
            radius={8}
            pathOptions={{ color: ROUTE_COLOR, fillColor: ROUTE_COLOR, fillOpacity: 1 }}
          />
        ))}
      </MapContainer>
      <HeatmapToggleControl checked={showHeatmap} onChange={setShowHeatmap} />
    </div>
  );
}
