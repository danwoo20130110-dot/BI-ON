// 전국 초·중·고 학교 목록을 교육부 나이스(NEIS) 공식 API 로 받아 assets/data/schools.json 으로 저장
//   1) https://open.neis.go.kr 회원가입 → 인증키 신청 (무료, 바로 발급)
//   2) .env 에 NEIS_API_KEY=발급받은키 추가
//   3) npm run fetch-schools
// 학교가 새로 생기거나 이름이 바뀌면 다시 실행하면 됨.

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

// .env 에서 NEIS_API_KEY 읽기
function readKey() {
  if (process.env.NEIS_API_KEY) return process.env.NEIS_API_KEY;
  try {
    const env = fs.readFileSync(path.join(root, '.env'), 'utf8');
    const m = env.match(/^NEIS_API_KEY\s*=\s*(.+)$/m);
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
  } catch {
    return null;
  }
}

const KEY = readKey();
if (!KEY) {
  console.error('NEIS_API_KEY 가 없어요. .env 에 NEIS_API_KEY=인증키 를 넣어 주세요. (발급: https://open.neis.go.kr)');
  process.exit(1);
}

const PAGE = 1000;
const LEVELS = { 초등학교: 'E', 중학교: 'M', 고등학교: 'H' };

// "서울특별시 송파구 위례서이로 10" → "서울 송파구"
const SIDO_SHORT = {
  서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천', 광주광역시: '광주',
  대전광역시: '대전', 울산광역시: '울산', 세종특별자치시: '세종', 경기도: '경기', 강원도: '강원',
  강원특별자치도: '강원', 충청북도: '충북', 충청남도: '충남', 전라북도: '전북', 전북특별자치도: '전북',
  전라남도: '전남', 경상북도: '경북', 경상남도: '경남', 제주특별자치도: '제주',
};
function shortRegion(addr, fallback) {
  const parts = (addr || '').trim().split(/\s+/);
  const sido = SIDO_SHORT[parts[0]] ?? SIDO_SHORT[fallback] ?? fallback ?? '';
  return [sido, parts[1] && !SIDO_SHORT[parts[1]] ? parts[1] : ''].filter(Boolean).join(' ');
}

const rows = [];
for (let page = 1; ; page++) {
  const url = `https://open.neis.go.kr/hub/schoolInfo?KEY=${KEY}&Type=json&pIndex=${page}&pSize=${PAGE}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.schoolInfo) {
    const msg = data.RESULT?.MESSAGE ?? JSON.stringify(data).slice(0, 200);
    if (page === 1) {
      console.error('불러오기 실패:', msg);
      process.exit(1);
    }
    break;
  }
  const list = data.schoolInfo[1].row;
  rows.push(...list);
  console.log(`${rows.length} / ${data.schoolInfo[0].head[0].list_total_count}`);
  if (list.length < PAGE) break;
}

// [이름, 지역, 학교급 코드(E/M/H/O)] — 앱 용량을 줄이려고 배열로 저장
const seen = new Set();
const schools = rows
  .filter((r) => r.SCHUL_NM && !r.SCHUL_NM.startsWith('(가칭)'))
  .map((r) => [
    r.SCHUL_NM.trim(),
    shortRegion(r.ORG_RDNMA, r.LCTN_SC_NM),
    LEVELS[r.SCHUL_KND_SC_NM] ?? 'O',
  ])
  .filter(([name, region]) => {
    const k = `${name}|${region}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  })
  .sort((a, b) => a[0].localeCompare(b[0], 'ko'));

const out = path.join(root, 'assets', 'data', 'schools.json');
fs.writeFileSync(out, JSON.stringify(schools));
console.log(`저장 완료: ${schools.length}개 학교 → ${path.relative(root, out)}`);
