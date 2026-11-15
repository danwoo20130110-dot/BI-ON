import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useSyncExternalStore } from 'react';

import { getUserId, useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';

import type { LatLng } from './use-ride-tracker';

// 로그인 전에 기기에만 저장하던 기록 (첫 로그인 계정으로 한 번 옮김)
const LEGACY_KEY = 'bion.myRides';
// 아직 서버에 못 올린 기록 (인터넷이 없을 때 등)
const PENDING_KEY = 'bion.pendingRides';
const MAX_RIDES = 200;
const MAX_POINTS = 400;

// 땅을 눌렀을 때 보여줄 라이딩 기록
export type RideStat = {
  at: number;
  km: number;
  sec: number;
  avg: number;
  max: number;
  gain: number;
  // 1km 구간별 걸린 시간(초)과 마지막 1km 미만 구간
  splits?: number[];
  last?: { km: number; sec: number } | null;
};

export type MyRide = { at: number; pts: [number, number][]; stat?: RideStat };

type Pending = MyRide & { userId: string };

type Row = {
  started_at: string;
  distance_km: number;
  duration_sec: number;
  avg_kmh: number;
  max_kmh: number;
  elevation_gain: number;
  splits: number[];
  last_split: { km: number; sec: number } | null;
  points: [number, number][];
};

const COLUMNS = 'started_at, distance_km, duration_sec, avg_kmh, max_kmh, elevation_gain, splits, last_split, points';

function fromRow(r: Row): MyRide {
  const at = new Date(r.started_at).getTime();
  return {
    at,
    pts: r.points,
    stat: {
      at,
      km: r.distance_km,
      sec: r.duration_sec,
      avg: r.avg_kmh,
      max: r.max_kmh,
      gain: r.elevation_gain,
      splits: r.splits,
      last: r.last_split,
    },
  };
}

function toRow(r: MyRide) {
  const s = r.stat;
  return {
    started_at: new Date(r.at).toISOString(),
    distance_km: s?.km ?? 0,
    duration_sec: Math.round(s?.sec ?? 0),
    avg_kmh: s?.avg ?? 0,
    max_kmh: s?.max ?? 0,
    elevation_gain: s?.gain ?? 0,
    splits: s?.splits ?? [],
    last_split: s?.last ?? null,
    points: r.pts,
  };
}

async function readList<T>(key: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// 서버 기록 + 아직 못 올린 기록, 오래된 순
let cache: { userId: string | null; rides: MyRide[] } = { userId: null, rides: [] };
const listeners = new Set<() => void>();

function publish(userId: string, server: MyRide[], pending: Pending[]) {
  const seen = new Set(server.map((r) => r.at));
  const local = pending.filter((p) => p.userId === userId && !seen.has(p.at)).map(({ userId: _, ...r }) => r);
  cache = { userId, rides: [...server, ...local].sort((a, b) => a.at - b.at) };
  listeners.forEach((l) => l());
}

// 예전 기기 기록을 지금 계정의 올릴 목록으로 옮김
async function adoptLegacy(userId: string) {
  const legacy = await readList<MyRide>(LEGACY_KEY);
  if (!legacy.length) return;
  const pending = await readList<Pending>(PENDING_KEY);
  const known = new Set(pending.map((p) => p.at));
  const moved = legacy
    .filter((r) => r.pts?.length >= 2 && !known.has(r.stat?.at ?? r.at))
    .map((r) => ({ ...r, at: r.stat?.at ?? r.at, userId }));
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify([...pending, ...moved]));
  await AsyncStorage.removeItem(LEGACY_KEY);
}

let flushing: Promise<void> | null = null;

// 못 올린 기록을 서버로 보냄 (같은 기록은 서버에서 한 번만 저장됨)
function flushPending(userId: string) {
  flushing ??= (async () => {
    try {
      const pending = await readList<Pending>(PENDING_KEY);
      const mine = pending.filter((p) => p.userId === userId);
      if (!mine.length) return;
      const sent = new Set<number>();
      for (const p of mine) {
        const { error } = await supabase
          .from('rides')
          .upsert(toRow(p), { onConflict: 'user_id,started_at', ignoreDuplicates: true });
        // 인터넷 문제면 다음에 다시 시도, 서버가 거절한 기록(잘못된 값·권한 없음)은 버림
        if (!error || /^(22|23|42)/.test(error.code ?? '')) sent.add(p.at);
        else if (!error.code) break;
      }
      if (!sent.size) return;
      const latest = await readList<Pending>(PENDING_KEY);
      await AsyncStorage.setItem(
        PENDING_KEY,
        JSON.stringify(latest.filter((p) => p.userId !== userId || !sent.has(p.at))),
      );
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

export async function refreshMyRides() {
  const userId = getUserId();
  if (!userId) return [];
  await adoptLegacy(userId);
  await flushPending(userId);
  const { data, error } = await supabase
    .from('rides')
    .select(COLUMNS)
    .order('started_at', { ascending: false })
    .limit(MAX_RIDES);
  const pending = await readList<Pending>(PENDING_KEY);
  // 서버를 못 읽으면 이전에 받아 둔 기록을 그대로 보여 줌
  const server = error ? (cache.userId === userId ? cache.rides : []) : (data as Row[]).map(fromRow).reverse();
  if (getUserId() === userId) publish(userId, server, pending);
  return cache.rides;
}

export async function getMyRides(): Promise<MyRide[]> {
  return refreshMyRides();
}

export async function saveMyRide(route: LatLng[], stat?: RideStat) {
  const userId = getUserId();
  if (!userId || route.length < 2) return;
  const step = Math.ceil(route.length / MAX_POINTS);
  const pts = route
    .filter((_, i) => i % step === 0 || i === route.length - 1)
    .map((p) => [Math.round(p.latitude * 1e5) / 1e5, Math.round(p.longitude * 1e5) / 1e5] as [number, number]);
  const ride: MyRide = { at: stat?.at ?? Date.now(), pts, stat };
  // 먼저 기기에 남겨 두고 올림 → 인터넷이 끊겨도 기록이 사라지지 않음
  const pending = await readList<Pending>(PENDING_KEY);
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify([...pending, { ...ride, userId }]));
  publish(userId, cache.userId === userId ? cache.rides : [], [{ ...ride, userId }]);
  // 요약 화면이 늦게 뜨지 않도록 업로드는 기다리지 않음
  refreshMyRides().catch(() => {});
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

// 화면에 들어올 때마다 서버에서 내 라이딩을 다시 읽음
export function useMyRides() {
  const { userId } = useAuth();
  const snap = useSyncExternalStore(subscribe, () => cache);
  useFocusEffect(
    useCallback(() => {
      if (userId) refreshMyRides();
    }, [userId]),
  );
  return snap.userId === userId ? snap.rides : [];
}

export function weekKm(rides: MyRide[]) {
  const from = Date.now() - 7 * 86400000;
  return rides.filter((r) => r.stat && r.stat.at >= from).reduce((a, r) => a + (r.stat?.km ?? 0), 0);
}
