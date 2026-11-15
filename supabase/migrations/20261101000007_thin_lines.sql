-- 선(직선·왕복) 라이딩은 경로 그대로 폭 1m (양옆 0.5m) 만 땅
-- 한 바퀴 라이딩(안쪽 2000m² 이상)은 그대로 안쪽 + 테두리 10m
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
    is_loop := st_area(ring::geography) >= 2000;
  end if;

  if is_loop then
    shape := bion_polys(st_buffer(ring::geography, 10, 'quad_segs=4')::geometry);
  else
    shape := bion_polys(st_buffer(line::geography, 0.5, 'quad_segs=2')::geometry);
  end if;

  trimmed := bion_prune(shape);
  if not st_isempty(trimmed) then
    shape := trimmed;
  end if;
end;
$$;

-- 1m 폭 선 땅이 잘려도 사라지지 않도록 기준을 낮춤
-- 넓이 50m² 미만이거나 폭 0.5m 미만인 부스러기만 버림
create or replace function public.bion_prune(g extensions.geometry)
returns extensions.geometry
language sql
immutable
set search_path = public, extensions
as $$
  select st_setsrid(coalesce(st_multi(st_collect(d.geom)), 'MULTIPOLYGON EMPTY'::geometry), 4326)
  from st_dump(public.bion_polys(g)) d
  where st_area(d.geom::geography) >= 50
    -- 긴 띠의 폭 ≈ 2 × 넓이 ÷ 둘레
    and 2 * st_area(d.geom::geography) / nullif(st_length(st_exteriorring(d.geom)::geography), 0) >= 0.5
$$;

-- 지금까지의 땅을 새 규칙으로 처음부터 다시 계산
truncate public.claims, public.territories;

do $$
declare
  r record;
begin
  for r in select id, user_id, points from public.rides order by created_at loop
    begin
      perform public.bion_claim_ride(r.id, r.user_id, r.points);
    exception when others then
      raise warning 'land claim failed for ride %: %', r.id, sqlerrm;
    end;
  end loop;
end;
$$;
