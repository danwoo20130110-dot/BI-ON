// 교육부 NEIS 에서 전국 초·중·고(특수·각종학교 포함) 목록을 받아 Supabase 마이그레이션(SQL)으로 저장
// 사용: npm run fetch-schools  (.env 에 NEIS_API_KEY 필요, 발급: https://open.neis.go.kr)
// 만든 파일을 supabase db push 로 적용하면 서버 학교 목록이 새로 채워짐
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

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

const SIDO_SHORT = {
  서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천', 광주광역시: '광주',
  대전광역시: '대전', 울산광역시: '울산', 세종특별자치시: '세종', 경기도: '경기', 강원도: '강원',
  강원특별자치도: '강원', 충청북도: '충북', 충청남도: '충남', 전라북도: '전북', 전북특별자치도: '전북',
  전라남도: '전남', 경상북도: '경북', 경상남도: '경남', 제주특별자치도: '제주',
};
// 통합 시·도는 괄호 속 옛 이름으로 (예: 전남광주통합특별시(광주) → 광주)
const sidoOf = (s) => s?.match(/\(([^)]+)\)$/)?.[1] ?? s;

function shortRegion(addr, fallback) {
  const parts = (addr || '').trim().split(/\s+/).map((p, i) => (i === 0 ? sidoOf(p) : p));
  fallback = sidoOf(fallback);
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

// [학교코드, 이름, 지역, 급]  학교코드(SD_SCHUL_CODE)는 전국에서 하나뿐
const seen = new Set();
const schools = rows
  .filter((r) => r.SD_SCHUL_CODE && r.SCHUL_NM && !r.SCHUL_NM.startsWith('(가칭)'))
  .map((r) => [
    r.SD_SCHUL_CODE.trim(),
    r.SCHUL_NM.trim(),
    shortRegion(r.ORG_RDNMA, r.LCTN_SC_NM),
    LEVELS[r.SCHUL_KND_SC_NM] ?? 'O',
  ])
  .filter(([code]) => !seen.has(code) && seen.add(code))
  .sort((a, b) => a[1].localeCompare(b[1], 'ko'));

const q = (s) => `'${s.replace(/'/g, "''")}'`;
const CHUNK = 500;
const parts = [
  '-- NEIS 학교 목록 (scripts/fetch-schools.mjs 로 생성, 직접 고치지 말 것)',
  `-- 생성: ${new Date().toISOString().slice(0, 10)}, ${schools.length}개`,
];
for (let i = 0; i < schools.length; i += CHUNK) {
  const values = schools
    .slice(i, i + CHUNK)
    .map(([code, name, region, level]) => `(${q('N' + code)}, ${q(name)}, ${q(region)}, ${q(level)})`)
    .join(',\n');
  parts.push(
    `insert into public.schools (id, name, region, level) values\n${values}\n` +
      'on conflict (id) do update set name = excluded.name, region = excluded.region, level = excluded.level;',
  );
}

const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const out = path.join(root, 'supabase', 'migrations', `${stamp}_schools_data.sql`);
fs.writeFileSync(out, parts.join('\n\n') + '\n');
console.log(`저장 완료: ${schools.length}개 학교 → ${path.relative(root, out)}`);
