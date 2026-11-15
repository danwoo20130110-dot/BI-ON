-- 이번 선이 이미 가진 내 땅(예전 선·도형)과 이어져 막힌 칸을 만들면 그 칸도 색칠
-- 남이 내 선을 끊어 두었으면 그 틈으로 열려 있어서 칠해지지 않음
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

revoke execute on function public.bion_claim_ride(uuid, uuid, jsonb) from public, anon, authenticated;

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
