// 랭킹 예시 데이터 (가상)
// 라이더마다 학교가 있고, 학교 기록 = 그 학교 라이더들 기록의 합.
// 내 학교는 프로필에 학교를 등록한 경우에만 순위에 포함됨.

// 예시 학교 (땅따먹기 지도와 같은 목록 사용)
export const SAMPLE_SCHOOLS = [
  '한국고', '서울고', '미래고', '하늘고', '바다고', '푸른고', '새솔고', '한빛고', '가람초', '햇살고', '도담여고', '청솔중',
  '은빛고', '별빛초', '다온중', '누리고', '한울고', '새봄여고', '아라중', '라온고', '샛별초', '한결고', '이룸중', '해든고',
];

export type Rider = { name: string; school: string | null; km: number; me?: boolean };
export type SchoolRow = { name: string; km: number; riders: number; mine?: boolean };

const RIDER_COUNT = 240;
const MY_KM = 412;
// 등록한 학교가 예시 목록에 없으면, 이 수만큼 가상 친구를 같은 학교로 넣어 줌
const MY_SCHOOL_CLASSMATES = 6;

const FIXED_NAMES = ['위아위스', '페달왕', '바람돌이', '라이더킴', '두바퀴', '한강러버', '업힐마스터', '자전거소년'];
const NICK_HEADS = ['페달', '바람', '업힐', '한강', '라이더', '두바퀴', '스프린트', '클릿', '체인', '기어', '로드', '새벽',
  '야간', '질주', '은륜', '케이던스', '다운힐', '바퀴', '브레이크', '안장'];
const NICK_TAILS = ['왕', '킴', '러버', '마스터', '소년', '소녀', '장인', '요정', '대장', '고수', '짱', '맨', '부엉이',
  '토끼', '곰', '여우', '고양이', '호랑이'];

// 항상 같은 결과가 나오도록 고정 시드 난수
function seeded(seed: number) {
  let v = seed;
  return () => {
    v = (v * 1664525 + 1013904223) % 4294967296;
    return v / 4294967296;
  };
}

function hash(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// 다른 라이더들 (내 정보와 무관하게 항상 같음)
function baseRiders(): Rider[] {
  const rand = seeded(2026);
  const used = new Set<string>(FIXED_NAMES);
  return Array.from({ length: RIDER_COUNT }, (_, i) => {
    let name = FIXED_NAMES[i];
    while (!name) {
      const n =
        NICK_HEADS[Math.floor(rand() * NICK_HEADS.length)] + NICK_TAILS[Math.floor(rand() * NICK_TAILS.length)];
      const candidate = used.has(n) ? `${n}${Math.floor(rand() * 90 + 10)}` : n;
      if (!used.has(candidate)) name = candidate;
    }
    used.add(name);
    // 앞쪽 학교일수록 라이더가 많도록 치우치게 배정
    const school = SAMPLE_SCHOOLS[Math.floor(Math.pow(rand(), 1.6) * SAMPLE_SCHOOLS.length)];
    const km = Math.max(15, Math.round(2132 * Math.exp(-i / 42) * (0.92 + rand() * 0.16)));
    return { name, school, km };
  });
}

const BASE = baseRiders();

export function buildRanking(nickname: string, mySchool: string | null) {
  const riders: Rider[] = BASE.map((r) => ({ ...r }));

  if (mySchool && !SAMPLE_SCHOOLS.includes(mySchool)) {
    // 예시 목록에 없는 학교면 몇 명을 같은 학교 친구로 넣어서 학교 기록이 생기게 함
    const rand = seeded(hash(mySchool));
    for (let k = 0; k < MY_SCHOOL_CLASSMATES; k++) {
      riders[30 + Math.floor(rand() * (RIDER_COUNT - 30))].school = mySchool;
    }
  }
  riders.push({ name: nickname, school: mySchool, km: MY_KM, me: true });
  riders.sort((a, b) => b.km - a.km);

  // 학교 기록 = 소속 라이더 기록의 합
  const bySchool = new Map<string, SchoolRow>();
  riders.forEach((r) => {
    if (!r.school) return;
    const row = bySchool.get(r.school) ?? { name: r.school, km: 0, riders: 0, mine: r.school === mySchool };
    row.km += r.km;
    row.riders += 1;
    bySchool.set(r.school, row);
  });
  const schools = [...bySchool.values()].sort((a, b) => b.km - a.km);

  return { riders, schools };
}
