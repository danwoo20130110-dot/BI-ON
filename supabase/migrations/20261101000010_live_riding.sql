-- 실시간 라이딩: 달리는 중 위치를 서버로 보내고, 서버가 경로 끊기를 판정해 모두에게 알림
--  · 위치·끊기 알림은 Realtime 비공개 채널 'live' 로 전달 (로그인한 사용자만 받음)
--  · 다른 사람이 달리는 중인 내 경로를 가로지르면 그때까지의 내 경로는 끊김
create table public.live_rides (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_pt extensions.geometry(Point, 4326),
  -- 마지막으로 끊긴 뒤부터의 경로
  trail extensions.geometry(LineString, 4326)
);

create index live_rides_trail_idx on public.live_rides using gist (trail);

-- 직접 읽고 쓰기는 막고 아래 함수로만
alter table public.live_rides enable row level security;

-- 로그인한 사용자만 'live' 채널 방송을 받을 수 있음 (보내기는 서버 함수만)
create policy "signed-in users receive live riding"
  on realtime.messages for select
  to authenticated
  using (realtime.topic() = 'live' and extension = 'broadcast');

create or replace function public.live_start()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  me uuid := auth.uid();
  nm text;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  select nickname into nm from profiles where id = me;

  -- 앱이 꺼져서 끝 신호가 안 온 오래된 라이딩 정리
  delete from live_rides where updated_at < now() - interval '10 minutes';

  insert into live_rides (user_id) values (me)
  on conflict (user_id) do update
    set started_at = now(), updated_at = now(), last_pt = null, trail = null;

  perform realtime.send(jsonb_build_object('id', me, 'name', nm), 'start', 'live', true);
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
        select l.user_id, pr.nickname
        from live_rides l
        join profiles pr on pr.id = l.user_id
        where l.user_id <> me
          and l.trail is not null
          and l.updated_at > now() - interval '2 minutes'
          and l.trail && seg
          and st_crosses(seg, l.trail)
      loop
        update live_rides set trail = null where user_id = v.user_id;
        perform realtime.send(
          jsonb_build_object('victim', v.user_id, 'victimName', v.nickname, 'by', me, 'byName', nm),
          'cut', 'live', true);
      end loop;
      cur.trail := case when cur.trail is null then seg else st_addpoint(cur.trail, pt) end;
    end if;
    cur.last_pt := pt;

    perform realtime.send(jsonb_build_object('id', me, 'name', nm, 'lat', lat, 'lng', lng), 'pos', 'live', true);
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
begin
  if me is null then
    return;
  end if;
  delete from live_rides where user_id = me;
  perform realtime.send(jsonb_build_object('id', me), 'end', 'live', true);
end;
$$;

-- 접속했을 때 지금 달리는 중인 사람들과 (끊긴 뒤부터의) 경로
create or replace function public.live_snapshot()
returns json
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(json_agg(json_build_object(
    'id', l.user_id,
    'name', p.nickname,
    'trail', coalesce(
      (select json_agg(json_build_array(st_y(d.geom), st_x(d.geom)) order by d.path) from st_dumppoints(l.trail) d),
      case when l.last_pt is null then '[]'::json
           else json_build_array(json_build_array(st_y(l.last_pt), st_x(l.last_pt))) end
    )
  )), '[]'::json)
  from live_rides l
  join profiles p on p.id = l.user_id
  where l.user_id <> auth.uid()
    and l.updated_at > now() - interval '2 minutes'
$$;

revoke execute on function public.live_start() from public, anon;
revoke execute on function public.live_push(jsonb) from public, anon;
revoke execute on function public.live_end() from public, anon;
revoke execute on function public.live_snapshot() from public, anon;
grant execute on function public.live_start() to authenticated;
grant execute on function public.live_push(jsonb) to authenticated;
grant execute on function public.live_end() to authenticated;
grant execute on function public.live_snapshot() to authenticated;
