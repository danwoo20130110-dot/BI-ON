import type { School, SchoolLevel } from '@/constants/schools';

const REST_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_KEY;
const PAGE_SIZE = 15;
const MAX_PAGES = 3;

type KakaoPlace = { place_name: string; category_name: string; address_name: string };

function levelOf(category: string): SchoolLevel {
  if (category.includes('초등학교')) return '초등학교';
  if (category.includes('중학교')) return '중학교';
  if (category.includes('고등학교')) return '고등학교';
  if (category.includes('대학')) return '대학교';
  return '기타';
}

const regionOf = (address: string) => address.split(' ').slice(0, 2).join(' ');

export const canSearchOnline = !!REST_KEY;

export async function searchSchools(query: string, signal?: AbortSignal): Promise<School[]> {
  if (!REST_KEY || query.trim().length < 2) return [];
  const out: School[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({
      query: query.trim(),
      category_group_code: 'SC4',
      size: String(PAGE_SIZE),
      page: String(page),
    });
    const res = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?${params}`, {
      headers: { Authorization: `KakaoAK ${REST_KEY}` },
      signal,
    });
    if (!res.ok) throw new Error(`학교 검색 실패 (${res.status})`);
    const data: { documents: KakaoPlace[]; meta: { is_end: boolean } } = await res.json();

    data.documents.forEach((p) => {
      const school = { name: p.place_name, region: regionOf(p.address_name), level: levelOf(p.category_name) };
      const key = `${school.name}|${school.region}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(school);
      }
    });
    if (data.meta.is_end) break;
  }
  return out;
}
