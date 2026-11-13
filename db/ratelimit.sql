-- Write limits: one account can't flood Cinnabar. Every insert a person makes through the API is counted per table and
-- per minute; past the per-minute or per-day cap the insert is refused with a plain message. The caps are far above what
-- a person does by hand (a class of 30 handing in at once is fine), so only scripts and floods ever hit them.
-- Safe to run again. Run after schema, signup, sync, classroom and forms (cesium tables are covered if they exist).
create table if not exists public.cb_rate (
  uid uuid not null,
  bucket text not null,
  minute timestamptz not null,
  n int not null default 0,
  primary key (uid, bucket, minute)
);
alter table public.cb_rate enable row level security;   -- no policies: nobody reads or writes it through the API
revoke all on public.cb_rate from anon, authenticated;

create or replace function public.cb_throttle() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who uuid := auth.uid();
  per_min int := TG_ARGV[0]::int;
  per_day int := TG_ARGV[1]::int;
  this_min int; today int;
begin
  -- Server-side work (auto-grading, the service role, migrations) has no signed-in user and isn't limited.
  if who is null or coalesce(current_setting('cinnabar.auto_grade', true), '') = 'on' then return new; end if;
  insert into public.cb_rate as r (uid, bucket, minute, n) values (who, TG_TABLE_NAME, date_trunc('minute', now()), 1)
    on conflict (uid, bucket, minute) do update set n = r.n + 1 returning n into this_min;
  if this_min > per_min then
    raise exception 'Slow down: that''s too many in a minute. Try again shortly.' using errcode = '53400', hint = 'rate_limited';
  end if;
  select coalesce(sum(n), 0) into today from public.cb_rate where uid = who and bucket = TG_TABLE_NAME and minute > now() - interval '1 day';
  if today > per_day then
    raise exception 'Daily limit reached for this account. Try again tomorrow.' using errcode = '53400', hint = 'rate_limited';
  end if;
  if random() < 0.02 then delete from public.cb_rate where uid = who and minute < now() - interval '1 day'; end if;   -- keep the table small
  return new;
end $$;
revoke all on function public.cb_throttle() from public, anon, authenticated;

-- table, per minute, per day
do $$
declare t record;
begin
  for t in select * from (values
    ('files', 60, 5000), ('shares', 30, 2000), ('sync_items', 300, 50000), ('sync_devices', 5, 50),
    ('cal_events', 30, 2000), ('cr_classes', 5, 50), ('cr_posts', 20, 1000), ('cr_comments', 30, 2000),
    ('cr_submissions', 30, 2000), ('cr_attendance', 300, 20000), ('fm_forms', 10, 300), ('fm_responses', 20, 1000),
    ('fr_boards', 5, 50), ('fr_threads', 10, 300), ('fr_replies', 30, 2000), ('fr_votes', 60, 5000),
    ('ce_chat_messages', 30, 3000), ('ce_reports', 5, 50), ('ce_stream_posts', 10, 500), ('ce_stream_replies', 30, 2000),
    ('ce_stream_likes', 60, 5000), ('ce_grades', 120, 20000)
  ) as x(tbl, per_min, per_day)
  loop
    if to_regclass('public.' || t.tbl) is not null then
      execute format('drop trigger if exists cb_throttle on public.%I', t.tbl);
      execute format('create trigger cb_throttle before insert on public.%I for each row execute function public.cb_throttle(%s, %s)', t.tbl, t.per_min, t.per_day);
    end if;
  end loop;
end $$;

-- Sign-ups are anonymous, so they're capped for the whole server too: 20 a minute (signup.sql) and 1000 a day.
create or replace function public.cb_signup_daily_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from auth.users u where u.created_at > now() - interval '1 day') >= 1000 then
    raise exception 'Too many sign-ups today. Try again tomorrow.' using errcode = '53400';
  end if;
  return new;
end $$;
revoke all on function public.cb_signup_daily_cap() from public, anon, authenticated;
drop trigger if exists cb_signup_daily_cap on auth.users;
create trigger cb_signup_daily_cap before insert on auth.users for each row execute function public.cb_signup_daily_cap();
