import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

export type Profile = {
  nickname: string;
  school: string;
  // 예) '2학년' (학교별 가입 때 선택)
  grade: string;
  bio: string;
  // 기기 앨범에서 고른 사진 경로 (없으면 기본 아바타)
  photoUri: string | null;
};

export const DEFAULT_PROFILE: Profile = {
  nickname: 'danwoo',
  school: '',
  grade: '',
  bio: '',
  photoUri: null,
};

const STORAGE_KEY = 'bion.profile';

// 여러 화면이 같은 프로필을 보도록 모듈 단위로 한 번만 불러오고 공유
let current: Profile = DEFAULT_PROFILE;
let loaded = false;
const listeners = new Set<(p: Profile) => void>();

const loading = AsyncStorage.getItem(STORAGE_KEY)
  .then((raw) => {
    if (raw) current = { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
  })
  .catch(() => {})
  .finally(() => {
    loaded = true;
    listeners.forEach((l) => l(current));
  });

export async function saveProfile(next: Profile) {
  current = next;
  listeners.forEach((l) => l(current));
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function useProfile() {
  const [profile, setProfile] = useState(current);
  const [ready, setReady] = useState(loaded);

  useEffect(() => {
    const onChange = (p: Profile) => {
      setProfile(p);
      setReady(true);
    };
    listeners.add(onChange);
    loading.then(() => onChange(current));
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  return { profile, ready };
}
