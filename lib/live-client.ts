import type { RealtimeChannel } from '@supabase/supabase-js';

import { getUserId } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';

// 실시간 라이딩: 위치는 서버 함수로 보내고, 서버가 판정한 끊기·위치는 내 근처 칸의 Realtime 채널로 받음
export type LiveEvent =
  | { type: 'snapshot'; riders: { id: string; name: string; trail: [number, number][] }[] }
  | { type: 'end'; id: string }
  | { type: 'pos'; id: string; name: string; lat: number; lng: number }
  | { type: 'cut'; victim: string; victimName: string; by: string; byName: string };

const RECONNECT_MS = 3000;
// 한 번에 서버로 보내는 위치 수
const MAX_BATCH = 50;
// 서버의 칸 크기(약 5km)와 같아야 함
const CELL_DEG = 0.05;

let channel: RealtimeChannel | null = null;
let position: { lat: number; lng: number } | null = null;
let cell: string | null = null;
let open = false;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(e: LiveEvent) => void>();
const statusListeners = new Set<(online: boolean) => void>();

function emit(e: LiveEvent) {
  listeners.forEach((l) => l(e));
}

function setOpen(v: boolean) {
  open = v;
  statusListeners.forEach((l) => l(v));
}

function retry() {
  if (timer || !listeners.size) return;
  timer = setTimeout(() => {
    timer = null;
    connect();
  }, RECONNECT_MS);
}

const cellOf = (lat: number, lng: number) => `${Math.floor(lng / CELL_DEG)}:${Math.floor(lat / CELL_DEG)}`;

async function connect() {
  if (!position || !getUserId() || !listeners.size) return;
  const { lat, lng } = position;
  const next = cellOf(lat, lng);
  if (next === cell) return;
  cell = next;

  // 내 칸을 서버에 등록해야 그 칸의 채널을 받을 수 있음
  const { data, error } = await supabase.rpc('live_watch', { lat, lng });
  if (error || !data) {
    cell = null;
    retry();
    return;
  }
  const old = channel;
  channel = null;
  if (old) supabase.removeChannel(old);
  await supabase.realtime.setAuth();
  const ch = supabase.channel(data.topic, { config: { private: true } });
  channel = ch;
  ch.on('broadcast', { event: '*' }, ({ event, payload }) => {
    emit({ type: event, ...payload } as LiveEvent);
  }).subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      setOpen(true);
      // 접속 전부터 근처에서 달리던 사람들의 경로
      emit({ type: 'snapshot', riders: data.riders });
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      setOpen(false);
      if (channel === ch) {
        channel = null;
        cell = null;
        supabase.removeChannel(ch);
        retry();
      }
    }
  });
}

function disconnect() {
  if (timer) clearTimeout(timer);
  timer = null;
  const ch = channel;
  channel = null;
  cell = null;
  setOpen(false);
  if (ch) supabase.removeChannel(ch);
}

// 로그인 계정이 바뀌면 새 계정으로 다시 연결
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') disconnect();
  else if (event === 'SIGNED_IN' && listeners.size) {
    disconnect();
    connect();
  }
});

export function subscribeLive(onEvent: (e: LiveEvent) => void, onStatus?: (online: boolean) => void) {
  listeners.add(onEvent);
  if (onStatus) {
    statusListeners.add(onStatus);
    onStatus(open);
  }
  connect();
  return () => {
    listeners.delete(onEvent);
    if (onStatus) statusListeners.delete(onStatus);
    if (!listeners.size) disconnect();
  };
}

export const getLiveId = () => getUserId();

// 위치가 바뀌면 칸이 달라졌을 때만 채널을 옮김
export function liveLocation(lat: number, lng: number) {
  position = { lat, lng };
  connect();
}

// 서버 호출은 보낸 순서대로 하나씩 (시작 → 위치들 → 끝)
let chain: Promise<unknown> = Promise.resolve();
let pending: [number, number][] = [];

function enqueue(job: () => PromiseLike<unknown>) {
  chain = chain.then(job).catch(() => {});
}

export function liveStart() {
  pending = [];
  enqueue(() => supabase.rpc('live_start'));
}

export function liveEnd() {
  pending = [];
  enqueue(() => supabase.rpc('live_end'));
}

export function livePos(lat: number, lng: number) {
  pending.push([lat, lng]);
  // 앞 호출이 끝나기 전에 쌓인 위치는 한 번에 보냄
  if (pending.length > 1) return;
  enqueue(async () => {
    while (pending.length) {
      const points = pending.slice(0, MAX_BATCH);
      // 인터넷이 끊겨 못 보낸 위치는 버림 (실시간 표시용이라 늦게 보낼 필요 없음)
      await supabase.rpc('live_push', { points });
      pending = pending.slice(points.length);
    }
  });
}
