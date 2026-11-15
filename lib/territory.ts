import type { LandInfo } from '@/components/land-card';
import { supabase } from '@/lib/supabase';
import { ME_COLOR } from '@/lib/territory-map-html';

export type Bounds = { minLng: number; minLat: number; maxLng: number; maxLat: number };

// 지도에 그릴 땅
export type MapLand = {
  id: string;
  me: boolean;
  mine: boolean;
  color: string;
  schoolColor: string;
  polys: number[][][][];
};

export type Ranked = { name: string; color: string; me: boolean; area: number; count: number };
export type SchoolRanked = {
  name: string;
  color: string;
  mine: boolean;
  area: number;
  riders: number;
  rank?: number;
};
export type TerritoryStats = {
  top: Ranked[];
  myRank: number;
  myArea: number;
  myCount: number;
  players: number;
  schoolTop: SchoolRanked[];
  mySchool: SchoolRanked | null;
  schoolCount: number;
};

// 0.01km² 이상은 km², 그보다 작은 땅(선 라이딩 등)은 m²
export function areaParts(km2: number): [string, string] {
  if (km2 >= 0.01) return [km2.toFixed(2), 'km²'];
  return [Math.round(km2 * 1e6).toLocaleString(), 'm²'];
}

export const formatArea = (km2: number) => areaParts(km2).join('');

function hash(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// 사람·학교마다 항상 같은 색 (내 색인 주황 근처는 피함)
function vivid(key: string, offset: number) {
  let h = (hash(key) * 137.508 + offset) % 360;
  if (h > 15 && h < 55) h = (h + 50) % 360;
  return `hsl(${h.toFixed(0)},80%,${58 + (hash(key) % 3) * 6}%)`;
}

export const riderColor = (userId: string, me: boolean) => (me ? ME_COLOR : vivid(userId, 0));
export const schoolColor = (key: string | null, mine: boolean) =>
  mine ? ME_COLOR : key ? vivid(key, 200) : '#9E9E9E';

export function schoolKeyOf(name: string, region: string) {
  return name.trim() ? `${name.trim()}|${region.trim()}` : null;
}

export async function fetchLands(b: Bounds, myId: string | null, mySchoolKey: string | null) {
  const { data, error } = await supabase.rpc('lands_in_box', {
    min_lng: b.minLng,
    min_lat: b.minLat,
    max_lng: b.maxLng,
    max_lat: b.maxLat,
  });
  if (error || !data) return null;
  return (data as { user_id: string; school_key: string | null; geojson: string }[]).map((r): MapLand => {
    const me = r.user_id === myId;
    const mine = !!mySchoolKey && r.school_key === mySchoolKey;
    return {
      id: r.user_id,
      me,
      mine,
      color: riderColor(r.user_id, me),
      schoolColor: schoolColor(r.school_key, mine),
      polys: JSON.parse(r.geojson).coordinates,
    };
  });
}

type StatsRow = {
  players: number;
  top: { userId: string; name: string; area: number; count: number }[];
  me: { rank: number; area: number; count: number } | null;
  schoolCount: number;
  schoolTop: { key: string; name: string; area: number; riders: number }[];
  mySchool: { key: string; name: string; area: number; riders: number; rank: number } | null;
};

export async function fetchStats(myId: string | null): Promise<TerritoryStats | null> {
  const { data, error } = await supabase.rpc('territory_stats');
  if (error || !data) return null;
  const s = data as StatsRow;
  const myKey = s.mySchool?.key ?? null;
  return {
    players: s.players,
    top: s.top.map((r) => ({
      name: r.name,
      color: riderColor(r.userId, r.userId === myId),
      me: r.userId === myId,
      area: r.area,
      count: r.count,
    })),
    myRank: s.me?.rank ?? s.players,
    myArea: s.me?.area ?? 0,
    myCount: s.me?.count ?? 0,
    schoolCount: s.schoolCount,
    schoolTop: s.schoolTop.map((r) => ({
      name: r.name,
      color: schoolColor(r.key, r.key === myKey),
      mine: r.key === myKey,
      area: r.area,
      riders: r.riders,
    })),
    mySchool: s.mySchool
      ? { name: s.mySchool.name, color: ME_COLOR, mine: true, area: s.mySchool.area, riders: s.mySchool.riders, rank: s.mySchool.rank }
      : null,
  };
}

// 누른 땅의 주인과 그 자리를 차지한 라이딩 기록
export async function fetchLandAt(owner: string, lat: number, lng: number, color: string, myId: string | null) {
  const { data, error } = await supabase.rpc('land_at', { owner, lat, lng });
  if (error || !data) return null;
  const d = data as Omit<LandInfo, 'me' | 'color' | 'ride'> & { ride: Omit<NonNullable<LandInfo['ride']>, 'where'> | null };
  return {
    ...d,
    me: owner === myId,
    color,
    ride: d.ride ? { ...d.ride, where: null } : null,
  } satisfies LandInfo;
}
