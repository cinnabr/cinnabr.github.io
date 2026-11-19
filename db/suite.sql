-- Cinnabar suite: Mail, Meet, Chat, Keep, Tasks and Contacts. Idempotent: safe to run again.
-- Everything is addressed by Cinnabar username. No email address is collected or stored: Mail only delivers between
-- Cinnabar accounts on this server, so nothing is sent to or received from the outside internet.
-- Run after schema.sql and signup.sql (and before ratelimit.sql, which adds write limits to these tables).

-- ── usernames ───────────────────────────────────────────────────────────────
-- A username is stored as the sign-in ID <username>@users.cinnabar.invalid (signup.sql). Older accounts typed a full address.
create or replace function public.cb_user_id(p_name text) returns uuid language sql stable security definer set search_path = public as $$
  select id from profiles
  where lower(email) = lower(trim(p_name)) || '@users.cinnabar.invalid' or (position('@' in p_name) > 0 and lower(email) = lower(trim(p_name)))
  limit 1 $$;
create or replace function public.cb_username(p_id uuid) returns text language sql stable security definer set search_path = public as $$
  select case when email like '%@users.cinnabar.invalid' then split_part(email, '@', 1) else email end from profiles where id = p_id $$;
revoke all on function public.cb_user_id(text), public.cb_username(uuid) from public, anon;
grant execute on function public.cb_user_id(text), public.cb_username(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- MAIL. A message is written once; each person who can see it has their own row in ml_boxes (folder, read, starred,
-- labels), so moving, deleting or labelling only changes your own copy. Bcc is visible only to the sender and that person.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.ml_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  sender uuid not null references auth.users(id) on delete cascade,
  subject text not null default '' check (length(subject) <= 300),
  body text not null default '' check (length(body) <= 200000),
  attachments jsonb not null default '[]'::jsonb,     -- [{id, title, kind}] Cinnabar Drive files, shared to the recipients on send
  reply_to uuid references public.ml_messages(id) on delete set null,
  sent_at timestamptz not null default now()
);
create index if not exists ml_messages_thread_idx on public.ml_messages(thread_id, sent_at);
create table if not exists public.ml_recipients (
  message_id uuid not null references public.ml_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('to', 'cc', 'bcc')),
  primary key (message_id, user_id)
);
create table if not exists public.ml_boxes (
  message_id uuid not null references public.ml_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  folder text not null check (folder in ('inbox', 'sent', 'archive', 'spam', 'trash')),
  read boolean not null default false,
  starred boolean not null default false,
  important boolean not null default false,
  labels text[] not null default '{}',
  snoozed_until timestamptz,
  thread_id uuid not null,
  sent_at timestamptz not null,
  primary key (message_id, user_id)
);
create index if not exists ml_boxes_user_idx on public.ml_boxes(user_id, folder, sent_at desc);
create table if not exists public.ml_drafts (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  to_list text not null default '', cc_list text not null default '', bcc_list text not null default '',
  subject text not null default '' check (length(subject) <= 300),
  body text not null default '' check (length(body) <= 200000),
  attachments jsonb not null default '[]'::jsonb,
  thread_id uuid, reply_to uuid,
  updated_at timestamptz not null default now()
);
create table if not exists public.ml_labels (
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  color text not null default '#e2361f' check (color ~ '^#[0-9a-fA-F]{6}$'),
  primary key (owner, name)
);
create table if not exists public.ml_blocks (   -- messages from a blocked person land in Spam
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  blocked uuid not null references auth.users(id) on delete cascade,
  primary key (owner, blocked)
);
create table if not exists public.ml_settings (
  owner uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  signature text not null default '' check (length(signature) <= 2000),
  vacation_on boolean not null default false,
  vacation_subject text not null default '' check (length(vacation_subject) <= 300),
  vacation_body text not null default '' check (length(vacation_body) <= 5000),
  undo_seconds int not null default 5 check (undo_seconds between 0 and 30)
);

create or replace function public.ml_can_see(m uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from ml_boxes where message_id = m and user_id = auth.uid()) $$;

alter table public.ml_messages enable row level security;
alter table public.ml_recipients enable row level security;
alter table public.ml_boxes enable row level security;
alter table public.ml_drafts enable row level security;
alter table public.ml_labels enable row level security;
alter table public.ml_blocks enable row level security;
alter table public.ml_settings enable row level security;
drop policy if exists "see my mail" on public.ml_messages;
create policy "see my mail" on public.ml_messages for select to authenticated using (ml_can_see(id));
drop policy if exists "see recipients" on public.ml_recipients;
create policy "see recipients" on public.ml_recipients for select to authenticated using (
  ml_can_see(message_id) and (kind <> 'bcc' or user_id = auth.uid() or exists (select 1 from ml_messages m where m.id = message_id and m.sender = auth.uid())));
drop policy if exists "my boxes" on public.ml_boxes;
drop policy if exists "file my mail" on public.ml_boxes;
drop policy if exists "delete my copy" on public.ml_boxes;
create policy "my boxes" on public.ml_boxes for select to authenticated using (user_id = auth.uid());
create policy "file my mail" on public.ml_boxes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete my copy" on public.ml_boxes for delete to authenticated using (user_id = auth.uid());
do $$ declare t text; begin
  foreach t in array array['ml_drafts', 'ml_labels', 'ml_blocks', 'ml_settings'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid())', t);
  end loop;
end $$;
-- messages, recipients and new boxes are only ever written by ml_send
revoke insert, update, delete on public.ml_messages, public.ml_recipients from authenticated;
revoke insert on public.ml_boxes from authenticated;
revoke update on public.ml_boxes from authenticated;
grant update (folder, read, starred, important, labels, snoozed_until) on public.ml_boxes to authenticated;
grant select on public.ml_messages, public.ml_recipients, public.ml_boxes to authenticated;
grant select, insert, update, delete on public.ml_drafts, public.ml_labels, public.ml_blocks, public.ml_settings to authenticated;
-- users can't move their own copy into a folder that pretends they sent it
create or replace function public.ml_box_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.folder = 'sent' and old.folder <> 'sent' then raise exception 'Only sent mail goes in Sent'; end if;
  if old.folder = 'sent' and new.folder not in ('sent', 'trash', 'archive') then raise exception 'Sent mail can only be archived or deleted'; end if;
  new.message_id := old.message_id; new.user_id := old.user_id; new.thread_id := old.thread_id; new.sent_at := old.sent_at;
  return new;
end $$;
drop trigger if exists ml_box_guard on public.ml_boxes;
create trigger ml_box_guard before update on public.ml_boxes for each row execute function public.ml_box_guard();

-- Sends a message to Cinnabar usernames. Returns the new message id.
-- p_to / p_cc / p_bcc are lists of usernames. Attachments must be Drive files the sender owns; they are shared (view) with everyone.
create or replace function public.ml_send(p_to text[], p_cc text[], p_bcc text[], p_subject text, p_body text,
    p_reply_to uuid default null, p_attachments jsonb default '[]'::jsonb, p_draft uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid(); mid uuid := gen_random_uuid(); tid uuid; n text; u uuid; k text; a jsonb;
  seen uuid[] := '{}'; unknown text[] := '{}'; total int := 0; now_ts timestamptz := now();
begin
  if me is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  if p_reply_to is not null then
    if not ml_can_see(p_reply_to) then raise exception 'That message isn''t yours to reply to' using errcode = '42501'; end if;
    select thread_id into tid from ml_messages where id = p_reply_to;
  end if;
  tid := coalesce(tid, mid);
  if jsonb_typeof(coalesce(p_attachments, '[]')) <> 'array' or jsonb_array_length(coalesce(p_attachments, '[]')) > 25 then raise exception 'Too many attachments'; end if;
  for a in select * from jsonb_array_elements(coalesce(p_attachments, '[]')) loop
    if not exists (select 1 from files where id = (a ->> 'id')::uuid and owner = me) then raise exception 'You can only attach files you own'; end if;
  end loop;
  insert into ml_messages (id, thread_id, sender, subject, body, attachments, reply_to, sent_at)
    values (mid, tid, me, left(coalesce(p_subject, ''), 300), coalesce(p_body, ''), coalesce(p_attachments, '[]'), p_reply_to, now_ts);
  insert into ml_boxes (message_id, user_id, folder, read, thread_id, sent_at) values (mid, me, 'sent', true, tid, now_ts);
  foreach k in array array['to', 'cc', 'bcc'] loop
    foreach n in array coalesce(case k when 'to' then p_to when 'cc' then p_cc else p_bcc end, '{}') loop
      n := trim(both ' ,;' from n); continue when n = '';
      u := cb_user_id(n);
      if u is null then unknown := unknown || n; continue; end if;
      continue when u = any(seen);
      seen := seen || u; total := total + 1;
      insert into ml_recipients (message_id, user_id, kind) values (mid, u, k);
      if u <> me then
        insert into ml_boxes (message_id, user_id, folder, thread_id, sent_at)
          values (mid, u, case when exists (select 1 from ml_blocks where owner = u and blocked = me) then 'spam' else 'inbox' end, tid, now_ts);
        for a in select * from jsonb_array_elements(coalesce(p_attachments, '[]')) loop
          insert into shares (file_id, email, role) select (a ->> 'id')::uuid, p.email, 'viewer' from profiles p where p.id = u on conflict do nothing;
        end loop;
      end if;
    end loop;
  end loop;
  if array_length(unknown, 1) > 0 then raise exception 'No Cinnabar account is called: %', array_to_string(unknown, ', ') using errcode = 'P0001'; end if;
  if total = 0 then raise exception 'Add at least one person to send to'; end if;
  if total > 200 then raise exception 'That''s more than 200 people. Use a group or a Chat space.'; end if;
  if p_draft is not null then delete from ml_drafts where id = p_draft and owner = me; end if;
  -- out of office: one automatic reply per sender per day
  insert into ml_messages (id, thread_id, sender, subject, body, reply_to, sent_at)
    select gen_random_uuid(), tid, s.owner, coalesce(nullif(s.vacation_subject, ''), 'Out of office'), s.vacation_body, mid, now_ts + interval '1 second'
    from ml_settings s join ml_recipients r on r.user_id = s.owner and r.message_id = mid
    where s.vacation_on and s.owner <> me
      and not exists (select 1 from ml_messages x join ml_recipients y on y.message_id = x.id and y.user_id = me
                      where x.sender = s.owner and x.reply_to is not null and x.sent_at > now_ts - interval '1 day' and x.body = s.vacation_body);
  insert into ml_recipients (message_id, user_id, kind) select x.id, me, 'to' from ml_messages x where x.reply_to = mid and x.sender <> me on conflict do nothing;
  insert into ml_boxes (message_id, user_id, folder, thread_id, sent_at) select x.id, me, 'inbox', tid, x.sent_at from ml_messages x where x.reply_to = mid and x.sender <> me on conflict do nothing;
  insert into ml_boxes (message_id, user_id, folder, read, thread_id, sent_at) select x.id, x.sender, 'sent', true, tid, x.sent_at from ml_messages x where x.reply_to = mid and x.sender <> me on conflict do nothing;
  return mid;
end $$;
revoke all on function public.ml_send(text[], text[], text[], text, text, uuid, jsonb, uuid) from public, anon;
grant execute on function public.ml_send(text[], text[], text[], text, text, uuid, jsonb, uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- MEET. A meeting has a code (abc-defg-hij). Everyone in it is a row in mt_participants (refreshed every few seconds);
-- the browsers connect to each other directly (WebRTC) and use mt_signals to exchange connection offers.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.mt_rooms (
  code text primary key check (code ~ '^[a-z]{3}-[a-z]{4}-[a-z]{3}$'),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '' check (length(title) <= 120),
  locked boolean not null default false,             -- locked: only people already in, and the owner, can (re)join
  starts_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.mt_participants (
  code text not null references public.mt_rooms(code) on delete cascade,
  peer uuid not null,                                -- one per browser tab
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mic boolean not null default true, cam boolean not null default true, hand boolean not null default false, sharing boolean not null default false,
  joined_at timestamptz not null default now(),
  seen_at timestamptz not null default now(),
  primary key (code, peer)
);
create table if not exists public.mt_signals (
  id bigint generated always as identity primary key,
  code text not null references public.mt_rooms(code) on delete cascade,
  from_peer uuid not null, to_peer uuid not null,
  from_user uuid not null default auth.uid(), to_user uuid not null,
  kind text not null check (kind in ('offer', 'answer', 'ice', 'bye')),
  payload jsonb not null check (length(payload::text) <= 20000),
  created_at timestamptz not null default now()
);
create index if not exists mt_signals_to_idx on public.mt_signals(to_peer, id);
create table if not exists public.mt_chat (
  id bigint generated always as identity primary key,
  code text not null references public.mt_rooms(code) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create or replace function public.mt_in_room(c text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from mt_participants where code = c and user_id = auth.uid() and seen_at > now() - interval '1 minute') $$;
alter table public.mt_rooms enable row level security;
alter table public.mt_participants enable row level security;
alter table public.mt_signals enable row level security;
alter table public.mt_chat enable row level security;
drop policy if exists "rooms by code" on public.mt_rooms;
drop policy if exists "start a meeting" on public.mt_rooms;
drop policy if exists "owner changes room" on public.mt_rooms;
drop policy if exists "owner ends room" on public.mt_rooms;
create policy "rooms by code" on public.mt_rooms for select to authenticated using (true);   -- knowing the code is the invitation, like Meet links
create policy "start a meeting" on public.mt_rooms for insert to authenticated with check (owner = auth.uid());
create policy "owner changes room" on public.mt_rooms for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "owner ends room" on public.mt_rooms for delete to authenticated using (owner = auth.uid());
drop policy if exists "see people in my meeting" on public.mt_participants;
drop policy if exists "join" on public.mt_participants;
drop policy if exists "update myself" on public.mt_participants;
drop policy if exists "leave or remove" on public.mt_participants;
create policy "see people in my meeting" on public.mt_participants for select to authenticated using (mt_in_room(code) or user_id = auth.uid());
create policy "join" on public.mt_participants for insert to authenticated with check (
  user_id = auth.uid() and (not (select locked from mt_rooms r where r.code = mt_participants.code) or (select owner from mt_rooms r where r.code = mt_participants.code) = auth.uid()));
create policy "update myself" on public.mt_participants for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "leave or remove" on public.mt_participants for delete to authenticated using (user_id = auth.uid() or (select owner from mt_rooms r where r.code = mt_participants.code) = auth.uid());
drop policy if exists "my signals" on public.mt_signals;
drop policy if exists "send signals" on public.mt_signals;
drop policy if exists "clear my signals" on public.mt_signals;
create policy "my signals" on public.mt_signals for select to authenticated using (to_user = auth.uid());
create policy "send signals" on public.mt_signals for insert to authenticated with check (from_user = auth.uid() and mt_in_room(code)
  and exists (select 1 from mt_participants p where p.code = mt_signals.code and p.peer = mt_signals.to_peer and p.user_id = mt_signals.to_user));
create policy "clear my signals" on public.mt_signals for delete to authenticated using (to_user = auth.uid() or from_user = auth.uid());
drop policy if exists "meeting chat" on public.mt_chat;
drop policy if exists "say in meeting" on public.mt_chat;
create policy "meeting chat" on public.mt_chat for select to authenticated using (mt_in_room(code));
create policy "say in meeting" on public.mt_chat for insert to authenticated with check (user_id = auth.uid() and mt_in_room(code));
grant select, insert, update, delete on public.mt_rooms, public.mt_participants, public.mt_signals, public.mt_chat to authenticated;
-- "last seen" always uses the server clock, so a wrong clock on someone's computer can't keep them in a meeting or drop them
create or replace function public.mt_seen() returns trigger language plpgsql as $$ begin new.seen_at := now(); new.user_id := old.user_id; new.code := old.code; new.peer := old.peer; return new; end $$;
drop trigger if exists mt_seen on public.mt_participants;
create trigger mt_seen before update on public.mt_participants for each row execute function public.mt_seen();
-- the owner can mute someone (mic off) but nobody can turn another person's mic or camera on
create or replace function public.mt_mute(p_code text, p_peer uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if (select owner from mt_rooms where code = p_code) is distinct from auth.uid() then raise exception 'Only the host can do that' using errcode = '42501'; end if;
  update mt_participants set mic = false where code = p_code and peer = p_peer;
end $$;
grant execute on function public.mt_mute(text, uuid) to authenticated;
revoke execute on function public.mt_mute(text, uuid) from anon, public;

-- ════════════════════════════════════════════════════════════════════════════
-- CHAT. Direct messages and spaces (group conversations).
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.ch_spaces (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('dm', 'space')),
  name text check (name is null or length(trim(name)) between 1 and 80),
  description text not null default '' check (length(description) <= 500),
  dm_key text unique,                                -- "<smaller id>:<larger id>" for a DM, so there is only one per pair
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_at timestamptz not null default now()
);
create table if not exists public.ch_members (
  space_id uuid not null references public.ch_spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('manager', 'member')),
  read_at timestamptz not null default now(),
  muted boolean not null default false,
  primary key (space_id, user_id)
);
create index if not exists ch_members_user_idx on public.ch_members(user_id);
create table if not exists public.ch_messages (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.ch_spaces(id) on delete cascade,
  author uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (length(body) between 1 and 8000),
  reply_to uuid references public.ch_messages(id) on delete set null,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted boolean not null default false
);
create index if not exists ch_messages_space_idx on public.ch_messages(space_id, created_at);
create table if not exists public.ch_reactions (
  message_id uuid not null references public.ch_messages(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  emoji text not null check (length(emoji) between 1 and 16),
  primary key (message_id, user_id, emoji)
);
create or replace function public.ch_is_member(s uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from ch_members where space_id = s and user_id = auth.uid()) $$;
create or replace function public.ch_is_manager(s uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from ch_members where space_id = s and user_id = auth.uid() and role = 'manager') $$;
alter table public.ch_spaces enable row level security;
alter table public.ch_members enable row level security;
alter table public.ch_messages enable row level security;
alter table public.ch_reactions enable row level security;
drop policy if exists "my spaces" on public.ch_spaces;
drop policy if exists "managers rename" on public.ch_spaces;
create policy "my spaces" on public.ch_spaces for select to authenticated using (ch_is_member(id));
create policy "managers rename" on public.ch_spaces for update to authenticated using (ch_is_manager(id)) with check (ch_is_manager(id));
drop policy if exists "members of my spaces" on public.ch_members;
drop policy if exists "my read state" on public.ch_members;
drop policy if exists "leave or remove" on public.ch_members;
create policy "members of my spaces" on public.ch_members for select to authenticated using (ch_is_member(space_id));
create policy "my read state" on public.ch_members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "leave or remove" on public.ch_members for delete to authenticated using (user_id = auth.uid() or ch_is_manager(space_id));
drop policy if exists "read messages" on public.ch_messages;
drop policy if exists "post messages" on public.ch_messages;
drop policy if exists "edit own" on public.ch_messages;
create policy "read messages" on public.ch_messages for select to authenticated using (ch_is_member(space_id));
create policy "post messages" on public.ch_messages for insert to authenticated with check (author = auth.uid() and ch_is_member(space_id));
create policy "edit own" on public.ch_messages for update to authenticated using (author = auth.uid() or ch_is_manager(space_id)) with check (author = auth.uid() or ch_is_manager(space_id));
drop policy if exists "see reactions" on public.ch_reactions;
drop policy if exists "react" on public.ch_reactions;
drop policy if exists "unreact" on public.ch_reactions;
create policy "see reactions" on public.ch_reactions for select to authenticated using (exists (select 1 from ch_messages m where m.id = message_id and ch_is_member(m.space_id)));
create policy "react" on public.ch_reactions for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from ch_messages m where m.id = message_id and ch_is_member(m.space_id)));
create policy "unreact" on public.ch_reactions for delete to authenticated using (user_id = auth.uid());
grant select, update on public.ch_spaces to authenticated;
grant select, update, delete on public.ch_members to authenticated;
revoke update on public.ch_members from authenticated;
grant update (read_at, muted) on public.ch_members to authenticated;
grant select, insert, update on public.ch_messages to authenticated;
revoke update on public.ch_messages from authenticated;
grant update (body, edited_at, deleted) on public.ch_messages to authenticated;
grant select, insert, delete on public.ch_reactions to authenticated;
create or replace function public.ch_touch() returns trigger language plpgsql security definer set search_path = public as $$
begin update ch_spaces set last_at = new.created_at where id = new.space_id; return new; end $$;
drop trigger if exists ch_touch on public.ch_messages;
create trigger ch_touch after insert on public.ch_messages for each row execute function public.ch_touch();
-- a direct message with one person: finds it or starts it
create or replace function public.ch_dm(p_username text) returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); other uuid := cb_user_id(p_username); k text; s uuid;
begin
  if me is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  if other is null then raise exception 'No Cinnabar account is called %', p_username; end if;
  k := least(me::text, other::text) || ':' || greatest(me::text, other::text);
  select id into s from ch_spaces where dm_key = k;
  if s is null then
    insert into ch_spaces (kind, dm_key, created_by) values ('dm', k, me) returning id into s;
    insert into ch_members (space_id, user_id) values (s, me), (s, other) on conflict do nothing;
  end if;
  return s;
end $$;
-- a space with a name and the usernames to add; the creator manages it
create or replace function public.ch_new_space(p_name text, p_usernames text[]) returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); s uuid; n text; u uuid;
begin
  if me is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  insert into ch_spaces (kind, name, created_by) values ('space', left(trim(p_name), 80), me) returning id into s;
  insert into ch_members (space_id, user_id, role) values (s, me, 'manager');
  foreach n in array coalesce(p_usernames, '{}') loop
    continue when trim(n) = ''; u := cb_user_id(n);
    if u is null then raise exception 'No Cinnabar account is called %', n; end if;
    insert into ch_members (space_id, user_id) values (s, u) on conflict do nothing;
  end loop;
  return s;
end $$;
create or replace function public.ch_add(p_space uuid, p_username text) returns void language plpgsql security definer set search_path = public as $$
declare u uuid := cb_user_id(p_username);
begin
  if not ch_is_manager(p_space) or (select kind from ch_spaces where id = p_space) <> 'space' then raise exception 'Only a space manager can add people' using errcode = '42501'; end if;
  if u is null then raise exception 'No Cinnabar account is called %', p_username; end if;
  insert into ch_members (space_id, user_id) values (p_space, u) on conflict do nothing;
end $$;
revoke all on function public.ch_dm(text), public.ch_new_space(text, text[]), public.ch_add(uuid, text) from public, anon;
grant execute on function public.ch_dm(text), public.ch_new_space(text, text[]), public.ch_add(uuid, text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- KEEP (notes and checklists, shareable) and TASKS (lists of to-dos with due dates and subtasks)
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.kp_notes (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '' check (length(title) <= 300),
  body text not null default '' check (length(body) <= 20000),
  items jsonb,                                       -- a checklist: [{t, done}]; null for a text note
  color text not null default 'default' check (color ~ '^[a-z]{1,12}$'),
  pinned boolean not null default false, archived boolean not null default false, trashed boolean not null default false,
  labels text[] not null default '{}',
  remind_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists kp_notes_owner_idx on public.kp_notes(owner, updated_at desc);
create table if not exists public.kp_collab (
  note_id uuid not null references public.kp_notes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (note_id, user_id)
);
create or replace function public.kp_can(n uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from kp_notes where id = n and owner = auth.uid()) or exists (select 1 from kp_collab where note_id = n and user_id = auth.uid()) $$;
alter table public.kp_notes enable row level security;
alter table public.kp_collab enable row level security;
drop policy if exists "my and shared notes" on public.kp_notes;
drop policy if exists "write notes" on public.kp_notes;
drop policy if exists "edit notes" on public.kp_notes;
drop policy if exists "delete own notes" on public.kp_notes;
create policy "my and shared notes" on public.kp_notes for select to authenticated using (kp_can(id));
create policy "write notes" on public.kp_notes for insert to authenticated with check (owner = auth.uid());
create policy "edit notes" on public.kp_notes for update to authenticated using (kp_can(id)) with check (kp_can(id));
create policy "delete own notes" on public.kp_notes for delete to authenticated using (owner = auth.uid());
drop policy if exists "see collaborators" on public.kp_collab;
drop policy if exists "owner shares" on public.kp_collab;
create policy "see collaborators" on public.kp_collab for select to authenticated using (kp_can(note_id));
create policy "owner shares" on public.kp_collab for all to authenticated
  using (exists (select 1 from kp_notes n where n.id = note_id and n.owner = auth.uid()) or user_id = auth.uid())
  with check (exists (select 1 from kp_notes n where n.id = note_id and n.owner = auth.uid()));
grant select, insert, update, delete on public.kp_notes, public.kp_collab to authenticated;
create or replace function public.kp_share(p_note uuid, p_username text) returns void language plpgsql security definer set search_path = public as $$
declare u uuid := cb_user_id(p_username);
begin
  if not exists (select 1 from kp_notes where id = p_note and owner = auth.uid()) then raise exception 'Only the owner can share a note' using errcode = '42501'; end if;
  if u is null then raise exception 'No Cinnabar account is called %', p_username; end if;
  insert into kp_collab (note_id, user_id) values (p_note, u) on conflict do nothing;
end $$;
revoke all on function public.kp_share(uuid, text) from public, anon;
grant execute on function public.kp_share(uuid, text) to authenticated;

create table if not exists public.tk_lists (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 100),
  created_at timestamptz not null default now()
);
create table if not exists public.tk_tasks (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.tk_lists(id) on delete cascade,
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parent uuid references public.tk_tasks(id) on delete cascade,
  title text not null check (length(title) <= 500),
  notes text not null default '' check (length(notes) <= 8000),
  due date,
  starred boolean not null default false,
  done boolean not null default false, done_at timestamptz,
  position double precision not null default extract(epoch from now()),
  created_at timestamptz not null default now()
);
create index if not exists tk_tasks_list_idx on public.tk_tasks(list_id, position);
alter table public.tk_lists enable row level security;
alter table public.tk_tasks enable row level security;
drop policy if exists "own rows" on public.tk_lists;
drop policy if exists "own rows" on public.tk_tasks;
create policy "own rows" on public.tk_lists for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "own rows" on public.tk_tasks for all to authenticated using (owner = auth.uid())
  with check (owner = auth.uid() and exists (select 1 from tk_lists l where l.id = list_id and l.owner = auth.uid()));
grant select, insert, update, delete on public.tk_lists, public.tk_tasks to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- CONTACTS: your own address book. A contact can point at a Cinnabar account (by username) or just hold details.
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.ct_contacts (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 120),
  username text check (username is null or length(username) <= 254),
  phone text check (phone is null or length(phone) <= 40),
  company text check (company is null or length(company) <= 120),
  notes text not null default '' check (length(notes) <= 4000),
  labels text[] not null default '{}',
  starred boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ct_contacts_owner_idx on public.ct_contacts(owner, name);
alter table public.ct_contacts enable row level security;
drop policy if exists "own rows" on public.ct_contacts;
create policy "own rows" on public.ct_contacts for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
grant select, insert, update, delete on public.ct_contacts to authenticated;
create or replace function public.ct_link() returns trigger language plpgsql security definer set search_path = public as $$
begin new.user_id := case when coalesce(new.username, '') = '' then null else cb_user_id(new.username) end; return new; end $$;
drop trigger if exists ct_link on public.ct_contacts;
create trigger ct_link before insert or update of username on public.ct_contacts for each row execute function public.ct_link();

-- live updates (the pages also poll, so they work without Realtime)
do $$ declare t text; begin
  foreach t in array array['ml_boxes', 'mt_participants', 'mt_signals', 'mt_chat', 'ch_messages', 'ch_reactions', 'kp_notes'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t); exception when others then null; end;
  end loop;
end $$;
