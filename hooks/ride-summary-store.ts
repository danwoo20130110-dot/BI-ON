import type { LatLng, RideSample, RideStats } from './use-ride-tracker';

export type RideSummary = {
  startedAt: number;
  endedAt: number;
  stats: RideStats;
  route: LatLng[];
  samples: RideSample[];
  // 경로가 없을 때 지도 중심으로 쓸 마지막 위치
  lastLocation: LatLng | null;
  startAddress: string | null;
  endAddress: string | null;
};

// 경로 배열이 길어서 라우터 파라미터 대신 메모리에 잠시 보관
let lastSummary: RideSummary | null = null;

export function setLastRideSummary(summary: RideSummary) {
  lastSummary = summary;
}

export function getLastRideSummary() {
  return lastSummary;
}
