import { RoutePlannerSidebar } from "../components/route-planner/RoutePlannerSidebar.js";
import { RoutePlannerMapPanel } from "../components/route-planner/RoutePlannerMapPanel.js";
import { useRoutePlan } from "./useRoutePlan.js";

export function RoutePlannerPage() {
  const plan = useRoutePlan();

  return (
    <div className="flex h-full">
      <div className="w-1/3 border-r border-gray-200">
        <RoutePlannerSidebar plan={plan} />
      </div>
      <div className="w-2/3">
        <RoutePlannerMapPanel plan={plan} />
      </div>
    </div>
  );
}
