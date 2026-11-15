import { useFocusEffect } from 'expo-router';
import { useCallback, useSyncExternalStore } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { avatarUrl } from '@/hooks/use-profile';
import { supabase } from '@/lib/supabase';

export type RankKind = 'personal' | 'school';

export type RankRow = {
  id: string;
  rank: number;
  name: string;
  area: number;
  // 개인: 학교 이름, 학교: 라이더 수
  school?: string | null;
  riders?: number;
  photoUri?: string | null;
};

export type Ranking = { total: number; rows: RankRow[]; me: RankRow | null };

type Raw = RankRow & { avatar?: string | null; v?: string };
type RawRanking = { total: number; rows: Raw[]; me: Raw | null };

const LIMIT = 50;

const fromRaw = ({ avatar, v, ...r }: Raw): RankRow => ({
  ...r,
  photoUri: avatar ? avatarUrl(avatar, v ?? '') : null,
});

// 화면끼리 같은 순위를 나눠 씀 (탭을 옮겨도 다시 빈 화면이 되지 않도록)
let cache: { userId: string | null; data: Partial<Record<RankKind, Ranking>> } = { userId: null, data: {} };
const listeners = new Set<() => void>();

async function load(kind: RankKind, userId: string) {
  const { data, error } = await supabase.rpc('ranking', { kind, lim: LIMIT });
  if (error || !data) return;
  const raw = data as RawRanking;
  const next: Ranking = { total: raw.total, rows: raw.rows.map(fromRaw), me: raw.me ? fromRaw(raw.me) : null };
  const base = cache.userId === userId ? cache.data : {};
  cache = { userId, data: { ...base, [kind]: next } };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

// 화면에 들어올 때마다 서버에서 순위를 다시 받음 (받기 전에는 null)
export function useRanking(kind: RankKind) {
  const { userId } = useAuth();
  const snap = useSyncExternalStore(subscribe, () => cache);
  useFocusEffect(
    useCallback(() => {
      if (userId) load(kind, userId);
    }, [kind, userId]),
  );
  return snap.userId === userId ? (snap.data[kind] ?? null) : null;
}
