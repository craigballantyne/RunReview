import type { RawPointFlags, Split } from "@run-review/shared";
import { describe, expect, it } from "vitest";
import { computeLayer2Tags, type Layer2TagInput } from "../../src/modules/analysis/layer2-tags.js";
import { classifySegmentRoles } from "../../src/modules/analysis/segment-roles.js";
import { genericEasyRunLaps, rolling300sLaps, tempoIntervalLaps } from "../fixtures/reference-laps.js";

const NO_FLAGS: RawPointFlags = { walkBreaks: [], withinLapDrift: [] };

function lap(splitIndex: number, distanceM: number, durationSec: number, avgHr: number | null, elevationGainM: number | null = 0): Split {
  return {
    id: `lap-${splitIndex}`,
    splitIndex,
    startTimeGmt: new Date(Date.UTC(2026, 1, 1, 0, 0, splitIndex)).toISOString(),
    distanceM,
    durationSec,
    avgSpeedMps: distanceM / durationSec,
    avgHr,
    maxHr: avgHr,
    avgCadenceSpm: null,
    elevationGainM,
    elevationLossM: null,
  };
}

function tagsFor(splits: Split[], lapMode: "auto" | "structured", overrides: Partial<Layer2TagInput> = {}) {
  return computeLayer2Tags({
    segments: classifySegmentRoles(splits, lapMode),
    splits,
    rawPointFlags: NO_FLAGS,
    ...overrides,
  });
}

describe("workoutStructure", () => {
  it("reads a rep session with regular recoveries as intervals", () => {
    expect(tagsFor(tempoIntervalLaps, "structured").workoutStructure).toBe("intervals");
    expect(tagsFor(rolling300sLaps, "structured").workoutStructure).toBe("intervals");
  });

  it("reads a continuous run with flat pace as steady", () => {
    expect(tagsFor(genericEasyRunLaps, "auto").workoutStructure).toBe("steady");
  });

  it("never produces easy, which needs a baseline rather than within-run data", () => {
    // A run set out as easy but executed at tempo effort is `steady`, not `easy` — the tag records
    // what happened. The HR-zone proxy this replaced produced `easy` on 1 run in 332.
    for (const fixture of [genericEasyRunLaps, tempoIntervalLaps, rolling300sLaps]) {
      expect(tagsFor(fixture, "auto").workoutStructure).not.toBe("easy");
    }
  });

  it("reads a monotonic speed-up as a progression", () => {
    const laps = [420, 405, 392, 378, 363, 350, 338].map((sec, i) => lap(i + 1, 1000, sec, 150));
    expect(tagsFor([...laps, lap(8, 300, 100, 155)], "auto").workoutStructure).toBe("progression");
  });

  it("does not call a noisy easy run a progression", () => {
    // Ends faster than it started, but wanders getting there.
    const laps = [400, 380, 410, 385, 405, 375, 390].map((sec, i) => lap(i + 1, 1000, sec, 150));
    expect(tagsFor([...laps, lap(8, 300, 118, 150)], "auto").workoutStructure).not.toBe("progression");
  });

  it("reads hard efforts run back to back as fartlek rather than intervals", () => {
    // Three contiguous reps with nothing between them. Kept to a minority of the session
    // deliberately: reps are found by margin from the session median, so a fixture that is mostly
    // reps drags the median in among them and finds none at all.
    const laps = [
      lap(1, 1000, 400, 142),
      lap(2, 1000, 400, 143),
      lap(3, 1000, 300, 170),
      lap(4, 1000, 302, 171),
      lap(5, 1000, 298, 172),
      lap(6, 1000, 400, 145),
      lap(7, 1000, 400, 144),
      lap(8, 300, 120, 142),
    ];
    expect(tagsFor(laps, "structured").workoutStructure).toBe("fartlek");
  });

  it("reads a single hard effort inside a continuous run as mixed", () => {
    const laps = [
      lap(1, 1000, 400, 145),
      lap(2, 1000, 398, 146),
      lap(3, 1000, 320, 168),
      lap(4, 1000, 402, 147),
      lap(5, 1000, 399, 146),
      lap(6, 300, 120, 145),
    ];
    expect(tagsFor(laps, "structured").workoutStructure).toBe("mixed");
  });

  it("only ever reports shapes it can observe", () => {
    // Race-ness is context rather than a shape, and lives on the parsed intent instead.
    const observable = ["steady", "intervals", "progression", "fartlek", "mixed", "unclear"];
    for (const fixture of [genericEasyRunLaps, tempoIntervalLaps, rolling300sLaps]) {
      expect(observable).toContain(tagsFor(fixture, "structured").workoutStructure);
    }
  });

  it("returns unclear with no segments at all", () => {
    expect(tagsFor([], "auto").workoutStructure).toBe("unclear");
  });
});

describe("warmupCooldownDetected and walkBreakPattern", () => {
  it("reports warmup and cooldown from segment roles", () => {
    expect(tagsFor(tempoIntervalLaps, "structured").warmupCooldownDetected).toBe(true);
    expect(tagsFor(genericEasyRunLaps, "auto").warmupCooldownDetected).toBe(false);
  });

  it("flags repeated sustained walking as a pattern", () => {
    const withBreaks = tagsFor(genericEasyRunLaps, "auto", {
      rawPointFlags: {
        walkBreaks: [
          { startKm: 4.2, durationSec: 45 },
          { startKm: 7.1, durationSec: 38 },
        ],
        withinLapDrift: [],
      },
    });
    expect(withBreaks.walkBreakPattern).toBe(true);
  });

  it("does not treat a single stop at a crossing as a pattern", () => {
    // Layer 1 records any stop over 10s as evidence; 61% of real runs contain one, so the tag
    // needs repetition or it reports urban geography rather than a training behaviour.
    const oneStop = tagsFor(genericEasyRunLaps, "auto", {
      rawPointFlags: { walkBreaks: [{ startKm: 4.2, durationSec: 45 }], withinLapDrift: [] },
    });
    expect(oneStop.walkBreakPattern).toBe(false);
    expect(tagsFor(genericEasyRunLaps, "auto").walkBreakPattern).toBe(false);
  });

  it("counts one very long stop on its own", () => {
    const longStop = tagsFor(genericEasyRunLaps, "auto", {
      rawPointFlags: { walkBreaks: [{ startKm: 4.2, durationSec: 180 }], withinLapDrift: [] },
    });
    expect(longStop.walkBreakPattern).toBe(true);
  });
});

describe("effortPaceMismatch", () => {
  it("flags slowing while HR holds as hr_high_pace_low", () => {
    const laps = [
      lap(1, 1000, 330, 150),
      lap(2, 1000, 332, 151),
      lap(3, 1000, 335, 152),
      lap(4, 1000, 380, 160),
      lap(5, 1000, 390, 162),
      lap(6, 1000, 400, 164),
      lap(7, 300, 118, 163),
    ];
    const tags = tagsFor(laps, "auto");
    expect(tags.effortPaceMismatch).toBe("hr_high_pace_low");
    expect(tags.evidence.effortPaceMismatch!.secondHalfHrBpm).toBeGreaterThan(
      tags.evidence.effortPaceMismatch!.firstHalfHrBpm,
    );
  });

  it("flags speeding up while HR falls as hr_low_pace_high", () => {
    const laps = [
      lap(1, 1000, 380, 158),
      lap(2, 1000, 378, 157),
      lap(3, 1000, 376, 156),
      lap(4, 1000, 340, 148),
      lap(5, 1000, 336, 147),
      lap(6, 1000, 334, 146),
      lap(7, 300, 102, 147),
    ];
    expect(tagsFor(laps, "auto").effortPaceMismatch).toBe("hr_low_pace_high");
  });

  it("reports consistent when the two move together", () => {
    expect(tagsFor(genericEasyRunLaps, "auto").effortPaceMismatch).toBe("consistent");
  });

  it("returns not_applicable without HR data", () => {
    const noHr = genericEasyRunLaps.map((l) => ({ ...l, avgHr: null }));
    expect(tagsFor(noHr, "auto").effortPaceMismatch).toBe("not_applicable");
  });
});

describe("fadeDetected", () => {
  const fadingLaps = [
    lap(1, 1000, 330, 150),
    lap(2, 1000, 332, 151),
    lap(3, 1000, 334, 152),
    lap(4, 1000, 336, 153),
    lap(5, 1000, 395, 156, 40),
    lap(6, 1000, 405, 157, 45),
    lap(7, 300, 125, 155, 5),
  ];

  it("flags a run whose closing portion slows meaningfully", () => {
    expect(tagsFor(fadingLaps, "auto").fadeDetected).toBe(true);
  });

  it("attaches the climb inside the fading portion rather than suppressing the flag", () => {
    // Layer 2 reports the signal and the conditions; Layer 3 decides whether the hill excuses it.
    const { evidence } = tagsFor(fadingLaps, "auto");
    expect(evidence.fade!.elevationGainM).toBeGreaterThan(0);
    expect(evidence.fade!.paceDriftSecPerKm).toBeGreaterThan(0);
  });

  it("does not flag a steady run", () => {
    expect(tagsFor(genericEasyRunLaps, "auto").fadeDetected).toBe(false);
  });

  it("does not mistake a programmed cooldown for a fade", () => {
    // Every structured session ends slow by design; counting the cooldown would flag them all.
    expect(tagsFor(tempoIntervalLaps, "structured").fadeDetected).toBe(false);
  });
});

describe("surgePattern", () => {
  it("flags an unplanned pickup in an otherwise steady run", () => {
    const laps = [
      lap(1, 1000, 400, 148),
      lap(2, 1000, 398, 149),
      lap(3, 1000, 340, 165),
      lap(4, 1000, 402, 150),
      lap(5, 1000, 399, 149),
      lap(6, 300, 120, 148),
    ];
    const tags = tagsFor(laps, "auto");
    expect(tags.surgePattern).toBe(true);
    expect(tags.evidence.surge!.count).toBe(1);
  });

  it("stays silent on a structured session, where the fast segments are the point", () => {
    expect(tagsFor(tempoIntervalLaps, "structured").surgePattern).toBe(false);
    expect(tagsFor(rolling300sLaps, "structured").surgePattern).toBe(false);
  });

  it("does not flag ordinary pace variation", () => {
    expect(tagsFor(genericEasyRunLaps, "auto").surgePattern).toBe(false);
  });
});

describe("evenEffortDespiteTerrain", () => {
  it("flags pace tracking the hills while HR stays flat", () => {
    const laps = [
      lap(1, 1000, 330, 151, 2),
      lap(2, 1000, 420, 152, 60),
      lap(3, 1000, 325, 150, 3),
      lap(4, 1000, 430, 153, 70),
      lap(5, 1000, 328, 151, 2),
      lap(6, 1000, 425, 152, 65),
      lap(7, 300, 100, 151, 1),
    ];
    const tags = tagsFor(laps, "auto");
    expect(tags.evenEffortDespiteTerrain).toBe(true);
    expect(tags.evidence.evenEffortDespiteTerrain!.paceElevationCorrelation).toBeGreaterThan(0.5);
  });

  it("does not flag when HR swings with the pace", () => {
    // Effort was not even — the athlete pushed the climbs.
    const laps = [
      lap(1, 1000, 330, 140, 2),
      lap(2, 1000, 420, 172, 60),
      lap(3, 1000, 325, 139, 3),
      lap(4, 1000, 430, 175, 70),
      lap(5, 1000, 328, 141, 2),
      lap(6, 1000, 425, 173, 65),
      lap(7, 300, 100, 150, 1),
    ];
    expect(tagsFor(laps, "auto").evenEffortDespiteTerrain).toBe(false);
  });

  it("does not flag a flat run", () => {
    expect(tagsFor(genericEasyRunLaps, "auto").evenEffortDespiteTerrain).toBe(false);
  });

  it("needs elevation data", () => {
    const noElevation = genericEasyRunLaps.map((l) => ({ ...l, elevationGainM: null }));
    expect(tagsFor(noElevation, "auto").evenEffortDespiteTerrain).toBe(false);
  });
});

describe("evidence", () => {
  it("carries no entry for a flag that did not fire", () => {
    // An empty field would invite Layer 3 to comment on its absence.
    const { evidence } = tagsFor(genericEasyRunLaps, "auto");
    expect(evidence.fade).toBeUndefined();
    expect(evidence.surge).toBeUndefined();
    expect(evidence.evenEffortDespiteTerrain).toBeUndefined();
  });
});
