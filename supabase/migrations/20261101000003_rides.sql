-- 라이딩 기록: 경로와 기록은 본인만 볼 수 있음 (집·학교 위치가 드러나지 않도록)
-- 땅·랭킹은 3·4단계에서 이 기록을 바탕으로 서버가 따로 계산해 공개함
create table public.rides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  started_at timestamptz not null,
  distance_km double precision not null check (distance_km >= 0 and distance_km < 1000),
  duration_sec integer not null check (duration_sec >= 0 and duration_sec < 172800),
  avg_kmh double precision not null default 0 check (avg_kmh >= 0 and avg_kmh < 200),
  max_kmh double precision not null default 0 check (max_kmh >= 0 and max_kmh < 200),
  elevation_gain double precision not null default 0 check (elevation_gain >= 0),
  -- 1km 구간별 걸린 시간(초) 배열, 마지막 1km 미만 구간 {km, sec}
  splits jsonb not null default '[]' check (jsonb_typeof(splits) = 'array' and jsonb_array_length(splits) <= 1000),
  last_split jsonb check (last_split is null or jsonb_typeof(last_split) = 'object'),
  -- 경로 [[위도, 경도], ...]
  points jsonb not null check (jsonb_typeof(points) = 'array' and jsonb_array_length(points) between 2 and 2000),
  created_at timestamptz not null default now(),
  -- 같은 기록을 두 번 올려도 하나만 남도록 (오프라인 재전송 대비)
  unique (user_id, started_at)
);

create index rides_user_started_idx on public.rides (user_id, started_at desc);

alter table public.rides enable row level security;

create policy "users read own rides"
  on public.rides for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users insert own rides"
  on public.rides for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "users delete own rides"
  on public.rides for delete
  to authenticated
  using ((select auth.uid()) = user_id);
