export type GpsFix = {
  latitude: number;
  longitude: number;
  // 오차 반경(m), 속도(m/s). 기기가 안 주면 null
  accuracy: number | null;
  speed: number | null;
  time: number;
};

// 이보다 오차가 크면 버림
const MAX_ACCURACY_M = 25;
// 출발점은 더 정확해야 함. 오래 못 잡으면 일반 기준으로 시작
const START_ACCURACY_M = 15;
const START_WAIT_MS = 8000;
// 사람이 낼 수 없는 속도로 튄 점은 버림 (진짜 이동이면 시간이 지나면서 통과됨)
const MAX_MOVE_MS = 15;
// 이만큼 위치가 끊겼다가 돌아오면 이전 위치에 끌려가지 않도록 새로 시작
const GAP_MS = 10000;
const STILL_SPEED_MS = 0.5;
const DEFAULT_ACCURACY_M = 15;
const MIN_MOTION_MS = 6;

const M_PER_LAT = 110570;
const mPerLng = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);

// 튄 점을 버리고, 남은 점은 오차에 따라 부드럽게 이어 줌 (칼만 필터)
export function createGpsFilter() {
  let lat = 0;
  let lng = 0;
  let variance = -1;
  let lastTime = 0;
  let firstTime = 0;

  const accept = (f: GpsFix, accuracy: number) => {
    lat = f.latitude;
    lng = f.longitude;
    variance = accuracy * accuracy;
    lastTime = f.time;
    return { latitude: lat, longitude: lng };
  };

  return {
    reset() {
      variance = -1;
      firstTime = 0;
    },

    // 경로에 넣을 위치를 돌려줌. 버릴 점이면 null
    push(f: GpsFix) {
      const accuracy = f.accuracy ?? DEFAULT_ACCURACY_M;
      if (accuracy > MAX_ACCURACY_M) return null;

      if (variance < 0) {
        firstTime ||= f.time;
        if (accuracy > START_ACCURACY_M && f.time - firstTime < START_WAIT_MS) return null;
        return accept(f, accuracy);
      }

      const dt = (f.time - lastTime) / 1000;
      if (dt <= 0) return null;
      const dist = Math.hypot((f.latitude - lat) * M_PER_LAT, (f.longitude - lng) * mPerLng(lat));
      if (dist / dt > MAX_MOVE_MS) return null;
      // 멈춰 있을 때 오차 범위에서 흔들리는 점
      if (f.speed != null && f.speed < STILL_SPEED_MS && dist < accuracy * 2) return null;
      if (dt * 1000 > GAP_MS) return accept(f, accuracy);

      const motion = Math.max(f.speed ?? 0, MIN_MOTION_MS);
      variance += dt * motion * motion;
      const gain = variance / (variance + accuracy * accuracy);
      lat += gain * (f.latitude - lat);
      lng += gain * (f.longitude - lng);
      variance *= 1 - gain;
      lastTime = f.time;
      return { latitude: lat, longitude: lng };
    },
  };
}
