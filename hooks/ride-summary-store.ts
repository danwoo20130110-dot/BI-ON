import type { LatLng, RideSample, RideStats } from './use-ride-tracker';

export type RideSummary = {
  startedAt: number;
  endedAt: number;
  stats: RideStats;
  route: LatLng[];
  samples: RideSample[];
  lastLocation: LatLng | null;
  startAddress: string | null;
  endAddress: string | null;
};

let lastSummary: RideSummary | null = null;

export function setLastRideSummary(summary: RideSummary) {
  lastSummary = summary;
}

export function getLastRideSummary() {
  return lastSummary;
}
