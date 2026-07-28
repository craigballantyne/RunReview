import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";

interface HeatmapLayerProps {
  points: [number, number][];
}

/** Imperative Leaflet layer, same shape as ActivityMapPanel.tsx's FitBounds/RecenterOnUser —
 * react-leaflet has no built-in heatmap support, so this reaches into the raw Leaflet instance
 * via useMap() rather than rendering a react-leaflet component. */
export function HeatmapLayer({ points }: HeatmapLayerProps) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;

    const layer = L.heatLayer(
      points.map(([lat, lng]): [number, number, number] => [lat, lng, 1]),
      {
        // Small as leaflet.heat sensibly allows — big radius/blur values merge nearby track
        // points into indistinct blobs; keeping both tight aims to preserve visible route shapes
        // rather than washing them out, at the cost of needing to zoom in further to read it.
        radius: 3,
        blur: 2,
        // Pure yellow (#FFFF00) has very low contrast against CARTO Positron's light basemap —
        // "gold" reads as the same yellow-orange-red progression but stays visible. minOpacity
        // (leaflet.heat defaults to a barely-there 0.05) is raised so even single-visit points
        // render solidly instead of fading almost to nothing.
        gradient: { 0.4: "gold", 0.7: "orange", 1.0: "red" },
        minOpacity: 0.4,
      },
    );
    layer.addTo(map);

    return () => {
      layer.remove();
    };
  }, [map, points]);

  return null;
}
