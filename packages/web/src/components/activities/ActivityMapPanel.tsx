import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { useRunDetail } from "../../api/useRuns.js";
import { buildRouteCoordinates, type RouteCoordinate } from "../../lib/build-route-coordinates.js";
import { buildGradientSegments } from "../../lib/route-gradient.js";
import { EDINBURGH_FALLBACK, getCurrentPositionOrFallback, type LatLng } from "../../lib/geolocation.js";
import { RouteStyleControl, type RouteStyle } from "./RouteStyleControl.js";
import { RunMetricsDrawer } from "./RunMetricsDrawer.js";

const MAX_ANIMATION_SEC = 10;
const MIN_ANIMATION_MS = 300;
const DEFAULT_ZOOM = 13;
const ROUTE_COLOR = "#9333ea"; // purple-600
const FINISH_MARKER_SIZE = 18;

// A plain Marker (vs. CircleMarker) renders in Leaflet's markerPane (z-index 600), which sits
// above the overlayPane (z-index 400) that Polyline/CircleMarker use — so the finish flag
// reliably paints above the route line without needing a custom pane.
function createFinishIcon(borderColor: string) {
  return L.divIcon({
    className: "",
    html: `<div style="
      width: ${FINISH_MARKER_SIZE}px;
      height: ${FINISH_MARKER_SIZE}px;
      border-radius: 50%;
      box-sizing: border-box;
      border: 2px solid ${borderColor};
      background:
        conic-gradient(#111 0deg 90deg, #fff 90deg 180deg, #111 180deg 270deg, #fff 270deg 360deg);
      box-shadow: 0 1px 3px rgba(0,0,0,0.4);
    "></div>`,
    iconSize: [FINISH_MARKER_SIZE, FINISH_MARKER_SIZE],
    iconAnchor: [FINISH_MARKER_SIZE / 2, FINISH_MARKER_SIZE / 2],
  });
}

interface ActivityMapPanelProps {
  selectedRunId: string | null;
}

function FitBounds({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [32, 32] });
  }, [bounds, map]);
  return null;
}

function RecenterOnUser({ center }: { center: LatLng }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lng], DEFAULT_ZOOM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function useAnimatedRoute(coordinates: RouteCoordinate[], distanceM: number, routeKey: string | null) {
  const [revealed, setRevealed] = useState<RouteCoordinate[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);

    if (coordinates.length < 2) {
      setRevealed(coordinates);
      setIsComplete(true);
      return;
    }

    setIsComplete(false);
    const distanceKm = distanceM / 1000;
    const durationMs = Math.max(MIN_ANIMATION_MS, Math.min(MAX_ANIMATION_SEC, distanceKm) * 1000);
    const start = performance.now();

    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      const count = Math.max(2, Math.round(t * coordinates.length));
      setRevealed(coordinates.slice(0, count));
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        setIsComplete(true);
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);

  return { revealed, isComplete };
}

export function ActivityMapPanel({ selectedRunId }: ActivityMapPanelProps) {
  const { data: run } = useRunDetail(selectedRunId);
  const [initialCenter, setInitialCenter] = useState<LatLng | null>(null);
  const [routeStyle, setRouteStyle] = useState<RouteStyle>("animated");
  const [isMetricsOpen, setIsMetricsOpen] = useState(false);

  useEffect(() => {
    getCurrentPositionOrFallback().then(setInitialCenter);
  }, []);

  const coordinates = run ? buildRouteCoordinates(run.trackPoints) : [];
  const hasNoMapData = run !== undefined && coordinates.length === 0;
  const { revealed, isComplete } = useAnimatedRoute(coordinates, run?.distanceM ?? 0, run?.id ?? null);
  const firstPoint = coordinates[0];
  const lastPoint = coordinates[coordinates.length - 1];
  const isAnimated = routeStyle === "animated";
  const gradientSegments = run && !isAnimated ? buildGradientSegments(run.trackPoints, routeStyle) : [];
  const showFinishMarker = lastPoint !== undefined && (!isAnimated || isComplete);

  const startColor = isAnimated ? ROUTE_COLOR : (gradientSegments[0]?.color ?? ROUTE_COLOR);
  const endColor = isAnimated ? ROUTE_COLOR : (gradientSegments[gradientSegments.length - 1]?.color ?? ROUTE_COLOR);
  const finishIcon = useMemo(() => createFinishIcon(endColor), [endColor]);

  const bounds: LatLngBoundsExpression | null =
    coordinates.length > 0 ? (coordinates.map((c) => [c.lat, c.lng]) as [number, number][]) : null;

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
        {!selectedRunId && <RecenterOnUser center={center} />}
        {bounds && <FitBounds bounds={bounds} />}
        {isAnimated && revealed.length > 1 && (
          <Polyline positions={revealed.map((c) => [c.lat, c.lng])} pathOptions={{ color: ROUTE_COLOR, weight: 4 }} />
        )}
        {!isAnimated &&
          gradientSegments.map((segment, i) => (
            <Polyline key={i} positions={segment.positions} pathOptions={{ color: segment.color, weight: 4 }} />
          ))}
        {firstPoint && (
          <CircleMarker
            center={[firstPoint.lat, firstPoint.lng]}
            radius={8}
            pathOptions={{ color: startColor, fillColor: startColor, fillOpacity: 1 }}
          />
        )}
        {showFinishMarker && lastPoint && <Marker position={[lastPoint.lat, lastPoint.lng]} icon={finishIcon} />}
      </MapContainer>
      {coordinates.length > 0 && (
        <RouteStyleControl
          value={routeStyle}
          onChange={setRouteStyle}
          isAllMetricsOpen={isMetricsOpen}
          onOpenAllMetrics={() => setIsMetricsOpen(true)}
        />
      )}
      {hasNoMapData && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80">
          <p className="rounded-md bg-gray-900/90 px-4 py-2 text-sm font-medium text-white">
            This activity does not contain any mapping data
          </p>
        </div>
      )}
      <RunMetricsDrawer runId={selectedRunId} isOpen={isMetricsOpen} onClose={() => setIsMetricsOpen(false)} />
    </div>
  );
}
