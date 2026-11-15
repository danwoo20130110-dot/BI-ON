import type { Session } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';

import { supabase } from '@/lib/supabase';

type AuthState = { session: Session | null; userId: string | null; loading: boolean };

let state: AuthState = { session: null, userId: null, loading: true };
const listeners = new Set<() => void>();

function set(session: Session | null) {
  state = { session, userId: session?.user.id ?? null, loading: false };
  listeners.forEach((l) => l());
}

supabase.auth.getSession().then(({ data }) => set(data.session));
supabase.auth.onAuthStateChange((_event, next) => set(next));

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useAuth() {
  return useSyncExternalStore(subscribe, () => state);
}

export function getUserId() {
  return state.userId;
}

// Supabase 영어 오류를 사용자에게 보여줄 한국어로
export function authErrorText(message: string) {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return '이메일 또는 비밀번호가 맞지 않아요';
  if (m.includes('email not confirmed')) return '메일함에서 인증 링크를 먼저 눌러 주세요';
  if (m.includes('already registered') || m.includes('already been registered')) return '이미 가입된 이메일이에요';
  if (m.includes('password') && m.includes('6')) return '비밀번호는 6자 이상이어야 해요';
  if (m.includes('invalid') && m.includes('email')) return '이메일 주소를 확인해 주세요';
  if (m.includes('rate limit') || m.includes('security purposes')) return '요청이 너무 많아요. 잠시 후 다시 시도해 주세요';
  if (m.includes('network') || m.includes('fetch')) return '인터넷 연결을 확인해 주세요';
  return '문제가 생겼어요. 잠시 후 다시 시도해 주세요';
}
