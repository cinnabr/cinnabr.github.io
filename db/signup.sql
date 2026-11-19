-- Sign-up with a username, a name and a password. Cinnabar collects no email address.
-- Supabase sign-in needs an address-shaped login ID, so the username is stored as <username>@users.cinnabar.invalid:
-- made up here, never typed by anyone and never mailed (.invalid can't receive mail). Accounts are created confirmed.
drop function if exists public.cinnabar_signup(text, text, text);
drop function if exists public.cinnabar_signup(text, text, text, boolean);   -- the old email sign-up
-- The account type is chosen first: student, teacher or work. Work accounts have no Classroom.
alter table public.profiles add column if not exists kind text check (kind in ('student', 'teacher', 'work'));
revoke update on public.profiles from authenticated;
alter table public.profiles add column if not exists photo text;
grant update (display_name, photo) on public.profiles to authenticated;   -- people can't change their own type
drop function if exists public.cinnabar_signup_user(text, text, text, boolean);
create or replace function public.cinnabar_signup_user(p_username text, p_password text, p_name text, p_kind text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := gen_random_uuid();
  u text := lower(trim(coalesce(p_username, '')));
  e text;
  n text := left(nullif(trim(coalesce(p_name, '')), ''), 80);
begin
  if u !~ '^[a-z0-9][a-z0-9._-]{2,23}$' then
    raise exception 'Usernames are 3 to 24 letters, numbers, dots, dashes or underscores.';
  end if;
  if n is null then raise exception 'Enter your name.'; end if;
  if p_kind is null or p_kind not in ('student', 'teacher', 'work') then raise exception 'Choose Student, Teacher or Work.'; end if;
  if length(coalesce(p_password, '')) < 6 or length(p_password) > 72 then
    raise exception 'Password must be 6 to 72 characters.';
  end if;
  e := u || '@users.cinnabar.invalid';
  if exists (select 1 from auth.users x where lower(x.email) = e) then
    raise exception 'User already registered';
  end if;
  if (select count(*) from auth.users x where x.created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Too many sign-ups right now. Try again in a minute.';
  end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current,
      reauthentication_token, phone_change, phone_change_token, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', e,
      extensions.crypt(p_password, extensions.gen_salt('bf', 10)), now(), '', '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', n, 'username', u, 'kind', p_kind, 'edu', p_kind <> 'work'), now(), now());
  insert into auth.identities (id, user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, 'email', uid::text,
      jsonb_build_object('sub', uid::text, 'email', e, 'email_verified', false), now(), now(), now());
  update public.profiles set kind = p_kind, edu = p_kind <> 'work' where id = uid;
end $$;
revoke all on function public.cinnabar_signup_user(text, text, text, text) from public;
grant execute on function public.cinnabar_signup_user(text, text, text, text) to anon, authenticated;

-- Security phrase for "Forgot it?": stored only as a bcrypt hash; 5 wrong tries an hour per account.
create table if not exists public.cb_recovery (uid uuid primary key references auth.users(id) on delete cascade, phrase text not null, set_at timestamptz not null default now());
create table if not exists public.cb_recover_tries (uid uuid not null, hour timestamptz not null, n int not null default 0, primary key (uid, hour));
alter table public.cb_recovery enable row level security;
alter table public.cb_recover_tries enable row level security;
revoke all on public.cb_recovery, public.cb_recover_tries from anon, authenticated;
create or replace function public.cb_phrase_norm(p text) returns text language sql immutable set search_path = '' as $$
  select lower(regexp_replace(trim(coalesce(p, '')), '\s+', ' ', 'g')) $$;
create or replace function public.cb_has_phrase() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.cb_recovery where uid = (select auth.uid())) $$;
create or replace function public.cb_set_phrase(p_phrase text, p_password text) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); ph text := public.cb_phrase_norm(p_phrase);
begin
  if me is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  if not exists (select 1 from auth.users where id = me and encrypted_password = extensions.crypt(coalesce(p_password, ''), encrypted_password)) then
    raise exception 'Wrong password' using errcode = '28P01';
  end if;
  if length(ph) < 12 or length(ph) > 200 or array_length(string_to_array(ph, ' '), 1) < 3 then
    raise exception 'Use at least 3 words and 12 characters.';
  end if;
  if ph = public.cb_phrase_norm(p_password) then raise exception 'The phrase can''t be your password.'; end if;
  insert into public.cb_recovery (uid, phrase, set_at) values (me, extensions.crypt(ph, extensions.gen_salt('bf', 10)), now())
    on conflict (uid) do update set phrase = excluded.phrase, set_at = now();
end $$;
-- True when the password was reset. False for any wrong username or phrase, so it doesn't reveal which usernames exist.
create or replace function public.cb_recover(p_username text, p_phrase text, p_new_password text) returns boolean language plpgsql security definer set search_path = '' as $$
declare u text := lower(trim(coalesce(p_username, ''))); v_uid uuid; h text; tries int;
begin
  if length(coalesce(p_new_password, '')) < 6 or length(p_new_password) > 72 then raise exception 'Password must be 6 to 72 characters.'; end if;
  if position('@' in u) = 0 then u := u || '@users.cinnabar.invalid'; end if;
  select x.id into v_uid from auth.users x where lower(x.email) = u;
  if v_uid is null then perform extensions.crypt('x', extensions.gen_salt('bf', 10)); return false; end if;
  insert into public.cb_recover_tries as t (uid, hour, n) values (v_uid, date_trunc('hour', now()), 1)
    on conflict (uid, hour) do update set n = t.n + 1 returning n into tries;
  if tries > 5 then raise exception 'Too many tries for this account. Wait an hour.' using errcode = '53400'; end if;
  select phrase into h from public.cb_recovery where uid = v_uid;
  if h is null or h <> extensions.crypt(public.cb_phrase_norm(p_phrase), h) then return false; end if;
  update auth.users set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)), updated_at = now() where auth.users.id = v_uid;
  if to_regclass('auth.refresh_tokens') is not null then execute 'delete from auth.refresh_tokens where user_id = $1::text' using v_uid::text; end if;
  if to_regclass('auth.sessions') is not null then execute 'delete from auth.sessions where user_id = $1' using v_uid; end if;
  delete from public.cb_recover_tries where uid = v_uid;
  return true;
end $$;
revoke all on function public.cb_has_phrase(), public.cb_set_phrase(text, text), public.cb_recover(text, text, text) from public;
grant execute on function public.cb_has_phrase(), public.cb_set_phrase(text, text) to authenticated;
grant execute on function public.cb_recover(text, text, text) to anon, authenticated;
create or replace function public.cb_change_password(p_old text, p_new text) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  if length(coalesce(p_new, '')) < 6 or length(p_new) > 72 then raise exception 'Password must be 6 to 72 characters.'; end if;
  if not exists (select 1 from auth.users where id = me and encrypted_password = extensions.crypt(coalesce(p_old, ''), encrypted_password)) then
    raise exception 'Wrong password' using errcode = '28P01';
  end if;
  update auth.users set encrypted_password = extensions.crypt(p_new, extensions.gen_salt('bf', 10)), updated_at = now() where id = me;
end $$;
revoke all on function public.cb_change_password(text, text) from public;
grant execute on function public.cb_change_password(text, text) to authenticated;
