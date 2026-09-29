import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { RunBestEffort, RunDetail, RunInsight, SegmentClassification, Split } from "@run-review/shared";
import { SegmentsTab } from "./SegmentsTab.js";
import { BestEffortsTab } from "./BestEffortsTab.js";

function segment(splitIndex: number, role: SegmentClassification["role"], paceSecPerKm: number, avgHr: number | null = 150): SegmentClassification {
  return { splitIndex, role, distanceM: 1000, durationSec: paceSecPerKm, paceSecPerKm, avgHr };
}

function split(splitIndex: number, distanceM: number, durationSec: number): Split {
  return {
    id: `s${splitIndex}`,
    splitIndex,
    startTimeGmt: "2026-02-13T20:14:12.000Z",
    distanceM,
    durationSec,
    avgSpeedMps: distanceM / durationSec,
    avgHr: 150,
    maxHr: 160,
    avgCadenceSpm: null,
    elevationGainM: null,
    elevationLossM: null,
  };
}

function runWith(overrides: Partial<RunDetail>): RunDetail {
  return {
    id: "run-1",
    activityName: "Test run",
    activityType: "running",
    startTimeLocal: "2026-02-13T20:14:12.0",
    startTimeGmt: "2026-02-13T20:14:12.000Z",
    externalActivityId: "1",
    location: null,
    distanceM: 9160,
    durationSec: 3600,
    movingDurationSec: 3600,
    avgSpeedMps: null,
    maxSpeedMps: null,
    avgHr: null,
    maxHr: null,
    avgCadenceSpm: null,
    maxCadenceSpm: null,
    elevationGainM: null,
    elevationLossM: null,
    calories: null,
    startLatitude: null,
    startLongitude: null,
    weather: null,
    splits: [],
    hrZones: [],
    trackPoints: [],
    insight: null,
    bestEfforts: [],
    ...overrides,
  };
}

const intervalInsight: RunInsight = {
  workoutStructure: "intervals",
  lapMode: "structured",
  segments: [segment(1, "warmup", 384), segment(2, "rep", 280), segment(3, "float", 339), segment(4, "cooldown", 400)],
};

describe("SegmentsTab", () => {
  it("labels each lap with its role", () => {
    render(<SegmentsTab run={runWith({ insight: intervalInsight })} />);

    expect(screen.getByText("Warm-up")).toBeInTheDocument();
    expect(screen.getByText("Rep")).toBeInTheDocument();
    expect(screen.getByText("Float")).toBeInTheDocument();
    expect(screen.getByText("Cool-down")).toBeInTheDocument();
  });

  it("shows the session type", () => {
    render(<SegmentsTab run={runWith({ insight: intervalInsight })} />);
    expect(screen.getByText("Interval session")).toBeInTheDocument();
  });

  it("falls back to raw splits when a run has not been analysed", () => {
    // Without roles, but with the same table rather than an empty tab.
    render(<SegmentsTab run={runWith({ insight: null, splits: [split(1, 1000, 330), split(2, 1000, 340)] })} />);

    expect(screen.getByText("5:30 /km")).toBeInTheDocument();
    expect(screen.queryByText("Rep")).not.toBeInTheDocument();
  });

  it("reports when a run has no lap data at all", () => {
    render(<SegmentsTab run={runWith({})} />);
    expect(screen.getByText(/No lap data recorded/)).toBeInTheDocument();
  });

  it("does not render a non-finite pace for a zero-distance lap", () => {
    // What `classifySegmentRoles` actually emits for a zero-distance lap: a real duration, but an
    // infinite pace. Rendering that raw would put "Infinity /km" in the table.
    const broken: RunInsight = {
      ...intervalInsight,
      segments: [{ splitIndex: 1, role: "steady", distanceM: 0, durationSec: 5, paceSecPerKm: Number.POSITIVE_INFINITY, avgHr: 150 }],
    };
    render(<SegmentsTab run={runWith({ insight: broken })} />);

    expect(screen.queryByText(/Infinity|NaN/)).not.toBeInTheDocument();
    expect(screen.getByText("–")).toBeInTheDocument();
  });
});

function effort(label: string, distanceM: number, durationSec: number, isPr: boolean, isCurrentBest: boolean): RunBestEffort {
  return { distanceM, label, durationSec, startOffsetM: 0, isPr, isCurrentBest };
}

describe("BestEffortsTab", () => {
  it("lists each distance the run covered", () => {
    render(
      <BestEffortsTab
        run={runWith({ bestEfforts: [effort("1 km", 1000, 240, false, false), effort("5 km", 5000, 1305, true, true)] })}
      />,
    );

    expect(screen.getByText("1 km")).toBeInTheDocument();
    expect(screen.getByText("5 km")).toBeInTheDocument();
  });

  it("awards a trophy only to a distance the run still holds", () => {
    // 82 of this athlete's 93 point-in-time PRs have since been beaten, so keying the trophy off
    // `isPr` would badge efforts that are no longer records.
    render(
      <BestEffortsTab
        run={runWith({
          bestEfforts: [effort("1 km", 1000, 240, true, false), effort("5 km", 5000, 1305, true, true)],
        })}
      />,
    );

    const rows = screen.getAllByRole("row");
    const kmRow = rows.find((r) => within(r).queryByText("1 km"))!;
    const fiveKmRow = rows.find((r) => within(r).queryByText("5 km"))!;

    expect(within(kmRow).queryByText("Current record")).not.toBeInTheDocument();
    expect(within(fiveKmRow).getByText("Current record")).toBeInTheDocument();
  });

  it("marks an effort that was a best on the day even after it has been beaten", () => {
    render(
      <BestEffortsTab
        run={runWith({
          bestEfforts: [effort("1 km", 1000, 240, true, false), effort("2 km", 2000, 520, false, false)],
        })}
      />,
    );

    const rows = screen.getAllByRole("row");
    const kmRow = rows.find((r) => within(r).queryByText("1 km"))!;
    const twoKmRow = rows.find((r) => within(r).queryByText("2 km"))!;

    expect(within(kmRow).getByText("Personal best when set")).toBeInTheDocument();
    expect(within(twoKmRow).queryByText("Personal best when set")).not.toBeInTheDocument();
  });

  it("carries both marks on a record that is still standing", () => {
    // A current record was necessarily also a best when set, so the two are not exclusive.
    render(<BestEffortsTab run={runWith({ bestEfforts: [effort("5 km", 5000, 1305, true, true)] })} />);

    const row = screen.getAllByRole("row").find((r) => within(r).queryByText("5 km"))!;
    expect(within(row).getByText("Current record")).toBeInTheDocument();
    expect(within(row).getByText("Personal best when set")).toBeInTheDocument();
  });

  it("explains both marks in a key below the table", () => {
    render(<BestEffortsTab run={runWith({ bestEfforts: [effort("5 km", 5000, 1305, true, true)] })} />);

    expect(screen.getByText("Still your fastest at this distance")).toBeInTheDocument();
    expect(screen.getByText("Was a personal best when you set it")).toBeInTheDocument();
  });

  it("shows no key when there is nothing to mark", () => {
    render(<BestEffortsTab run={runWith({ bestEfforts: [] })} />);
    expect(screen.queryByText("Still your fastest at this distance")).not.toBeInTheDocument();
  });

  it("derives pace from the effort rather than the whole run", () => {
    // A 5k in 1305s is 4:21/km, regardless of how slow the surrounding run was.
    render(<BestEffortsTab run={runWith({ bestEfforts: [effort("5 km", 5000, 1305, true, true)] })} />);
    expect(screen.getByText("4:21 /km")).toBeInTheDocument();
  });

  it("explains itself when the run covers no standard distance", () => {
    render(<BestEffortsTab run={runWith({ bestEfforts: [] })} />);
    expect(screen.getByText(/doesn’t cover a standard distance/)).toBeInTheDocument();
  });
});
