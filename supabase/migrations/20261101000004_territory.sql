-- 땅따먹기: 라이딩이 올라오면 서버가 땅을 계산
--  · 출발점 근처(200m)로 돌아온 라이딩은 안쪽 전체, 아니면 경로 양옆 50m 띠
--  · 내 땅과 겹치면 하나로 합치고, 남의 땅과 겹치면 겹친 만큼 가져옴
create extension if not exists postgis with schema extensions;

-- 사람마다 땅 하나 (여러 조각의 MultiPolygon)
create table public.territories (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  geom extensions.geometry(MultiPolygon, 4326) not null,
  area_km2 double precision not null default 0,
  pieces integer not null default 0,
  updated_at timestamptz not null default now()
);

create index territories_geom_idx on public.territories using gist (geom);

alter table public.territories enable row level security;

create policy "territories are readable by signed-in users"
  on public.territories for select
  to authenticated
  using (true);

-- 라이딩마다 차지한 모양 (땅을 눌렀을 때 어떤 라이딩으로 얻었는지 찾는 용도)
-- 직접 조회는 막고 land_at 함수로만 필요한 정보를 보여줌
create table public.claims (
  ride_id uuid primary key references public.rides (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  geom extensions.geometry(MultiPolygon, 4326) not null,
  is_loop boolean not null,
  km double precision not null,
  area_km2 double precision not null,
  created_at timestamptz not null default now()
);

create index claims_geom_idx on public.claims using gist (geom);
create index claims_user_idx on public.claims (user_id, created_at desc);

alter table public.claims enable row level security;

-- 면(폴리곤)만 남긴 MultiPolygon
create or replace function public.bion_polys(g extensions.geometry)
returns extensions.geometry
language sql
immutable
set search_path = public, extensions
as $$
  select st_setsrid(st_multi(st_collectionextract(st_makevalid(g), 3)), 4326)
$$;

-- 잘리고 남은 조각 중 너무 작거나(4000m² 미만) 가는 것(폭 20m 미만) 버림
create or replace function public.bion_prune(g extensions.geometry)
returns extensions.geometry
language sql
immutable
set search_path = public, extensions
as $$
  select st_setsrid(coalesce(st_multi(st_collect(d.geom)), 'MULTIPOLYGON EMPTY'::geometry), 4326)
  from st_dump(public.bion_polys(g)) d
  where st_area(d.geom::geography) >= 4000
    -- 긴 띠의 폭 ≈ 2 × 넓이 ÷ 둘레
    and 2 * st_area(d.geom::geography) / nullif(st_length(st_exteriorring(d.geom)::geography), 0) >= 20
$$;

-- 라이딩 경로 [[위도, 경도], ...] → 차지할 땅 모양
create or replace function public.bion_ride_shape(
  points jsonb,
  out shape extensions.geometry,
  out is_loop boolean,
  out km double precision
)
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  line geometry;
  ring geometry;
  trimmed geometry;
begin
  select st_setsrid(st_makeline(st_makepoint((p ->> 1)::float8, (p ->> 0)::float8) order by i), 4326)
    into line
    from jsonb_array_elements(points) with ordinality as t (p, i);
  if line is null or st_npoints(line) < 2 then
    return;
  end if;

  km := st_length(line::geography) / 1000;
  if km < 0.05 then
    return;
  end if;

  is_loop := false;
  if st_npoints(line) >= 4
     and st_distance(st_startpoint(line)::geography, st_endpoint(line)::geography) < 200 then
    ring := bion_polys(st_makepolygon(st_addpoint(line, st_startpoint(line))));
    is_loop := st_area(ring::geography) >= 20000;
  end if;

  if is_loop then
    shape := ring;
  else
    -- 약 30m 단위로 단순하게 만든 뒤 양옆 50m 띠 (끝은 둥글게)
    shape := bion_polys(st_buffer(st_simplify(line, 0.0003)::geography, 50, 'quad_segs=4')::geometry);
  end if;

  -- 경로가 되돌아가며 생긴 가는 조각 제거 (다 지워지면 원래 모양 유지)
  trimmed := bion_prune(shape);
  if not st_isempty(trimmed) then
    shape := trimmed;
  end if;
end;
$$;

create or replace function public.bion_set_territory(owner uuid, g extensions.geometry)
returns void
language sql
set search_path = public, extensions
as $$
  insert into territories (user_id, geom, area_km2, pieces, updated_at)
  values (owner, g, st_area(g::geography) / 1e6, st_numgeometries(g), now())
  on conflict (user_id) do update
    set geom = excluded.geom,
        area_km2 = excluded.area_km2,
        pieces = excluded.pieces,
        updated_at = now()
$$;

-- owner 가 shape 을 차지: 남의 땅은 겹친 만큼 잘라내고, 내 땅은 하나로 합침
create or replace function public.bion_take_land(owner uuid, shape extensions.geometry)
returns void
language plpgsql
set search_path = public, extensions
as $$
declare
  v record;
  near geometry;
  far geometry;
  rest geometry;
  mine geometry;
begin
  -- 땅 계산은 한 번에 하나씩 (동시에 올라온 라이딩끼리 결과가 꼬이지 않도록)
  perform pg_advisory_xact_lock(hashtext('bion_territory'));

  for v in
    select t.user_id, t.geom from territories t
    where t.user_id <> owner and t.geom && shape and st_intersects(t.geom, shape)
  loop
    -- 새 땅에 닿는 조각만 잘라내고 나머지 조각은 그대로 둠
    select st_collect(d.geom) filter (where st_intersects(d.geom, shape)),
           st_collect(d.geom) filter (where not st_intersects(d.geom, shape))
      into near, far
      from st_dump(v.geom) d;
    rest := bion_prune(st_difference(near, shape));
    if far is not null then
      rest := bion_polys(st_collect(far, rest));
    end if;
    perform bion_set_territory(v.user_id, rest);
  end loop;

  select bion_polys(st_union(t.geom, shape)) into mine from territories t where t.user_id = owner;
  perform bion_set_territory(owner, coalesce(mine, shape));
end;
$$;

create or replace function public.bion_claim_ride(ride_id uuid, owner uuid, points jsonb)
returns void
language plpgsql
set search_path = public, extensions
as $$
declare
  s record;
begin
  select * into s from bion_ride_shape(points);
  if s.shape is null or st_isempty(s.shape) then
    return;
  end if;
  insert into claims (ride_id, user_id, geom, is_loop, km, area_km2)
  values (ride_id, owner, s.shape, s.is_loop, s.km, st_area(s.shape::geography) / 1e6);
  perform bion_take_land(owner, s.shape);
end;
$$;

create or replace function public.rides_claim_land()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  begin
    perform bion_claim_ride(new.id, new.user_id, new.points);
  exception when others then
    -- 땅 계산이 실패해도 라이딩 기록은 저장
    raise warning 'land claim failed for ride %: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

create trigger rides_claim_land
  after insert on public.rides
  for each row execute function public.rides_claim_land();

-- 내부용 함수는 앱에서 직접 부를 수 없게
revoke execute on function public.bion_set_territory(uuid, extensions.geometry) from public, anon, authenticated;
revoke execute on function public.bion_take_land(uuid, extensions.geometry) from public, anon, authenticated;
revoke execute on function public.bion_claim_ride(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.rides_claim_land() from public, anon, authenticated;

-- 지도에 보이는 범위의 땅 (넓은 땅 먼저)
create or replace function public.lands_in_box(min_lng float8, min_lat float8, max_lng float8, max_lat float8)
returns table (user_id uuid, nickname text, school_name text, school_key text, area_km2 float8, geojson text)
language sql
stable
set search_path = public, extensions
as $$
  select t.user_id, p.nickname, p.school_name, p.school_key, t.area_km2, st_asgeojson(t.geom, 6)
  from territories t
  join profiles p on p.id = t.user_id
  where t.pieces > 0
    and t.geom && st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)
  order by t.area_km2 desc
  limit 300
$$;

-- 땅을 눌렀을 때: 주인 정보 + 그 자리를 차지한 가장 최근 라이딩 기록 (경로는 빼고)
create or replace function public.land_at(owner uuid, lat float8, lng float8)
returns json
language sql
stable
security definer
set search_path = public, extensions
as $$
  with hit as (
    select c.is_loop, c.area_km2, r.started_at, r.distance_km, r.duration_sec, r.avg_kmh, r.max_kmh,
           r.elevation_gain, r.splits, r.last_split
    from claims c
    join rides r on r.id = c.ride_id
    where c.user_id = owner
      and st_intersects(c.geom, st_setsrid(st_makepoint(lng, lat), 4326))
    order by c.created_at desc
    limit 1
  )
  select json_build_object(
    'owner', p.nickname,
    'school', p.school_name,
    'totalArea', t.area_km2,
    'pieces', t.pieces,
    'ride', (
      select json_build_object(
        'loop', h.is_loop,
        'area', h.area_km2,
        'at', (extract(epoch from h.started_at) * 1000)::bigint,
        'km', h.distance_km,
        'sec', h.duration_sec,
        'avg', h.avg_kmh,
        'max', h.max_kmh,
        'gain', h.elevation_gain,
        'splits', h.splits,
        'last', h.last_split
      )
      from hit h
    )
  )
  from territories t
  join profiles p on p.id = t.user_id
  where t.user_id = owner
    and auth.uid() is not null
$$;

-- 땅따먹기 화면 순위: 개인 상위 3명·내 순위, 학교 상위 3곳·우리 학교
create or replace function public.territory_stats()
returns json
language sql
stable
set search_path = public, extensions
as $$
  with ranked as (
    select p.id, p.nickname, p.school_key, p.school_name,
           coalesce(t.area_km2, 0) as area, coalesce(t.pieces, 0) as pieces,
           rank() over (order by coalesce(t.area_km2, 0) desc) as rk
    from profiles p
    left join territories t on t.user_id = p.id
  ),
  schools as (
    select school_key, min(school_name) as name, sum(area) as area, count(*) as riders, sum(pieces) as pieces,
           rank() over (order by sum(area) desc) as rk
    from ranked
    where school_key is not null
    group by school_key
  ),
  me as (
    select * from ranked where id = auth.uid()
  )
  select json_build_object(
    'players', (select count(*) from ranked),
    'top', coalesce((
      select json_agg(json_build_object('userId', x.id, 'name', x.nickname, 'area', x.area, 'count', x.pieces) order by x.rk, x.nickname)
      from (select * from ranked where area > 0 order by rk, nickname limit 3) x
    ), '[]'),
    'me', (select json_build_object('rank', rk, 'area', area, 'count', pieces) from me),
    'schoolCount', (select count(*) from schools),
    'schoolTop', coalesce((
      select json_agg(json_build_object('key', x.school_key, 'name', x.name, 'area', x.area, 'riders', x.riders) order by x.rk, x.name)
      from (select * from schools where area > 0 order by rk, name limit 3) x
    ), '[]'),
    'mySchool', (
      select json_build_object('key', s.school_key, 'name', s.name, 'area', s.area, 'riders', s.riders, 'rank', s.rk)
      from schools s
      where s.school_key = (select school_key from me)
    )
  )
  where auth.uid() is not null
$$;

revoke execute on function public.lands_in_box(float8, float8, float8, float8) from public, anon;
revoke execute on function public.land_at(uuid, float8, float8) from public, anon;
revoke execute on function public.territory_stats() from public, anon;
grant execute on function public.lands_in_box(float8, float8, float8, float8) to authenticated;
grant execute on function public.land_at(uuid, float8, float8) to authenticated;
grant execute on function public.territory_stats() to authenticated;

-- 이미 올라온 라이딩도 시간 순서대로 땅 계산
do $$
declare
  r record;
begin
  for r in select id, user_id, points from public.rides order by started_at loop
    begin
      perform public.bion_claim_ride(r.id, r.user_id, r.points);
    exception when others then
      raise warning 'land claim failed for ride %: %', r.id, sqlerrm;
    end;
  end loop;
end;
$$;
