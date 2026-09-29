import type { RunDetail, SegmentRole } from "@run-review/shared";
import { formatDuration, formatMinSec } from "@run-review/shared";

/**
 * Role colours are chosen so the *shape* of a session is legible at a glance: the work stands out
 * in purple, the easy parts recede, and warmup/cooldown bookend them in neutral tones.
 */
const ROLE_STYLES: Record<SegmentRole, { label: string; className: string }> = {
  warmup: { label: "Warm-up", className: "bg-amber-100 text-amber-800" },
  rep: { label: "Rep", className: "bg-purple-100 text-purple-800" },
  float: { label: "Float", className: "bg-blue-100 text-blue-800" },
  recovery: { label: "Recovery", className: "bg-emerald-100 text-emerald-800" },
  steady: { label: "Steady", className: "bg-gray-100 text-gray-700" },
  cooldown: { label: "Cool-down", className: "bg-slate-100 text-slate-700" },
};

const STRUCTURE_LABELS: Record<string, string> = {
  easy: "Easy run",
  steady: "Steady run",
  intervals: "Interval session",
  progression: "Progression run",
  fartlek: "Fartlek",
  mixed: "Mixed session",
  unclear: "Unstructured",
};

function formatPaceCell(paceSecPerKm: number): string {
  // A zero-distance lap yields a non-finite pace; showing a dash beats showing "Infinity".
  return Number.isFinite(paceSecPerKm) ? `${formatMinSec(paceSecPerKm)} /km` : "–";
}

export function SegmentsTab({ run }: { run: RunDetail }) {
  const segments = run.insight?.segments ?? [];

  // Falls back to raw splits so the table still renders for a run that hasn't been analysed —
  // without roles, but with the same shape rather than an empty tab.
  const rows =
    segments.length > 0
      ? segments.map((s) => ({
          splitIndex: s.splitIndex,
          role: s.role as SegmentRole | null,
          distanceM: s.distanceM,
          durationSec: s.durationSec,
          paceSecPerKm: s.paceSecPerKm,
          avgHr: s.avgHr,
        }))
      : run.splits.map((s) => ({
          splitIndex: s.splitIndex,
          role: null,
          distanceM: s.distanceM,
          durationSec: s.durationSec,
          paceSecPerKm: s.distanceM > 0 ? s.durationSec / (s.distanceM / 1000) : Number.POSITIVE_INFINITY,
          avgHr: s.avgHr,
        }));

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-500">No lap data recorded for this run.</p>;
  }

  const structure = run.insight?.workoutStructure;
  const fastest = Math.min(...rows.map((r) => (Number.isFinite(r.paceSecPerKm) ? r.paceSecPerKm : Infinity)));
  const slowest = Math.max(...rows.map((r) => (Number.isFinite(r.paceSecPerKm) ? r.paceSecPerKm : 0)));

  return (
    <div>
      {structure && (
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded-full bg-purple-600 px-2.5 py-0.5 text-xs font-semibold text-white">
            {STRUCTURE_LABELS[structure] ?? structure}
          </span>
          {run.insight?.lapMode === "structured" && (
            <span className="text-xs text-gray-500">Laps set on the watch</span>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <th className="py-2 pr-3 font-medium">Lap</th>
              <th className="py-2 pr-3 font-medium">Role</th>
              <th className="py-2 pr-3 text-right font-medium">Distance</th>
              <th className="py-2 pr-3 text-right font-medium">Time</th>
              <th className="py-2 pr-3 text-right font-medium">Pace</th>
              <th className="py-2 text-right font-medium">Avg HR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const style = row.role ? ROLE_STYLES[row.role] : null;
              // A subtle bar behind the pace cell makes the session's rhythm visible without a chart.
              const span = slowest - fastest;
              const intensity =
                span > 0 && Number.isFinite(row.paceSecPerKm) ? 1 - (row.paceSecPerKm - fastest) / span : 0;

              return (
                <tr key={row.splitIndex} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 pr-3 tabular-nums text-gray-500">{row.splitIndex}</td>
                  <td className="py-2 pr-3">
                    {style ? (
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${style.className}`}>
                        {style.label}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">–</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-gray-900">
                    {(row.distanceM / 1000).toFixed(2)} km
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-gray-900">{formatDuration(row.durationSec)}</td>
                  <td className="py-2 pr-3 text-right">
                    <div className="relative inline-block min-w-[5.5rem] rounded px-1.5 py-0.5 text-right tabular-nums font-medium text-gray-900">
                      <span
                        aria-hidden
                        className="absolute inset-0 rounded bg-purple-500"
                        style={{ opacity: 0.06 + intensity * 0.22 }}
                      />
                      <span className="relative">{formatPaceCell(row.paceSecPerKm)}</span>
                    </div>
                  </td>
                  <td className="py-2 text-right tabular-nums text-gray-600">
                    {row.avgHr !== null ? `${row.avgHr}` : "–"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
