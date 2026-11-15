export type SchoolLevel = '초등학교' | '중학교' | '고등학교' | '대학교' | '기타';
// id: 서버 학교 목록의 ID (NEIS 학교는 N+학교코드, 대학교는 U+번호)
export type School = { id: string; name: string; region: string; level: SchoolLevel };

export const LEVEL_CODE: Record<string, SchoolLevel> = {
  E: '초등학교',
  M: '중학교',
  H: '고등학교',
  U: '대학교',
  O: '기타',
};

export const GRADES: Record<SchoolLevel, string[]> = {
  초등학교: ['1학년', '2학년', '3학년', '4학년', '5학년', '6학년'],
  중학교: ['1학년', '2학년', '3학년'],
  고등학교: ['1학년', '2학년', '3학년'],
  대학교: ['1학년', '2학년', '3학년', '4학년', '졸업생'],
  기타: ['1학년', '2학년', '3학년'],
};

export function schoolLevelOf(name: string): SchoolLevel {
  if (name.includes('초등학교')) return '초등학교';
  if (name.includes('중학교')) return '중학교';
  if (name.includes('고등학교')) return '고등학교';
  if (name.includes('대학')) return '대학교';
  return '고등학교';
}
