-- Sign-up with a username, a name and a password. Cinnabar collects no email address.
-- Supabase sign-in needs an address-shaped login ID, so the username is stored as <username>@users.cinnabar.invalid:
-- made up here, never typed by anyone and never mailed (.invalid can't receive mail). Accounts are created confirmed.
drop function if exists public.cinnabar_signup(text, text, text);
drop function if exists public.cinnabar_signup(text, text, text, boolean);   -- the old email sign-up
-- The account type is chosen first: student, teacher or work. Work accounts have no Classroom.
alter table public.profiles add column if not exists kind text check (kind in ('student', 'teacher', 'work'));
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;   -- people can't change their own type
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
