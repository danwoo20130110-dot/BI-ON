-- 회원 탈퇴: 내 계정과 모든 데이터를 바로 삭제 (Google Play 계정 삭제 요건)
-- auth.users 를 지우면 profiles → rides·claims·territories·live_rides·ride_cuts·live_watchers 가 함께 지워짐
-- 프로필 사진(Storage)은 앱이 먼저 지움
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = me;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
