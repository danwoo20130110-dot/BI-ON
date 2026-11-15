-- 프로필: 가입할 때 auth.users 와 함께 자동 생성
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null unique check (char_length(nickname) between 2 and 12),
  school_name text check (char_length(school_name) <= 40),
  school_region text check (char_length(school_region) <= 40),
  -- 같은 학교 묶음용 (학교명|지역)
  school_key text generated always as (
    case when school_name is null or school_name = '' then null
         else school_name || '|' || coalesce(school_region, '') end
  ) stored,
  grade text check (char_length(grade) <= 10),
  bio text check (char_length(bio) <= 40),
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_school_key_idx on public.profiles (school_key);

alter table public.profiles enable row level security;

-- 로그인한 사용자는 모든 프로필을 볼 수 있음 (랭킹·땅 주인 표시)
create policy "profiles are readable by signed-in users"
  on public.profiles for select
  to authenticated
  using (true);

-- 자기 프로필만 수정
create policy "users update own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- 가입 시 입력한 정보(user metadata)로 프로필 생성
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nickname, school_name, school_region, grade)
  values (
    new.id,
    trim(new.raw_user_meta_data ->> 'nickname'),
    nullif(trim(new.raw_user_meta_data ->> 'school_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'school_region'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'grade'), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 가입 전에 닉네임 중복 확인 (로그인 전에도 호출 가능)
create or replace function public.nickname_available(name text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select not exists (select 1 from public.profiles where lower(nickname) = lower(trim(name)));
$$;

revoke all on function public.nickname_available(text) from public;
grant execute on function public.nickname_available(text) to anon, authenticated;

-- 프로필 사진: 누구나 볼 수 있고, 자기 폴더(사용자 id/)에만 올리고 지울 수 있음
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "users upload own avatar"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "users update own avatar"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "users delete own avatar"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
