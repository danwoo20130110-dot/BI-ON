import { File } from 'expo-file-system';
import { useEffect, useState } from 'react';

import { getUserId, useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';

export type Profile = {
  nickname: string;
  // 서버 학교 목록의 ID (없으면 학교 미등록). 이름·지역은 서버가 이 ID 로 채움
  schoolId: string | null;
  school: string;
  schoolRegion: string;
  grade: string;
  bio: string;
  // 서버에 올라간 사진 주소, 또는 방금 고른 기기 안 사진 경로
  photoUri: string | null;
};

export const DEFAULT_PROFILE: Profile = {
  nickname: '',
  schoolId: null,
  school: '',
  schoolRegion: '',
  grade: '',
  bio: '',
  photoUri: null,
};

type Row = {
  nickname: string;
  school_id: string | null;
  school_name: string | null;
  school_region: string | null;
  grade: string | null;
  bio: string | null;
  avatar_path: string | null;
  updated_at: string;
};

export function avatarUrl(path: string | null, version: string) {
  if (!path) return null;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  // 같은 경로에 다시 올려도 새 사진이 보이도록
  return `${data.publicUrl}?v=${encodeURIComponent(version)}`;
}

function fromRow(r: Row): Profile {
  return {
    nickname: r.nickname,
    schoolId: r.school_id,
    school: r.school_name ?? '',
    schoolRegion: r.school_region ?? '',
    grade: r.grade ?? '',
    bio: r.bio ?? '',
    photoUri: avatarUrl(r.avatar_path, r.updated_at),
  };
}

let current: Profile = DEFAULT_PROFILE;
let loadedFor: string | null = null;
const listeners = new Set<(p: Profile, ready: boolean) => void>();
const notify = () => listeners.forEach((l) => l(current, loadedFor !== null));

async function load(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('nickname, school_id, school_name, school_region, grade, bio, avatar_path, updated_at')
    .eq('id', userId)
    .single();
  if (error || !data) return;
  current = fromRow(data);
  loadedFor = userId;
  notify();
}

export function reloadProfile() {
  const id = getUserId();
  if (id) return load(id);
}

// 파일 앞부분으로 이미지 형식 판별 (이미지가 아니면 null)
function imageType(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { type: 'image/jpeg', ext: 'jpg' };
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { type: 'image/png', ext: 'png' };
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45) return { type: 'image/webp', ext: 'webp' };
  return null;
}

async function uploadAvatar(userId: string, localUri: string) {
  // Android 에서 fetch(file://) 는 파일을 못 읽는 경우가 있어 파일 시스템 API 로 읽음
  const body = await new File(localUri).arrayBuffer();
  const kind = imageType(new Uint8Array(body, 0, Math.min(12, body.byteLength)));
  if (!kind) throw new Error('사진 파일을 읽지 못했어요. 다른 사진으로 시도해 주세요');
  const path = `${userId}/avatar.${kind.ext}`;
  const { error } = await supabase.storage.from('avatars').upload(path, body, { contentType: kind.type, upsert: true });
  if (error) throw new Error('사진을 올리지 못했어요. 잠시 후 다시 시도해 주세요');
  return path;
}

export async function saveProfile(next: Profile) {
  const userId = getUserId();
  if (!userId) throw new Error('로그인이 필요해요');

  let avatar_path: string | null | undefined;
  if (!next.photoUri) avatar_path = null;
  else if (!next.photoUri.startsWith('http')) avatar_path = await uploadAvatar(userId, next.photoUri);

  const update: Record<string, string | null> = {
    nickname: next.nickname.trim(),
    school_id: next.schoolId,
    grade: next.grade || null,
    bio: next.bio.trim() || null,
  };
  if (avatar_path !== undefined) update.avatar_path = avatar_path;

  const { data, error } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', userId)
    .select('nickname, school_id, school_name, school_region, grade, bio, avatar_path, updated_at')
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('이미 사용 중인 닉네임이에요');
    throw new Error('저장하지 못했어요. 잠시 후 다시 시도해 주세요');
  }
  current = fromRow(data);
  notify();
}

export async function isNicknameAvailable(name: string) {
  const { data, error } = await supabase.rpc('nickname_available', { name });
  return error ? true : !!data;
}

export function useProfile() {
  const { userId } = useAuth();
  const [state, setState] = useState({ profile: current, ready: loadedFor !== null && loadedFor === userId });

  useEffect(() => {
    const l = (p: Profile, ready: boolean) => setState({ profile: p, ready });
    listeners.add(l);
    if (userId && loadedFor !== userId) load(userId);
    if (!userId) {
      current = DEFAULT_PROFILE;
      loadedFor = null;
    }
    return () => {
      listeners.delete(l);
    };
  }, [userId]);

  return state;
}
