-- 사진 덮어쓰기(upsert)는 기존 파일 조회 권한도 필요함
create policy "users read own avatar"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
