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
