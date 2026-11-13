-- Cinnabar schema (Supabase / Postgres). Idempotent: safe to run again.
-- Data access is enforced by Row-Level Security: a user sees files they own,
-- files shared with their email, or files whose link access is open to signed-in users.

create extension if not exists pgcrypto;

-- ── profiles ───────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  display_name text,
  created_at timestamptz not null default now()
);
-- an education (school) account: picked at sign-up, self-declared; it turns on Cesium (db/cesium.sql)
alter table public.profiles add column if not exists edu boolean not null default false;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, email, display_name, edu)
  values (new.id, new.email, coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
          coalesce((new.raw_user_meta_data ->> 'edu')::boolean, false))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── files: folders, docs, sheets, slides ─────────────────────────────────────
create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('folder', 'doc', 'sheet', 'slides')),
  title text not null default 'Untitled',
  parent uuid references public.files(id) on delete cascade,
  content jsonb not null default '{}'::jsonb,
  starred boolean not null default false,
  trashed boolean not null default false,
  link_access text not null default 'none' check (link_access in ('none', 'view', 'edit')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create index if not exists files_owner_idx on public.files(owner);
create index if not exists files_parent_idx on public.files(parent);
create index if not exists files_updated_idx on public.files(updated_at desc);

create table if not exists public.shares (
  file_id uuid not null references public.files(id) on delete cascade,
  email text not null,
  role text not null check (role in ('viewer', 'editor')),
  created_at timestamptz not null default now(),
  primary key (file_id, email)
);

-- Direct access (owner or shared by email). Link access is NOT included here, so
-- link-shared files can't be listed — they're reachable only via open_file(id).
create or replace function public.can_access(f uuid, need text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from files where id = f and owner = auth.uid())
    or exists (
      select 1 from shares s where s.file_id = f
        and lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and (need = 'view' or s.role = 'editor'));
$$;

create or replace function public.is_owner(f uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from files where id = f and owner = auth.uid());
$$;

-- Open a file by id: direct access, or "anyone with the link" access.
create or replace function public.open_file(f uuid) returns setof public.files
language sql stable security definer set search_path = public as $$
  select * from files where id = f and not trashed
    and (public.can_access(f, 'view') or link_access in ('view', 'edit'));
$$;

-- Save title/content: direct editors, or anyone with an edit link.
create or replace function public.save_file(f uuid, new_title text, new_content jsonb) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare ts timestamptz;
begin
  if auth.uid() is null then raise exception 'sign in required'; end if;
  update files set title = coalesce(new_title, title), content = coalesce(new_content, content)
   where id = f and (public.can_access(f, 'edit') or link_access = 'edit')
   returning updated_at into ts;
  if ts is null then raise exception 'no edit access to this file'; end if;
  return ts;
end $$;
revoke execute on function public.open_file(uuid) from anon;
revoke execute on function public.save_file(uuid, text, jsonb) from anon;

-- Editors may change content and title; only the owner changes ownership, sharing, location and trash.
create or replace function public.files_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.owner is distinct from auth.uid() then
    new.owner := old.owner; new.link_access := old.link_access; new.parent := old.parent;
    new.trashed := old.trashed; new.starred := old.starred;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists files_guard on public.files;
create trigger files_guard before update on public.files for each row execute function public.files_guard();

alter table public.profiles enable row level security;
alter table public.files enable row level security;
alter table public.shares enable row level security;

drop policy if exists "profiles readable by signed-in users" on public.profiles;
create policy "profiles readable by signed-in users" on public.profiles for select to authenticated using (true);
drop policy if exists "own profile editable" on public.profiles;
create policy "own profile editable" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "read accessible files" on public.files;
create policy "read accessible files" on public.files for select to authenticated
  using (owner = auth.uid() or public.can_access(id, 'view'));
drop policy if exists "create own files" on public.files;
create policy "create own files" on public.files for insert to authenticated
  with check (owner = auth.uid() and (parent is null or public.is_owner(parent)));
drop policy if exists "edit editable files" on public.files;
create policy "edit editable files" on public.files for update to authenticated using (owner = auth.uid() or public.can_access(id, 'edit'))
  with check ((owner = auth.uid() or public.can_access(id, 'edit')) and (parent is null or public.is_owner(parent)));
drop policy if exists "owner deletes" on public.files;
create policy "owner deletes" on public.files for delete to authenticated using (owner = auth.uid());

drop policy if exists "see shares of my files or shared with me" on public.shares;
create policy "see shares of my files or shared with me" on public.shares for select to authenticated
  using (public.is_owner(file_id) or lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
drop policy if exists "owner manages shares" on public.shares;
create policy "owner manages shares" on public.shares for all to authenticated
  using (public.is_owner(file_id)) with check (public.is_owner(file_id));

-- Live collaboration uses Supabase Realtime broadcast/presence channels ("file:<id>"):
-- clients announce saves and re-fetch through open_file(), so access checks always apply.

-- ── storage: images inserted into docs and slides ────────────────────────────
insert into storage.buckets (id, name, public) values ('cinnabar', 'cinnabar', true) on conflict (id) do nothing;
drop policy if exists "cinnabar uploads into own folder" on storage.objects;
create policy "cinnabar uploads into own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'cinnabar' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "cinnabar owners delete" on storage.objects;
create policy "cinnabar owners delete" on storage.objects for delete to authenticated
  using (bucket_id = 'cinnabar' and (storage.foldername(name))[1] = auth.uid()::text);
