-- 랭킹: 땅 넓이(km²) 기준 개인·학교 순위
-- 목록은 땅이 있는 사람·학교만, 내 순위는 땅이 없어도 항상 포함
create or replace function public.ranking(kind text, lim integer default 50)
returns json
language sql
stable
set search_path = public
as $$
  with riders as (
    select p.id, p.nickname, p.school_name, p.school_key, p.avatar_path, p.updated_at,
           coalesce(t.area_km2, 0) as area,
           rank() over (order by coalesce(t.area_km2, 0) desc) as rk
    from profiles p
    left join territories t on t.user_id = p.id
  ),
  schools as (
    select school_key, min(school_name) as name, sum(area) as area, count(*) as riders,
           rank() over (order by sum(area) desc) as rk
    from riders
    where school_key is not null
    group by school_key
  ),
  me as (
    select * from riders where id = auth.uid()
  )
  select case when kind = 'school' then
    json_build_object(
      'total', (select count(*) from schools),
      'rows', coalesce((
        select json_agg(json_build_object('id', x.school_key, 'rank', x.rk, 'name', x.name, 'area', x.area, 'riders', x.riders) order by x.rk, x.name)
        from (select * from schools where area > 0 order by rk, name limit least(lim, 200)) x
      ), '[]'),
      'me', (
        select json_build_object('id', s.school_key, 'rank', s.rk, 'name', s.name, 'area', s.area, 'riders', s.riders)
        from schools s
        where s.school_key = (select school_key from me)
      )
    )
  else
    json_build_object(
      'total', (select count(*) from riders),
      'rows', coalesce((
        select json_agg(json_build_object(
          'id', x.id, 'rank', x.rk, 'name', x.nickname, 'school', x.school_name, 'area', x.area,
          'avatar', x.avatar_path, 'v', x.updated_at) order by x.rk, x.nickname)
        from (select * from riders where area > 0 order by rk, nickname limit least(lim, 200)) x
      ), '[]'),
      'me', (
        select json_build_object(
          'id', m.id, 'rank', m.rk, 'name', m.nickname, 'school', m.school_name, 'area', m.area,
          'avatar', m.avatar_path, 'v', m.updated_at)
        from me m
      )
    )
  end
  where auth.uid() is not null
$$;

revoke execute on function public.ranking(text, integer) from public, anon;
grant execute on function public.ranking(text, integer) to authenticated;
