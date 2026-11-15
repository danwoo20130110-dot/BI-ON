-- 내 라이딩 전체 합계 (앱은 최근 기록만 받아 두므로 합계는 서버에서 셈)
create or replace function public.my_ride_totals()
returns json
language sql
stable
set search_path = public
as $$
  select json_build_object(
    'count', count(*),
    'km', coalesce(sum(distance_km), 0),
    'sec', coalesce(sum(duration_sec), 0),
    'maxKmh', coalesce(max(max_kmh), 0)
  )
  from rides
  where user_id = auth.uid()
$$;

revoke execute on function public.my_ride_totals() from public, anon;
grant execute on function public.my_ride_totals() to authenticated;
