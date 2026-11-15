-- 내가 달린 선이 스스로 교차해 막힌 도형이 생기면 그 안을 모두 색칠
--  · 선 자체는 폭 1m
--  · 끝점이 출발점 20m 안이면 GPS 오차로 보고 이어 붙여서 닫힌 것으로 봄
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
  edges geometry;
  faces geometry;
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

  edges := line;
  if st_distance(st_startpoint(line)::geography, st_endpoint(line)::geography) < 20 then
    edges := st_collect(line, st_makeline(st_endpoint(line), st_startpoint(line)));
  end if;

  -- 교차점마다 선을 끊은 뒤 막힌 칸(면)을 모두 찾음
  select bion_polys(st_polygonize(d.geom))
    into faces
    from st_dump(st_node(edges)) d;

  -- GPS 흔들림으로 생긴 작은 칸(100m² 미만)이나 같은 길 왕복에서 생긴 가는 틈(폭 5m 미만)은 버림
  select st_setsrid(coalesce(st_multi(st_collect(d.geom)), 'MULTIPOLYGON EMPTY'::geometry), 4326)
    into faces
    from st_dump(faces) d
   where st_area(d.geom::geography) >= 100
     and 2 * st_area(d.geom::geography) / nullif(st_length(st_exteriorring(d.geom)::geography), 0) >= 5;
  is_loop := not st_isempty(faces);

  shape := bion_polys(st_buffer(line::geography, 0.5, 'quad_segs=2')::geometry);
  if is_loop then
    shape := bion_polys(st_union(shape, faces));
  end if;

  trimmed := bion_prune(shape);
  if not st_isempty(trimmed) then
    shape := trimmed;
  end if;
end;
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
