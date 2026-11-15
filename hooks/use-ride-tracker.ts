import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { watchRideLocation } from '@/lib/background-location';
import { createGpsFilter } from '@/lib/gps-filter';

export type LatLng = { latitude: number; longitude: number };

export type RideStats = {
  distanceKm: number;
  elapsedSec: number;
  avgSpeedKmh: number | null;
  maxSpeedKmh: number | null;
  altitude: number | null;
  minAltitude: number | null;
  maxAltitude: number | null;
  elevationGain: number;
};

export type RideSample = { t: number; speedKmh: number; altitude: number | null };

const MIN_STEP_M = 3;
const MAX_SPEED_KMH = 90;
const MIN_GPS_SPEED_MS = 0.5;
const IDLE_MS = 5000;
const SAMPLE_EVERY_SEC = 2;
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
  const [paused, setPaused] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [current, setCurrent] = useState<LatLng | null>(null);
  const [route, setRoute] = useState<LatLng[]>([]);
  const [stats, setStats] = useState<RideStats>(EMPTY_STATS);

  const subRef = useRef<{ remove: () => void } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  // 일시정지한 시각 (0 이면 달리는 중). 다시 시작하면 멈춘 시간만큼 출발 시각을 뒤로 미룸
  const pausedAtRef = useRef(0);
  const distanceMRef = useRef(0);
  // 1km 를 지날 때마다 출발 후 경과 시간(초)
  const kmMarksRef = useRef<number[]>([]);
  const lastPointRef = useRef<LatLng | null>(null);
  const gpsFilterRef = useRef(createGpsFilter());
  const lastTimeRef = useRef(0);
  const samplesRef = useRef<RideSample[]>([]);
  const speedRef = useRef({ kmh: 0, at: 0 });
  const altitudeRef = useRef<number | null>(null);
  const altBaseRef = useRef<number | null>(null);

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

  useEffect(() => {
    (async () => {
      if (!(await ensurePermission())) return;
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

  const elapsedNow = () => ((pausedAtRef.current || Date.now()) - startedAtRef.current) / 1000;

  const beginTracking = useCallback(async () => {
    timerRef.current = setInterval(() => {
      const now = Date.now();
      const elapsedSec = Math.floor(elapsedNow());
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

    subRef.current = await watchRideLocation(
      ({ coords, timestamp }) => {
        setCurrent({ latitude: coords.latitude, longitude: coords.longitude });
        applyAltitude(coords.altitude);

        // 튄 점은 경로·거리에서 빼고, 남은 점은 부드럽게 이음
        const point = gpsFilterRef.current.push({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          speed: coords.speed,
          time: timestamp,
        });
        if (!point) return;

        const last = lastPointRef.current;
        if (last) {
          const step = haversineM(last, point);
          if (step < MIN_STEP_M) return;
          distanceMRef.current += step;
          const elapsed = elapsedNow();
          while (distanceMRef.current >= (kmMarksRef.current.length + 1) * 1000) {
            kmMarksRef.current.push(elapsed);
          }

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
    if (pausedAtRef.current) stopWatching();
  }, [applyAltitude]);

  const start = useCallback(async () => {
    if (!(await ensurePermission())) return false;

    stopWatching();
    startedAtRef.current = Date.now();
    pausedAtRef.current = 0;
    setPaused(false);
    distanceMRef.current = 0;
    kmMarksRef.current = [];
    lastPointRef.current = null;
    gpsFilterRef.current.reset();
    samplesRef.current = [];
    speedRef.current = { kmh: 0, at: 0 };
    altitudeRef.current = null;
    altBaseRef.current = null;
    setRoute([]);
    setStats(EMPTY_STATS);
    setRiding(true);

    Location.getLastKnownPositionAsync()
      .then((pos) => pos && applyAltitude(pos.coords.altitude))
      .catch(() => {});
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      .then((pos) => {
        applyAltitude(pos.coords.altitude);
        setCurrent((c) => c ?? { latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      })
      .catch(() => {});

    await beginTracking();
    return true;
  }, [ensurePermission, applyAltitude, beginTracking]);

  const pause = useCallback(() => {
    if (pausedAtRef.current) return;
    stopWatching();
    pausedAtRef.current = Date.now();
    setPaused(true);
  }, []);

  const resume = useCallback(async () => {
    if (!pausedAtRef.current) return;
    startedAtRef.current += Date.now() - pausedAtRef.current;
    pausedAtRef.current = 0;
    // 멈춘 동안 이동한 거리는 세지 않음
    lastPointRef.current = null;
    gpsFilterRef.current.reset();
    setPaused(false);
    await beginTracking();
  }, [beginTracking]);

  const stop = useCallback(() => {
    stopWatching();
    setRiding(false);
    setPaused(false);
  }, []);

  const getSamples = useCallback(() => [...samplesRef.current], []);

  // 1km 구간별 걸린 시간(초). 마지막 1km 미만 구간은 따로
  const getSplits = useCallback(() => {
    const marks = kmMarksRef.current;
    const total = elapsedNow();
    const splits = marks.map((t, i) => Math.round(t - (marks[i - 1] ?? 0)));
    const restKm = distanceMRef.current / 1000 - marks.length;
    const last = restKm > 0.05 ? { km: restKm, sec: Math.round(total - (marks[marks.length - 1] ?? 0)) } : null;
    return { splits, last };
  }, []);

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
    paused,
    pause,
    resume,
    permissionDenied,
    current,
    route,
    stats,
    start,
    stop,
    getSamples,
    getSplits,
    measureAltitude,
  };
}
