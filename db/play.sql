-- Profile pictures, and class games wearing them. Safe to run again, before or after cesium.sql.

-- A small picture (the pages shrink it to 160x160 before saving), kept inline so it works without Storage.
alter table public.profiles add column if not exists photo text;
alter table public.profiles drop constraint if exists profiles_photo_check;
alter table public.profiles add constraint profiles_photo_check check (photo is null or (length(photo) <= 120000 and photo ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'));
grant update (photo) on public.profiles to authenticated;

create or replace function public.cb_photo_mirror() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if to_regclass('public.ce_profiles') is not null then execute 'update public.ce_profiles set photo = $1 where id = $2' using new.photo, new.id; end if;
  return new;
end $$;
drop trigger if exists cb_photo_mirror on public.profiles;
create trigger cb_photo_mirror after update of photo on public.profiles for each row execute function public.cb_photo_mirror();

create or replace function public.ce_photo_copy() returns trigger language plpgsql security definer set search_path = public as $$
begin new.photo := (select photo from profiles where id = new.id); return new; end $$;

do $$ begin
  if to_regclass('public.ce_profiles') is null then return; end if;
  alter table public.ce_profiles add column if not exists photo text;
  update public.ce_profiles c set photo = p.photo from public.profiles p where p.id = c.id and c.photo is distinct from p.photo;
  drop trigger if exists ce_photo_copy on public.ce_profiles;
  create trigger ce_photo_copy before insert on public.ce_profiles for each row execute function public.ce_photo_copy();
  -- the shop sells hats and backgrounds; every one of them has a price
  update public.ce_items set price = case rarity when 'common' then 40 when 'uncommon' then 80 when 'rare' then 150 when 'epic' then 250 when 'legendary' then 400 else 600 end
    where price is null and slot in ('head', 'background');
  update public.ce_items set price = null where slot in ('face', 'body') and price is not null;
end $$;
-- Server-side SQL (SQL editor, triggers run without a signed-in user) may touch game tables; web requests still need a school account.
do $$ begin
  if to_regclass('public.ce_profiles') is null then return; end if;
  create or replace function public.ce_is_edu() returns boolean language sql stable security definer set search_path = '' as $f$
    select case when (select auth.uid()) is null and coalesce(nullif(current_setting('role', true), ''), 'none') not in ('anon', 'authenticated')
      then true else coalesce((select edu from public.profiles where id = (select auth.uid())), false) end $f$;
end $$;
do $$ begin
  if to_regclass('public.ce_profiles') is null then return; end if;
  alter table public.ce_profiles alter column avatar_color set default '#e2361f';
  update public.ce_profiles set avatar_color = '#e2361f' where lower(avatar_color) in ('#7b4dff', '#6440c8', '#a68bff', '#8a5cf6', '#6b46e0');
  alter table public.ce_question_sets alter column color set default '#e2361f';
  update public.ce_question_sets set color = '#e2361f' where lower(color) in ('#6440c8', '#7b4dff');
  alter table public.ce_classes alter column color set default '#e2361f';
  update public.ce_classes set color = '#e2361f' where lower(color) in ('#6440c8', '#7b4dff', '#8a5cf6');
end $$;
