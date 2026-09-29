import type { DistanceCategory } from "../lib/standard-distances.js";

/**
 * Layer 1 analysis vocabulary — see `Project spec/RunAnalysisImplementation.md`.
 *
 * Every field here is deterministic: computed in code from imported run data, never by an LLM.
 * Layers 2 and 3 consume these; they never re-derive them.
 */

/**
 * Whether the device's splits are distance auto-splits or athlete-programmed laps.
 *
 * Not inferable from lap-length variance alone — structured sessions routinely contain 1000m
 * laps alongside their reps, so the test is "does any non-final lap deviate from exactly 1000m",
 * with a pace-alternation fallback for sessions programmed entirely in 1km segments.
 */
export type LapMode = "auto" | "structured";

/** Which stage of lap-mode detection fired. `pace_alternation` is the weaker, inferred signal. */
export type LapModeSource = "lap_length" | "pace_alternation";

/**
 * A lap's role within its session, classified from pace and HR *relative to that session*.
 *
 * Deliberately not inferable from lap geometry: reps and floats are frequently the same distance
 * (a "rolling 300s" session alternates hard and float 300m segments), and recoveries are often
 * time-boxed with variable distance.
 */
export type SegmentRole = "warmup" | "rep" | "float" | "recovery" | "steady" | "cooldown";

/** Distance relative to the athlete's own rolling 90-day median, not fixed cutoffs. */
export type RunTypeByDistance = "short" | "medium" | "long";

/** Device HR zone. Named for the device convention because these *are* the device's zones. */
export type HrZoneLabel = "zone_1" | "zone_2" | "zone_3" | "zone_4" | "zone_5";

/**
 * Pace trend across the run. `not_applicable` on structured sessions — a regression slope through
 * an interval session is noise, and a number here invites Layer 3 to cite it as if it meant
 * something.
 */
export type SplitPattern = "negative_split" | "even_split" | "positive_split" | "not_applicable";

/** Elevation gain per km, against fixed absolute thresholds. */
export type ElevationBucket = "flat" | "rolling" | "hilly";

export type TempBucket = "cold" | "cool" | "mild" | "warm" | "hot";

export type HeatStress = "low" | "moderate" | "high";

/** Time-in-zone distribution as a fraction of total zoned time, keyed by zone. */
export type HrZoneDistribution = Partial<Record<HrZoneLabel, number>>;

export interface SegmentClassification {
  splitIndex: number;
  role: SegmentRole;
  distanceM: number;
  durationSec: number;
  paceSecPerKm: number;
  avgHr: number | null;
}

/** A sustained drop below running pace, located anywhere in the track, independent of laps. */
export interface WalkBreak {
  startKm: number;
  durationSec: number;
}

/** Pace/HR drift inside a single lap, which a lap average would smooth away. */
export interface WithinLapDrift {
  splitIndex: number;
  hrDriftBpm: number | null;
  paceDriftSecPerKm: number;
}

export interface RawPointFlags {
  walkBreaks: WalkBreak[];
  withinLapDrift: WithinLapDrift[];
}

/**
 * Fastest continuous segment matching a standard distance, found anywhere within the run — not
 * only on runs whose total happens to match. Stored whether or not it was a PR, because
 * "21:30 against your 20:45 best" is the baseline material Layer 3 needs.
 */
export interface BestEffort {
  /** Standard distance in metres (1000, 1609, 5000, ...). */
  distanceM: number;
  durationSec: number;
  /** Where in the run the effort started, in metres from the start. */
  startOffsetM: number;
}

/**
 * Shape the session actually took, derived entirely from the run's own data.
 *
 * This describes what happened, never what was planned. A run set out as easy but executed at
 * tempo effort is `steady`, not `easy` — the gap between the two is the interesting part, and
 * Layer 3 reports it by comparing this against `ParsedIntent`.
 *
 * `easy` is therefore not produced here at all: separating easy from steady needs to know what
 * easy *is* for this athlete, which is a baseline question rather than a within-run one. It waits
 * for Layer 3.
 *
 * Race-ness is not a shape and lives on `ParsedIntent.isRace` instead — a race can be run as a
 * steady effort or as a progression, and those are the structures worth recording.
 */
export type WorkoutStructure = "easy" | "steady" | "intervals" | "progression" | "fartlek" | "mixed" | "unclear";

/** Effort level a workout title says was planned. */
export type PlannedIntensity = "easy" | "moderate" | "hard" | "unclear";

/**
 * What the athlete set out to do, read from the activity title alone.
 *
 * Kept strictly separate from the observed tags and never reconciled against them. Recording the
 * plan faithfully — including when it plainly wasn't executed — is what lets Layer 3 say "you
 * pushed too hard on this easy run" rather than silently relabelling the run.
 */
export interface ParsedIntent {
  /** The workout as the title describes it. Null when the title names no workout. */
  statedWorkout: string | null;
  plannedStructure: WorkoutStructure | null;
  plannedIntensity: PlannedIntensity | null;
  /** Training-plan week where the title encodes one ("W3 Fri Tempo" is 3). */
  planWeek: number | null;
  /** True only for an actual event, not a hard training effort described as a time trial. */
  isRace: boolean;
}

/**
 * Relationship between cardiac cost and pace produced, measured within this run only — never
 * against history, which is Layer 3's job. `not_applicable` when HR data isn't usable.
 */
export type EffortPaceMismatch = "hr_high_pace_low" | "hr_low_pace_high" | "consistent" | "not_applicable";

/**
 * Numbers behind whichever flags fired, carried forward so Layer 3 can cite specifics rather than
 * asserting that something "faded". A flag that didn't fire has no entry.
 *
 * This is the "flag in 2, explain in 3" split: Layer 2 reports the raw signal and the conditions
 * that coincided with it, and makes no attempt to decide whether terrain or weather excuses it.
 */
export interface Layer2Evidence {
  fade?: {
    paceDriftSecPerKm: number;
    hrDriftBpm: number | null;
    /** Climb within the fading portion — the most common innocent explanation. */
    elevationGainM: number | null;
  };
  surge?: {
    count: number;
    fastestPaceSecPerKm: number;
    medianPaceSecPerKm: number;
  };
  effortPaceMismatch?: {
    firstHalfPaceSecPerKm: number;
    secondHalfPaceSecPerKm: number;
    firstHalfHrBpm: number;
    secondHalfHrBpm: number;
  };
  evenEffortDespiteTerrain?: {
    paceElevationCorrelation: number;
    hrCoefficientOfVariation: number;
  };
}

export interface Layer2Tags {
  workoutStructure: WorkoutStructure;
  warmupCooldownDetected: boolean;
  walkBreakPattern: boolean;
  effortPaceMismatch: EffortPaceMismatch;
  fadeDetected: boolean;
  surgePattern: boolean;
  evenEffortDespiteTerrain: boolean;
  evidence: Layer2Evidence;
}

export interface WeatherFlags {
  tempBucket: TempBucket | null;
  /**
   * Temperature-gated deliberately. Humidity only impairs thermoregulation when it's warm enough
   * for evaporative cooling to be the limiting factor; an ungated threshold fires on the majority
   * of runs in a cold, damp climate and carries no information.
   */
  humidityFlag: boolean;
  windFlag: boolean;
  heatStress: HeatStress | null;
}

/** One of an athlete's fastest efforts at a standard distance, for the records page. */
export interface DistanceRecordEntry {
  runId: string;
  activityName: string;
  durationSec: number;
  /** Local time, so the date shown matches the day the athlete actually ran. */
  startTimeLocal: string;
}

export interface DistanceRecord {
  distanceM: number;
  label: string;
  category: DistanceCategory;
  /** Fastest first, at most three. Distances the athlete has never covered are omitted entirely. */
  entries: DistanceRecordEntry[];
}
