-- 학교 목록을 서버에서 관리 (NEIS 초·중·고 + 대학교)
-- 프로필은 학교 ID 를 저장하고, 이름·지역은 학교 목록에서 자동으로 채움
--  → 같은 학교가 이름 표기 차이로 둘로 갈리지 않음
create extension if not exists pg_trgm with schema extensions;

create table public.schools (
  id text primary key,                 -- N+NEIS 학교코드, 대학교는 U+번호
  name text not null,
  region text not null default '',
  level text not null check (level in ('E', 'M', 'H', 'U', 'O'))  -- 초·중·고·대·기타
);

create index schools_name_trgm_idx on public.schools using gin (name extensions.gin_trgm_ops);

alter table public.schools enable row level security;

-- 가입 전(로그인 전)에도 학교를 골라야 하므로 누구나 조회 가능
create policy "schools are readable by everyone"
  on public.schools for select
  to anon, authenticated
  using (true);

-- 대학교 (NEIS 에 없음)
insert into public.schools (id, name, region, level) values
('U001', '서울대학교', '서울 관악구', 'U'),
('U002', '연세대학교', '서울 서대문구', 'U'),
('U003', '고려대학교', '서울 성북구', 'U'),
('U004', '서강대학교', '서울 마포구', 'U'),
('U005', '성균관대학교', '서울 종로구', 'U'),
('U006', '한양대학교', '서울 성동구', 'U'),
('U007', '중앙대학교', '서울 동작구', 'U'),
('U008', '경희대학교', '서울 동대문구', 'U'),
('U009', '한국외국어대학교', '서울 동대문구', 'U'),
('U010', '서울시립대학교', '서울 동대문구', 'U'),
('U011', '건국대학교', '서울 광진구', 'U'),
('U012', '동국대학교', '서울 중구', 'U'),
('U013', '홍익대학교', '서울 마포구', 'U'),
('U014', '국민대학교', '서울 성북구', 'U'),
('U015', '숭실대학교', '서울 동작구', 'U'),
('U016', '세종대학교', '서울 광진구', 'U'),
('U017', '광운대학교', '서울 노원구', 'U'),
('U018', '명지대학교', '서울 서대문구', 'U'),
('U019', '상명대학교', '서울 종로구', 'U'),
('U020', '서울과학기술대학교', '서울 노원구', 'U'),
('U021', '이화여자대학교', '서울 서대문구', 'U'),
('U022', '숙명여자대학교', '서울 용산구', 'U'),
('U023', '성신여자대학교', '서울 성북구', 'U'),
('U024', '동덕여자대학교', '서울 성북구', 'U'),
('U025', '덕성여자대학교', '서울 도봉구', 'U'),
('U026', '서울여자대학교', '서울 노원구', 'U'),
('U027', '한성대학교', '서울 성북구', 'U'),
('U028', '삼육대학교', '서울 노원구', 'U'),
('U029', '서경대학교', '서울 성북구', 'U'),
('U030', '한국체육대학교', '서울 송파구', 'U'),
('U031', '서울교육대학교', '서울 서초구', 'U'),
('U032', '인하대학교', '인천 미추홀구', 'U'),
('U033', '인천대학교', '인천 연수구', 'U'),
('U034', '경인교육대학교', '인천 계양구', 'U'),
('U035', '아주대학교', '경기 수원시', 'U'),
('U036', '경기대학교', '경기 수원시', 'U'),
('U037', '수원대학교', '경기 화성시', 'U'),
('U038', '단국대학교', '경기 용인시', 'U'),
('U039', '가톨릭대학교', '경기 부천시', 'U'),
('U040', '한국항공대학교', '경기 고양시', 'U'),
('U041', '가천대학교', '경기 성남시', 'U'),
('U042', '한국공학대학교', '경기 시흥시', 'U'),
('U043', '한신대학교', '경기 오산시', 'U'),
('U044', '강남대학교', '경기 용인시', 'U'),
('U045', '용인대학교', '경기 용인시', 'U'),
('U046', '대진대학교', '경기 포천시', 'U'),
('U047', '협성대학교', '경기 화성시', 'U'),
('U048', '평택대학교', '경기 평택시', 'U'),
('U049', '안양대학교', '경기 안양시', 'U'),
('U050', '성결대학교', '경기 안양시', 'U'),
('U051', '부산대학교', '부산 금정구', 'U'),
('U052', '부경대학교', '부산 남구', 'U'),
('U053', '동아대학교', '부산 사하구', 'U'),
('U054', '경성대학교', '부산 남구', 'U'),
('U055', '동의대학교', '부산 부산진구', 'U'),
('U056', '한국해양대학교', '부산 영도구', 'U'),
('U057', '경북대학교', '대구 북구', 'U'),
('U058', '계명대학교', '대구 달서구', 'U'),
('U059', '영남대학교', '경북 경산시', 'U'),
('U060', '대구대학교', '경북 경산시', 'U'),
('U061', '대구가톨릭대학교', '경북 경산시', 'U'),
('U062', '전남대학교', '광주 북구', 'U'),
('U063', '조선대학교', '광주 동구', 'U'),
('U064', '광주과학기술원', '광주 북구', 'U'),
('U065', '충남대학교', '대전 유성구', 'U'),
('U066', '한남대학교', '대전 대덕구', 'U'),
('U067', '한국과학기술원', '대전 유성구', 'U'),
('U068', '충북대학교', '충북 청주시', 'U'),
('U069', '청주대학교', '충북 청주시', 'U'),
('U070', '한국교원대학교', '충북 청주시', 'U'),
('U071', '전북대학교', '전북 전주시', 'U'),
('U072', '원광대학교', '전북 익산시', 'U'),
('U073', '강원대학교', '강원 춘천시', 'U'),
('U074', '한림대학교', '강원 춘천시', 'U'),
('U075', '경상국립대학교', '경남 진주시', 'U'),
('U076', '창원대학교', '경남 창원시', 'U'),
('U077', '울산대학교', '울산 남구', 'U'),
('U078', '울산과학기술원', '울산 울주군', 'U'),
('U079', '제주대학교', '제주 제주시', 'U'),
('U080', '포항공과대학교', '경북 포항시', 'U'),
('U081', '한동대학교', '경북 포항시', 'U'),
('U082', '금오공과대학교', '경북 구미시', 'U'),
('U083', '안동대학교', '경북 안동시', 'U'),
('U084', '순천향대학교', '충남 아산시', 'U'),
('U085', '호서대학교', '충남 아산시', 'U'),
('U086', '공주대학교', '충남 공주시', 'U'),
('U087', '한국기술교육대학교', '충남 천안시', 'U'),
('U088', '목포대학교', '전남 무안군', 'U'),
('U089', '순천대학교', '전남 순천시', 'U')
on conflict (id) do nothing;

alter table public.profiles
  add column school_id text references public.schools (id) on delete set null;

-- 학교 ID 가 정해지면 이름·지역을 학교 목록 값으로 맞춤
create or replace function public.profiles_fill_school()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.school_id is null then
    if tg_op = 'INSERT' or old.school_id is not null then
      new.school_name := null;
      new.school_region := null;
    end if;
  else
    select s.name, s.region into new.school_name, new.school_region
      from public.schools s where s.id = new.school_id;
  end if;
  return new;
end;
$$;

create trigger profiles_fill_school
  before insert or update of school_id on public.profiles
  for each row execute function public.profiles_fill_school();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nickname, school_id, grade)
  values (
    new.id,
    trim(new.raw_user_meta_data ->> 'nickname'),
    (select s.id from public.schools s where s.id = nullif(trim(new.raw_user_meta_data ->> 'school_id'), '')),
    nullif(trim(new.raw_user_meta_data ->> 'grade'), '')
  );
  return new;
end;
$$;

-- 학교 이름 검색 (띄어쓰기 무시, 앞부분이 맞는 학교 먼저)
create or replace function public.search_schools(q text, lvl text default null, lim integer default 50)
returns table (id text, name text, region text, level text)
language sql
stable
set search_path = public, extensions
as $$
  with t as (select replace(trim(q), ' ', '') as k)
  select s.id, s.name, s.region, s.level
  from schools s, t
  where length(t.k) >= 1
    and (lvl is null or s.level = lvl)
    and s.name ilike '%' || t.k || '%'
  order by (s.name ilike t.k || '%') desc, length(s.name), s.name, s.region
  limit least(greatest(lim, 1), 100)
$$;

grant execute on function public.search_schools(text, text, integer) to anon, authenticated;
