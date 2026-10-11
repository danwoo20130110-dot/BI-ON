import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

export type LatLng = { latitude: number; longitude: number };

export type RideStats = {
  distanceKm: number;
  elapsedSec: number;
  avgSpeedKmh: number | null;
  maxSpeedKmh: number | null;
  altitude: number | null;
  minAltitude: number | null;
  maxAltitude: number | null;
  // 누적 상승 고도(m)
  elevationGain: number;
};

// 통계 화면 그래프용 시간별 기록
export type RideSample = { t: number; speedKmh: number; altitude: number | null };

// 정확도가 이보다 나쁜(m) 위치는 거리 계산에서 제외
const MAX_ACCURACY_M = 30;
// GPS 튐 방지: 이보다 짧은 이동(m)은 누적하지 않음
const MIN_STEP_M = 3;
// 자전거로 불가능한 속도(GPS 튐)는 최고속력에서 제외
const MAX_SPEED_KMH = 90;
const MIN_GPS_SPEED_MS = 0.5;
// 이 시간(ms) 동안 위치 갱신이 없으면 멈춘 것으로 보고 속도 0
const IDLE_MS = 5000;
// 그래프용 기록 간격(초)
const SAMPLE_EVERY_SEC = 2;
// GPS 고도 흔들림 무시 기준(m)
const ALT_NOISE_M = 2;

const EMPTY_STATS: RideStats = {
  distanceKm: 0,
  elapsedSec: 0,
  avgSpeedKmh: null,
  maxSpeedKmh: null,
  altitude: null,
  minAltitude: null,
  maxAltitude: null,
  elevationGain: 0,
};

function haversineM(a: LatLng, b: LatLng) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function useRideTracker() {
  const [riding, setRiding] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [current, setCurrent] = useState<LatLng | null>(null);
  const [route, setRoute] = useState<LatLng[]>([]);
  const [stats, setStats] = useState<RideStats>(EMPTY_STATS);

  const subRef = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const distanceMRef = useRef(0);
  const lastPointRef = useRef<LatLng | null>(null);
  const lastTimeRef = useRef(0);
  const samplesRef = useRef<RideSample[]>([]);
  const speedRef = useRef({ kmh: 0, at: 0 });
  const altitudeRef = useRef<number | null>(null);
  const altBaseRef = useRef<number | null>(null);

  // 고도 반영: 현재/최고/최저 + 노이즈를 걸러 상승 고도 누적
  const applyAltitude = useCallback((alt: number | null | undefined) => {
    if (alt == null || Number.isNaN(alt)) return;
    altitudeRef.current = alt;
    let gainDelta = 0;
    const base = altBaseRef.current;
    if (base == null) altBaseRef.current = alt;
    else if (alt - base >= ALT_NOISE_M) {
      gainDelta = alt - base;
      altBaseRef.current = alt;
    } else if (base - alt >= ALT_NOISE_M) altBaseRef.current = alt;

    setStats((s) => ({
      ...s,
      altitude: alt,
      minAltitude: s.minAltitude == null ? alt : Math.min(s.minAltitude, alt),
      maxAltitude: s.maxAltitude == null ? alt : Math.max(s.maxAltitude, alt),
      elevationGain: s.elevationGain + gainDelta,
    }));
  }, []);

  const ensurePermission = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === 'granted';
      setPermissionDenied(!granted);
      if (!granted) return false;

      // 휴대폰 위치(GPS) 기능이 꺼져 있으면 켜달라고 요청 (안드로이드는 시스템 팝업)
      if (!(await Location.hasServicesEnabledAsync())) {
        if (Platform.OS !== 'android') return false;
        await Location.enableNetworkProviderAsync();
      }
      return true;
    } catch (e) {
      console.warn('위치 권한 요청 실패', e);
      setPermissionDenied(true);
      return false;
    }
  }, []);

  // 첫 화면에서 지도 중심을 내 위치로
  useEffect(() => {
    (async () => {
      if (!(await ensurePermission())) return;
      // 마지막으로 알려진 위치를 먼저 쓰고, 가능하면 현재 위치로 갱신
      const last = await Location.getLastKnownPositionAsync();
      if (last) setCurrent({ latitude: last.coords.latitude, longitude: last.coords.longitude });
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCurrent({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    })().catch((e) => console.warn('위치 가져오기 실패 (GPS가 켜져 있는지 확인)', e));
  }, [ensurePermission]);

  const stopWatching = () => {
    subRef.current?.remove();
    subRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  useEffect(() => stopWatching, []);

  const start = useCallback(async () => {
    if (!(await ensurePermission())) return false;

    stopWatching();
    startedAtRef.current = Date.now();
    distanceMRef.current = 0;
    lastPointRef.current = null;
    samplesRef.current = [];
    speedRef.current = { kmh: 0, at: 0 };
    altitudeRef.current = null;
    altBaseRef.current = null;
    setRoute([]);
    setStats(EMPTY_STATS);
    setRiding(true);

    // 출발하자마자 고도/위치가 보이도록 현재 위치 한 번 받아옴
    Location.getLastKnownPositionAsync()
      .then((pos) => pos && applyAltitude(pos.coords.altitude))
      .catch(() => {});
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      .then((pos) => {
        applyAltitude(pos.coords.altitude);
        setCurrent((c) => c ?? { latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      })
      .catch(() => {});

    timerRef.current = setInterval(() => {
      const now = Date.now();
      const elapsedSec = Math.floor((now - startedAtRef.current) / 1000);
      setStats((s) => ({
        ...s,
        elapsedSec,
        avgSpeedKmh: elapsedSec > 0 ? distanceMRef.current / 1000 / (elapsedSec / 3600) : 0,
      }));
      if (elapsedSec % SAMPLE_EVERY_SEC === 0) {
        const moving = now - speedRef.current.at < IDLE_MS;
        samplesRef.current.push({
          t: elapsedSec,
          speedKmh: moving ? speedRef.current.kmh : 0,
          altitude: altitudeRef.current,
        });
      }
    }, 1000);

    subRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 2 },
      ({ coords, timestamp }) => {
        const point = { latitude: coords.latitude, longitude: coords.longitude };
        setCurrent(point);
        applyAltitude(coords.altitude);

        if (coords.accuracy != null && coords.accuracy > MAX_ACCURACY_M) return;

        const last = lastPointRef.current;
        if (last) {
          const step = haversineM(last, point);
          if (step < MIN_STEP_M) return;
          distanceMRef.current += step;

          // GPS 속도가 없거나(null) 거의 0인데 실제로 이동했으면 이동 거리 ÷ 시간으로 계산
          const dtSec = (timestamp - lastTimeRef.current) / 1000;
          const gpsKmh =
            coords.speed != null && coords.speed > MIN_GPS_SPEED_MS ? coords.speed * 3.6 : null;
          const speedKmh = gpsKmh ?? (dtSec > 0 ? (step / dtSec) * 3.6 : null);
          if (speedKmh != null && speedKmh < MAX_SPEED_KMH) {
            speedRef.current = { kmh: speedKmh, at: Date.now() };
          }

          setStats((s) => ({
            ...s,
            distanceKm: distanceMRef.current / 1000,
            maxSpeedKmh:
              speedKmh != null && speedKmh < MAX_SPEED_KMH
                ? Math.max(s.maxSpeedKmh ?? 0, speedKmh)
                : s.maxSpeedKmh,
          }));
        }
        lastPointRef.current = point;
        lastTimeRef.current = timestamp;
        setRoute((r) => [...r, point]);
      },
      (reason) => console.warn('위치 추적 에러', reason),
    );
    return true;
  }, [ensurePermission, applyAltitude]);

  const stop = useCallback(() => {
    stopWatching();
    setRiding(false);
  }, []);

  const getSamples = useCallback(() => [...samplesRef.current], []);

  // 종료 시 고도를 아직 못 받았으면 한 번 더 측정
  const measureAltitude = useCallback(async () => {
    if (altitudeRef.current != null) return altitudeRef.current;
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      return pos.coords.altitude ?? null;
    } catch {
      return null;
    }
  }, []);

  return {
    riding,
    permissionDenied,
    current,
    route,
    stats,
    start,
    stop,
    getSamples,
    measureAltitude,
  };
}
