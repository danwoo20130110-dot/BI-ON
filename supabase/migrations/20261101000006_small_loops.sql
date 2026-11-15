-- 출발점 근처로 돌아온 라이딩은 크기와 상관없이 안쪽 + 테두리 10m 만 땅
-- (예전에는 작은 한 바퀴가 직선 취급되어 경로 바깥으로 50m 씩 커졌음)
-- 같은 길을 갔다가 그대로 돌아온 경우처럼 안쪽 넓이가 거의 없으면 직선과 같이 양옆 50m 띠
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
