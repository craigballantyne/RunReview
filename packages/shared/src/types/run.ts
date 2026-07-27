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
}

export interface AccountSummary {
  totalRuns: number;
  lastRunDate: string | null;
}
