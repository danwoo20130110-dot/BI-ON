-- 이미 가입한 사용자의 학교를 학교 목록과 연결 (이름·지역이 정확히 같은 학교)
-- 연결되지 않은 경우(직접 입력 등)는 그대로 두고, 다음에 학교를 다시 고르면 연결됨
update public.profiles p
   set school_id = s.id
  from public.schools s
 where p.school_id is null
   and p.school_name = s.name
   and coalesce(p.school_region, '') = s.region;
