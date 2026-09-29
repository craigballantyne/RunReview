import type { RunDetail } from "@run-review/shared";
import { PaceSection } from "../charts/PaceSection.js";
import { HeartRateSection } from "../charts/HeartRateSection.js";
import { HeartRateZonesSection } from "../charts/HeartRateZonesSection.js";
import { ElevationSection } from "../charts/ElevationSection.js";

/** The chart stack that previously sat directly in the drawer body. */
export function MetricsTab({ run }: { run: RunDetail }) {
  return (
    <div className="space-y-8">
      <PaceSection run={run} />
      <HeartRateSection run={run} />
      <HeartRateZonesSection run={run} />
      <ElevationSection run={run} />
    </div>
  );
}
