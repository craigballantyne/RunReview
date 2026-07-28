import { Switch } from "../common/Switch.js";

interface HeatmapToggleControlProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

// Same floating-overlay positioning as RouteStyleControl.tsx on the activity map — nothing else
// occupies the top-right corner on this page.
export function HeatmapToggleControl({ checked, onChange }: HeatmapToggleControlProps) {
  return (
    <div className="absolute right-3 top-3 z-[1000] rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-md">
      <Switch checked={checked} onChange={onChange} label="Show Heatmap" />
    </div>
  );
}
