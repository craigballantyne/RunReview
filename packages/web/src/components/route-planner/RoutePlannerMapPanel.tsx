import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Polyline, Marker, useMap, useMapEvents } from "react-leaflet";
import L, { type LeafletEvent, type LeafletMouseEvent } from "leaflet";
import "leaflet/dist/leaflet.css";
import { EDINBURGH_FALLBACK, getCurrentPositionOrFallback, type LatLng } from "../../lib/geolocation.js";
import type { RoutePlan, RoutePoint } from "../../routes/useRoutePlan.js";
import { HeatmapToggleControl } from "./HeatmapToggleControl.js";
import { HeatmapLayer } from "./HeatmapLayer.js";
import { useHeatmapPoints } from "../../api/useRoutePlanner.js";

const DEFAULT_ZOOM = 13;
const ROUTE_COLOR = "#9333ea"; // purple-600, matches the activity map's route markers/line
const POINT_SIZE = 16;
const POINT_HOVER_SIZE = 20;
const ADD_POINT_SIZE = 20;

interface HoverInsertState {
  lat: number;
  lng: number;
  /** Index in `plan.points` this new point would be spliced into — between points[index-1] and
   * points[index]. */
  insertIndex: number;
}

/** Squared perpendicular distance from `p` to the segment a→b (lat/lng treated as a flat plane —
 * an approximation, but segments between consecutive route points are short enough that this is
 * accurate enough for picking "which gap is closest", which is all this needs to do). */
function distanceToSegmentSq(p: RoutePoint, a: RoutePoint, b: RoutePoint): number {
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  if (dx === 0 && dy === 0) {
    const ddx = p.lng - a.lng;
    const ddy = p.lat - a.lat;
    return ddx * ddx + ddy * ddy;
  }
  const t = Math.max(0, Math.min(1, ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / (dx * dx + dy * dy)));
  const ddx = p.lng - (a.lng + t * dx);
  const ddy = p.lat - (a.lat + t * dy);
  return ddx * ddx + ddy * ddy;
}

/** Which gap between consecutive waypoints a hover position falls closest to, by straight-line
 * distance to each waypoint-to-waypoint segment — not the actual road-following geometry, since
 * consecutive waypoints are the more natural unit to splice a new one between. Returns the index
 * to insert at (i.e. one past the nearer segment's start). */
function findInsertIndex(hoverPoint: RoutePoint, points: RoutePoint[]): number {
  let bestIndex = 0;
  let bestDistSq = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const distSq = distanceToSegmentSq(hoverPoint, points[i]!, points[i + 1]!);
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestIndex = i;
    }
  }
  return bestIndex + 1;
}

interface RoutePlannerMapPanelProps {
  plan: RoutePlan;
}

// Route points need to be a draggable L.Marker (not the vector-based CircleMarker used
// elsewhere) — dragging is only built into Leaflet's Marker/Draggable, not Path layers. As a
// bonus this also matches ActivityMapPanel.tsx's finish-marker precedent: Marker renders in
// Leaflet's markerPane (z-index 600), above the overlayPane (z-index 400) the route Polyline
// uses, so points reliably sit visually on top of the line.
function createRoutePointIcon(isHovered: boolean): L.DivIcon {
  const size = isHovered ? POINT_HOVER_SIZE : POINT_SIZE;
  return L.divIcon({
    className: "",
    html: `<div style="
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      box-sizing: border-box;
      background: ${ROUTE_COLOR};
      border: 2px solid #fff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.4);
      cursor: grab;
      transition: width 0.12s ease, height 0.12s ease;
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function createAddPointIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="
      width: ${ADD_POINT_SIZE}px;
      height: ${ADD_POINT_SIZE}px;
      border-radius: 50%;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: center;
      background: ${ROUTE_COLOR};
      opacity: 0.85;
      border: 2px solid #fff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.4);
      cursor: pointer;
    "><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M5 1v8M1 5h8" /></svg></div>`,
    iconSize: [ADD_POINT_SIZE, ADD_POINT_SIZE],
    iconAnchor: [ADD_POINT_SIZE / 2, ADD_POINT_SIZE / 2],
  });
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

interface RoutePointMarkerProps {
  point: RoutePoint;
  draggable: boolean;
  onDragStart: () => void;
  onMoveEnd: (lat: number, lng: number) => void;
}

/** A hover-responsive, draggable marker for one route point. Hover state lives here (not lifted
 * up) since it's purely a per-marker visual affordance with no effect on route data. */
function RoutePointMarker({ point, draggable, onDragStart, onMoveEnd }: RoutePointMarkerProps) {
  const [isHovered, setIsHovered] = useState(false);
  // Leaflet's marker.setIcon() (fired whenever the `icon` prop changes) internally rebuilds the
  // marker's drag interaction from scratch — which, if called while a drag is in progress, ends
  // that drag right there (firing a real dragend at the current, likely-mid-gesture position) and
  // orphans the rest of the user's mouse movement. Since isHovered drives the icon, letting it
  // toggle mid-drag was silently truncating drags. Freezing it for the duration of a drag (rather
  // than just guarding the *position* prop, as this component already does below) keeps the icon
  // — and therefore Leaflet's drag session — untouched until the user actually releases.
  const isDraggingRef = useRef(false);
  const icon = useMemo(() => createRoutePointIcon(isHovered), [isHovered]);
  // react-leaflet's Marker only calls setLatLng() when the `position` prop's array *reference*
  // changes (a strict !== check, not a value comparison) — but does so unconditionally when it
  // does, even mid-drag. An inline `[point.lat, point.lng]` literal gets a new reference on every
  // render, including ones unrelated to this point actually moving (e.g. this marker's own hover
  // state toggling, or a sibling re-render cascading down). During an active drag that resets the
  // marker to its pre-drag position, fighting Leaflet's native drag tracking — memoizing on the
  // underlying values keeps the reference stable unless the point truly moved.
  const position = useMemo<[number, number]>(() => [point.lat, point.lng], [point.lat, point.lng]);

  return (
    <Marker
      position={position}
      icon={icon}
      draggable={draggable}
      eventHandlers={{
        mouseover: () => {
          if (!isDraggingRef.current) setIsHovered(true);
        },
        mouseout: () => {
          if (!isDraggingRef.current) setIsHovered(false);
        },
        dragstart: () => {
          isDraggingRef.current = true;
          onDragStart();
        },
        dragend: (e: LeafletEvent) => {
          isDraggingRef.current = false;
          const { lat, lng } = (e.target as L.Marker).getLatLng();
          onMoveEnd(lat, lng);
        },
      }}
    />
  );
}

interface AddPointMarkerProps {
  hover: HoverInsertState;
  draggable: boolean;
  onHoverMarker: () => void;
  onUnhoverMarker: () => void;
  onDragStart: () => void;
  onCommit: (insertIndex: number, lat: number, lng: number) => void;
}

/** The "+" marker shown while hovering the route line. `onCommit` fires from either `click` (a
 * plain click — commits at the hovered position) or `dragend` (click-and-drag in one motion —
 * commits at wherever the user released it), so the caller doesn't need to distinguish the two;
 * Leaflet itself suppresses `click` when a genuine drag occurred, so only one of these fires per
 * gesture. `hover.insertIndex` is captured via closure at the last render before a drag begins —
 * correct, since the parent freezes hover updates for the duration of the drag (see
 * isDraggingMarkerRef below).
 *
 * This marker renders directly on top of the polyline it's hovering over (Leaflet's markerPane
 * sits above the overlayPane the line uses), so once it appears, the cursor is over the marker's
 * own DOM element, not the line's — the polyline sees that as the pointer leaving it and fires
 * its own mouseout. onHoverMarker/onUnhoverMarker let the parent cancel that clear while the
 * marker itself is being hovered, so it doesn't vanish out from under an incoming click/drag. */
function AddPointMarker({ hover, draggable, onHoverMarker, onUnhoverMarker, onDragStart, onCommit }: AddPointMarkerProps) {
  const icon = useMemo(() => createAddPointIcon(), []);
  // Same reference-stability fix as RoutePointMarker's position — see its comment for why an
  // inline array literal here would fight an active drag.
  const position = useMemo<[number, number]>(() => [hover.lat, hover.lng], [hover.lat, hover.lng]);

  return (
    <Marker
      position={position}
      icon={icon}
      draggable={draggable}
      eventHandlers={{
        mouseover: onHoverMarker,
        mouseout: onUnhoverMarker,
        dragstart: onDragStart,
        dragend: (e: LeafletEvent) => {
          const { lat, lng } = (e.target as L.Marker).getLatLng();
          onCommit(hover.insertIndex, lat, lng);
        },
        click: () => onCommit(hover.insertIndex, hover.lat, hover.lng),
      }}
    />
  );
}

export function RoutePlannerMapPanel({ plan }: RoutePlannerMapPanelProps) {
  const [initialCenter, setInitialCenter] = useState<LatLng | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [hoverInsert, setHoverInsert] = useState<HoverInsertState | null>(null);
  const { data: heatmapData } = useHeatmapPoints(showHeatmap);
  // True while ANY marker (an existing route point or the "+" insert marker) is being dragged.
  // Guards two things: (1) the polyline's mouseout clearing/unmounting the "+" marker mid-drag,
  // since dragging it off the line means the cursor is no longer over the polyline; and (2) the
  // polyline's mousemove updating hoverInsert while dragging an EXISTING point — the cursor often
  // passes back over the line while dragging a point around, and any hoverInsert state change
  // re-renders every marker in this tree, including the one mid-drag; react-leaflet re-applies
  // its position prop via setLatLng() on that re-render, which fights Leaflet's own native drag
  // tracking and snaps the marker back to its pre-drag position before the user can drop it.
  const isDraggingMarkerRef = useRef(false);
  // The "+" marker sits directly on top of the polyline it's hovering over, so once it renders,
  // the polyline itself sees the pointer as having left it (the marker's DOM element is now what
  // the browser hit-tests) and fires mouseout — clearing hoverInsert immediately would unmount
  // the marker before a click/drag from the user can ever land on it. Clearing is deferred a
  // beat instead, so the marker's own mouseover (see AddPointMarker's onHoverMarker) has a chance
  // to cancel it first.
  const clearHoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelHoverClear() {
    if (clearHoverTimeoutRef.current !== null) {
      clearTimeout(clearHoverTimeoutRef.current);
      clearHoverTimeoutRef.current = null;
    }
  }

  function scheduleHoverClear() {
    cancelHoverClear();
    clearHoverTimeoutRef.current = setTimeout(() => {
      if (!isDraggingMarkerRef.current) setHoverInsert(null);
    }, 100);
  }

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
          <Polyline
            positions={plan.routeGeometry.map((p) => [p.lat, p.lng])}
            pathOptions={{ color: ROUTE_COLOR, weight: 4 }}
            eventHandlers={{
              mousemove: (e: LeafletMouseEvent) => {
                if (isDraggingMarkerRef.current) return;
                cancelHoverClear();
                const hoverPoint = { lat: e.latlng.lat, lng: e.latlng.lng };
                setHoverInsert({ ...hoverPoint, insertIndex: findInsertIndex(hoverPoint, plan.points) });
              },
              mouseout: () => {
                if (isDraggingMarkerRef.current) return;
                scheduleHoverClear();
              },
            }}
          />
        )}
        {plan.points.map((point, i) => (
          <RoutePointMarker
            key={i}
            point={point}
            draggable={!plan.isCalculating}
            onDragStart={() => {
              cancelHoverClear();
              setHoverInsert(null); // hide any lingering "+" marker — it's unrelated to this drag
              isDraggingMarkerRef.current = true;
            }}
            onMoveEnd={(lat, lng) => {
              isDraggingMarkerRef.current = false;
              void plan.movePoint(i, lat, lng);
            }}
          />
        ))}
        {hoverInsert && (
          <AddPointMarker
            key="add-point-marker"
            hover={hoverInsert}
            draggable={!plan.isCalculating}
            onHoverMarker={cancelHoverClear}
            onUnhoverMarker={scheduleHoverClear}
            onDragStart={() => {
              cancelHoverClear();
              isDraggingMarkerRef.current = true;
            }}
            onCommit={(insertIndex, lat, lng) => {
              cancelHoverClear();
              isDraggingMarkerRef.current = false;
              setHoverInsert(null);
              void plan.insertPoint(insertIndex, lat, lng);
            }}
          />
        )}
      </MapContainer>
      <HeatmapToggleControl checked={showHeatmap} onChange={setShowHeatmap} />
    </div>
  );
}
