import type { LapMode, SegmentClassification, WorkoutStructure } from "./analysis.js";

export interface RunListItem {
  id: string;
  activityName: string;
  activityType: string;
  startTimeLocal: string;
  location: string | null;
  distanceM: number;
  movingDurationSec: number;
}

export interface RunListPage {
  items: RunListItem[];
  nextCursor: string | null;
}

export interface Split {
  id: string;
  splitIndex: number;
  startTimeGmt: string;
  distanceM: number;
  durationSec: number;
  avgSpeedMps: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgCadenceSpm: number | null;
  elevationGainM: number | null;
  elevationLossM: number | null;
}

export interface HrZone {
  id: string;
  zoneNumber: number;
  zoneLowBpm: number | null;
  zoneHighBpm: number | null;
  secondsInZone: number;
}

export interface TrackPoint {
  id: string;
  pointIndex: number;
  elapsedSec: number;
  latitude: number | null;
  longitude: number | null;
  elevationM: number | null;
  heartRate: number | null;
  speedMps: number | null;
}

export interface RunWeather {
  temperatureC: number | null;
  weatherCode: number | null;
  windSpeedMps: number | null;
  windDirectionDeg: number | null;
}

/**
 * A standard-distance best effort found within this run.
 *
 * `isPr` and `isCurrentBest` are different questions and both are worth having. `isPr` is stored
 * point-in-time — it records whether the effort beat everything that came before it, and never
 * changes. `isCurrentBest` is evaluated against the athlete's whole history at read time, so it
 * answers "is this still my fastest?" — which is what a trophy should mean.
 */
export interface RunBestEffort {
  distanceM: number;
  label: string;
  durationSec: number;
  /** Where the effort began, in metres from the start of the run. */
  startOffsetM: number;
  isPr: boolean;
  isCurrentBest: boolean;
}

/** Analysis output surfaced alongside a run. Null when the run has not been analysed yet. */
export interface RunInsight {
  workoutStructure: WorkoutStructure | null;
  lapMode: LapMode | null;
  /** One entry per lap, in order, with its role within the session. */
  segments: SegmentClassification[];
}

export interface RunDetail extends RunListItem {
  externalActivityId: string;
  startTimeGmt: string;
  durationSec: number;
  avgSpeedMps: number | null;
  maxSpeedMps: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgCadenceSpm: number | null;
  maxCadenceSpm: number | null;
  elevationGainM: number | null;
  elevationLossM: number | null;
  calories: number | null;
  startLatitude: number | null;
  startLongitude: number | null;
  weather: RunWeather | null;
  splits: Split[];
  hrZones: HrZone[];
  trackPoints: TrackPoint[];
  insight: RunInsight | null;
  /** Ascending by distance. Empty when the run covers no standard distance, or is unanalysed. */
  bestEfforts: RunBestEffort[];
}

export interface AccountSummary {
  totalRuns: number;
  lastRunDate: string | null;
}
