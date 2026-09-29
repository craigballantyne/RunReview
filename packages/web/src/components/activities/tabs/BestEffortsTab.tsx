import type { RunDetail } from "@run-review/shared";
import { formatDuration, formatMinSec } from "@run-review/shared";

function TrophyIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M18 4V2H6v2H2v3a5 5 0 0 0 4.1 4.9A6 6 0 0 0 11 15.9V18H8v2h8v-2h-3v-2.1a6 6 0 0 0 4.9-4A5 5 0 0 0 22 7V4h-4ZM4 7V6h2v3.8A3 3 0 0 1 4 7Zm16 0a3 3 0 0 1-2 2.8V6h2v1Z" />
    </svg>
  );
}

/**
 * Two straps converging behind a ringed disc. The ring rather than a solid circle is what keeps it
 * reading as a medal at 16px — a filled disc on straps looks more like a balloon.
 */
function MedalIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M5 2h3.6l3.4 7.2-3.1 1.4L5 2Z" />
      <path d="M19 2h-3.6L12 9.2l3.1 1.4L19 2Z" />
      <path d="M12 9.5a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm0 2.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6Z" />
    </svg>
  );
}

export function BestEffortsTab({ run }: { run: RunDetail }) {
  const efforts = run.bestEfforts;

  if (efforts.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-500">
        This run doesn&rsquo;t cover a standard distance, so there are no best efforts to show.
      </p>
    );
  }

  return (
    <div>
      <p className="mb-3 text-xs text-gray-500">
        Fastest continuous stretch at each distance within this run — not just the opening kilometres.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <th className="py-2 pr-3 font-medium">Distance</th>
              <th className="py-2 pr-3 text-right font-medium">Time</th>
              <th className="py-2 pr-3 text-right font-medium">Pace</th>
              <th className="py-2 text-right font-medium">Started at</th>
            </tr>
          </thead>
          <tbody>
            {efforts.map((effort) => (
              <tr
                key={effort.distanceM}
                className={`border-b border-gray-100 last:border-0 ${effort.isCurrentBest ? "bg-amber-50" : ""}`}
              >
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-gray-900">{effort.label}</span>
                    {effort.isCurrentBest && (
                      // Still holds the record today.
                      <span className="text-amber-500" title="Still your fastest at this distance">
                        <TrophyIcon />
                        <span className="sr-only">Current record</span>
                      </span>
                    )}
                    {effort.isPr && (
                      // Beat everything that came before it on the day. Independent of the trophy:
                      // most of these have since been beaten, which is exactly what the two marks
                      // together are there to distinguish.
                      <span className="text-purple-500" title="Was a personal best when you set it">
                        <MedalIcon />
                        <span className="sr-only">Personal best when set</span>
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums font-semibold text-gray-900">
                  {formatDuration(effort.durationSec)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-gray-600">
                  {formatMinSec((effort.durationSec / effort.distanceM) * 1000)} /km
                </td>
                <td className="py-2 text-right tabular-nums text-gray-500">
                  {(effort.startOffsetM / 1000).toFixed(2)} km
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The two marks answer different questions, and a row can carry both — a current record was
          necessarily also a best when it was set. Spelling that out beats leaving it to be inferred. */}
      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 border-t border-gray-100 pt-3 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <dt className="text-amber-500">
            <TrophyIcon className="h-3.5 w-3.5" />
          </dt>
          <dd>Still your fastest at this distance</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="text-purple-500">
            <MedalIcon className="h-3.5 w-3.5" />
          </dt>
          <dd>Was a personal best when you set it</dd>
        </div>
      </dl>
    </div>
  );
}
