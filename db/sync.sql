-- Quicksilver browser sync, stored under the user's Cinnabar account.
create table if not exists public.sync_devices (
  id text primary key check (id ~ '^[a-z0-9]{16,64}$'),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null default 'Quicksilver' check (char_length(name) <= 80),
  platform text not null default '' check (char_length(platform) <= 80),
  last_seen timestamptz not null default now()
);
-- device '*' rows are shared by all devices (bookmarks, extensions, settings); device rows hold that device's open tabs
create table if not exists public.sync_items (
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  device text not null default '*' check (device = '*' or device ~ '^[a-z0-9]{16,64}$'),
  kind text not null check (kind in ('tabs', 'bookmarks', 'extensions', 'settings')),
  data jsonb not null default '{}' check (octet_length(data::text) < 4000000),
  updated_at timestamptz not null default now(),
  primary key (owner, device, kind)
);
alter table public.sync_devices enable row level security;
alter table public.sync_items enable row level security;
drop policy if exists "own devices" on public.sync_devices;
create policy "own devices" on public.sync_devices for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists "own sync" on public.sync_items;
create policy "own sync" on public.sync_items for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
grant select, insert, update, delete on public.sync_devices, public.sync_items to authenticated;
revoke all on public.sync_devices, public.sync_items from anon;
alter publication supabase_realtime add table public.sync_items;
