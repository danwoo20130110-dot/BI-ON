-- 출시 전 보완
--  1. 경로가 끊긴 앞부분은 서버에서도 땅으로 치지 않음 (앱을 조작해 올려도)
--  2. 실시간 위치는 전국 공개가 아니라 근처 사람에게만 전달

-- ── 1. 끊긴 위치 기록 ──
create table public.ride_cuts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  cut_at timestamptz not null default now(),
  at_pt extensions.geometry(Point, 4326) not null
);

create index ride_cuts_user_idx on public.ride_cuts (user_id, cut_at desc);

-- 직접 읽고 쓰기는 막음
alter table public.ride_cuts enable row level security;

-- 라이딩 중 마지막으로 끊긴 지점 이전의 경로를 잘라냄
create or replace function public.bion_after_cut(ride_id uuid, owner uuid, points jsonb)
returns jsonb
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  cut geometry;
  first_pt geometry;
  keep_from bigint;
begin
  select c.at_pt
    into cut
    from ride_cuts c
    join rides r on r.id = ride_id
   where c.user_id = owner
     and c.cut_at >= r.started_at
     and c.cut_at <= r.started_at + make_interval(secs => r.duration_sec + 600)
   order by c.cut_at desc
   limit 1;
  if cut is null then
    return points;
  end if;

  first_pt := st_setsrid(st_makepoint((points -> 0 ->> 1)::float8, (points -> 0 ->> 0)::float8), 4326);
  -- 앱이 이미 잘라서 올린 경로는 끊긴 지점 근처에서 시작함
  if st_distance(first_pt::geography, cut::geography) < 100 then
    return points;
  end if;

  select t.i
    into keep_from
    from jsonb_array_elements(points) with ordinality as t (p, i)
   order by st_distance(st_setsrid(st_makepoint((t.p ->> 1)::float8, (t.p ->> 0)::float8), 4326)::geography, cut::geography), t.i desc
   limit 1;

  return (
    select coalesce(jsonb_agg(t.p order by t.i), '[]'::jsonb)
    from jsonb_array_elements(points) with ordinality as t (p, i)
    where t.i >= keep_from
  );
end;
$$;

create or replace function public.bion_claim_ride(ride_id uuid, owner uuid, points jsonb)
returns void
language plpgsql
set search_path = public, extensions
as $$
declare
  s record;
  line geometry;
  mine geometry;
  edges geometry;
  faces geometry;
  extra geometry;
begin
  points := bion_after_cut(ride_id, owner, points);

  select * into s from bion_ride_shape(points);
  if s.shape is null or st_isempty(s.shape) then
    return;
  end if;

  begin
    select st_setsrid(st_makeline(st_makepoint((p ->> 1)::float8, (p ->> 0)::float8) order by i), 4326)
      into line
      from jsonb_array_elements(points) with ordinality as t (p, i);

    -- 이번 경로 주변(약 5km) 내 땅 조각
    select st_collect(d.geom)
      into mine
      from territories t, st_dump(t.geom) d
     where t.user_id = owner
       and d.geom && st_expand(line, 0.05);

    if mine is not null then
      edges := st_collectionextract(st_collect(line, st_boundary(mine)), 2);
      select bion_polys(st_polygonize(d.geom))
        into faces
        from st_dump(st_node(edges)) d;

      -- 이번 선이 테두리에 닿는 칸 중 아직 내 땅이 아닌 부분만
      select st_collect(f.geom)
        into faces
        from st_dump(faces) f
       where st_intersects(f.geom, line);
      if faces is not null then
        extra := bion_polys(st_difference(faces, mine));
        select st_setsrid(st_multi(st_collect(d.geom)), 4326)
          into extra
          from st_dump(extra) d
         where st_area(d.geom::geography) >= 100
           and 2 * st_area(d.geom::geography) / nullif(st_length(st_exteriorring(d.geom)::geography), 0) >= 5;
        if extra is not null then
          s.shape := bion_polys(st_union(s.shape, extra));
          s.is_loop := true;
        end if;
      end if;
    end if;
  exception when others then
    -- 계산이 실패하면 이번 라이딩만으로 만든 땅 사용
    raise warning 'closing with existing land failed for ride %: %', ride_id, sqlerrm;
  end;

  insert into claims (ride_id, user_id, geom, is_loop, km, area_km2)
  values (ride_id, owner, s.shape, s.is_loop, s.km, st_area(s.shape::geography) / 1e6);
  perform bion_take_land(owner, s.shape);
end;
$$;

-- ── 2. 근처 사람에게만 전달 ──
-- 지도를 약 5km 칸으로 나누고, 위치는 그 칸과 둘레 8칸을 보는 사람에게만 보냄
create or replace function public.bion_cell(lat float8, lng float8, out x integer, out y integer)
language sql
immutable
as $$
  select floor(lng / 0.05)::integer, floor(lat / 0.05)::integer
$$;

create or replace function public.bion_live_send(payload jsonb, event text, lat float8, lng float8)
returns void
language plpgsql
set search_path = public
as $$
declare
  c record;
  dx integer;
  dy integer;
begin
  select * into c from bion_cell(lat, lng);
  for dx in -1..1 loop
    for dy in -1..1 loop
      perform realtime.send(payload, event, format('live:%s:%s', c.x + dx, c.y + dy), true);
    end loop;
  end loop;
end;
$$;

-- 지금 내가 보고 있는 칸. 이 칸의 채널만 받을 수 있음
create table public.live_watchers (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  cell_x integer not null,
  cell_y integer not null,
  topic text not null,
  updated_at timestamptz not null default now()
);

alter table public.live_watchers enable row level security;

create policy "users read own watch"
  on public.live_watchers for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy "signed-in users receive live riding" on realtime.messages;

create policy "users receive live riding near them"
  on realtime.messages for select
  to authenticated
  using (
    extension = 'broadcast'
    and exists (
      select 1 from public.live_watchers w
      where w.user_id = (select auth.uid()) and w.topic = realtime.topic()
    )
  );

-- 내 위치의 칸을 등록하고, 받을 채널 이름과 근처에서 달리는 사람들을 돌려줌
create or replace function public.live_watch(lat float8, lng float8)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  me uuid := auth.uid();
  c record;
  prev live_watchers;
  t text;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  if abs(lat) > 90 or abs(lng) > 180 then
    raise exception 'invalid position';
  end if;
  select * into c from bion_cell(lat, lng);
  t := format('live:%s:%s', c.x, c.y);

  -- 여기저기 칸을 옮겨 다니며 다른 지역을 엿보지 못하게 (바로 옆 칸 이동은 허용)
  select * into prev from live_watchers where user_id = me;
  if found and prev.updated_at > now() - interval '30 seconds'
     and greatest(abs(prev.cell_x - c.x), abs(prev.cell_y - c.y)) > 1 then
    raise exception 'moving too fast';
  end if;

  insert into live_watchers (user_id, cell_x, cell_y, topic) values (me, c.x, c.y, t)
  on conflict (user_id) do update
    set cell_x = excluded.cell_x, cell_y = excluded.cell_y, topic = excluded.topic, updated_at = now();

  return json_build_object(
    'topic', t,
    'riders', (
      select coalesce(json_agg(json_build_object(
        'id', l.user_id,
        'name', p.nickname,
        'trail', coalesce(
          (select json_agg(json_build_array(st_y(d.geom), st_x(d.geom)) order by d.path) from st_dumppoints(l.trail) d),
          json_build_array(json_build_array(st_y(l.last_pt), st_x(l.last_pt)))
        )
      )), '[]'::json)
      from live_rides l
      join profiles p on p.id = l.user_id
      cross join lateral bion_cell(st_y(l.last_pt), st_x(l.last_pt)) k
      where l.user_id <> me
        and l.last_pt is not null
        and l.updated_at > now() - interval '2 minutes'
        and abs(k.x - c.x) <= 1
        and abs(k.y - c.y) <= 1
    )
  );
end;
$$;

create or replace function public.live_start()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in';
  end if;

  -- 앱이 꺼져서 끝 신호가 안 온 오래된 라이딩 정리
  delete from live_rides where updated_at < now() - interval '10 minutes';

  insert into live_rides (user_id) values (me)
  on conflict (user_id) do update
    set started_at = now(), updated_at = now(), last_pt = null, trail = null;
end;
$$;

-- 새 위치들 [[위도, 경도], ...] 를 순서대로 반영
create or replace function public.live_push(points jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  me uuid := auth.uid();
  nm text;
  cur live_rides;
  p jsonb;
  lat float8;
  lng float8;
  pt geometry;
  seg geometry;
  v record;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  if jsonb_typeof(points) <> 'array' or jsonb_array_length(points) > 200 then
    raise exception 'invalid points';
  end if;

  -- 끊기 판정은 한 번에 하나씩 (서로 동시에 끊는 경우 꼬이지 않도록)
  perform pg_advisory_xact_lock(hashtext('bion_live'));

  select * into cur from live_rides where user_id = me;
  if not found then
    return;
  end if;
  select nickname into nm from profiles where id = me;

  for p in select * from jsonb_array_elements(points) loop
    lat := (p ->> 0)::float8;
    lng := (p ->> 1)::float8;
    continue when lat is null or lng is null or abs(lat) > 90 or abs(lng) > 180;
    pt := st_setsrid(st_makepoint(lng, lat), 4326);

    if cur.last_pt is not null then
      seg := st_makeline(cur.last_pt, pt);
      -- 지금 달리는 중인 다른 사람의 경로를 가로질렀으면 그 사람 경로를 끊음
      for v in
        select l.user_id, l.last_pt, pr.nickname
        from live_rides l
        join profiles pr on pr.id = l.user_id
        where l.user_id <> me
          and l.trail is not null
          and l.updated_at > now() - interval '2 minutes'
          and l.trail && seg
          and st_crosses(seg, l.trail)
      loop
        update live_rides set trail = null where user_id = v.user_id;
        insert into ride_cuts (user_id, at_pt) values (v.user_id, v.last_pt);
        perform bion_live_send(
          jsonb_build_object('victim', v.user_id, 'victimName', v.nickname, 'by', me, 'byName', nm),
          'cut', lat, lng);
      end loop;
      cur.trail := case when cur.trail is null then seg else st_addpoint(cur.trail, pt) end;
    end if;
    cur.last_pt := pt;

    perform bion_live_send(jsonb_build_object('id', me, 'name', nm, 'lat', lat, 'lng', lng), 'pos', lat, lng);
  end loop;

  update live_rides
     set last_pt = cur.last_pt, trail = cur.trail, updated_at = now()
   where user_id = me;
end;
$$;

create or replace function public.live_end()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  me uuid := auth.uid();
  pt geometry;
begin
  if me is null then
    return;
  end if;
  delete from live_rides where user_id = me returning last_pt into pt;
  if pt is not null then
    perform bion_live_send(jsonb_build_object('id', me), 'end', st_y(pt), st_x(pt));
  end if;
end;
$$;

-- 전체 공개되던 함수는 live_watch 로 대체
drop function public.live_snapshot();

revoke execute on function public.bion_after_cut(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.bion_claim_ride(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.bion_live_send(jsonb, text, float8, float8) from public, anon, authenticated;
revoke execute on function public.live_watch(float8, float8) from public, anon;
grant execute on function public.live_watch(float8, float8) to authenticated;
