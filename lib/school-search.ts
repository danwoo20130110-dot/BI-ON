import { LEVEL_CODE, type School, type SchoolLevel } from '@/constants/schools';
import { supabase } from '@/lib/supabase';

const CODE_OF: Record<SchoolLevel, string> = { 초등학교: 'E', 중학교: 'M', 고등학교: 'H', 대학교: 'U', 기타: 'O' };
const LIMIT = 100;

type Row = { id: string; name: string; region: string; level: string };

// 서버 학교 목록(NEIS 전국 초·중·고 + 대학교)에서 이름으로 검색
export async function searchSchools(query: string, level: SchoolLevel | null): Promise<School[]> {
  const { data, error } = await supabase.rpc('search_schools', {
    q: query.trim(),
    lvl: level ? CODE_OF[level] : null,
    lim: LIMIT,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map((r) => ({ ...r, level: LEVEL_CODE[r.level] ?? '기타' }));
}
