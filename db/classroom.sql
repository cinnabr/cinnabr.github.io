-- Cinnabar Classroom, Forums and Calendar (Supabase / Postgres). Idempotent: safe to run again.
-- Builds on schema.sql (profiles, files). Every table is protected by Row-Level Security:
--   classes and everything in them are visible to members only; only teachers grade, take attendance and post work;
--   students see their own submissions and grades only; forum boards are open to all signed-in users or to one class.

-- ── classes ─────────────────────────────────────────────────────────────────
create table if not exists public.cr_classes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  section text, room text, subject text,
  color text not null default '#e2361f',
  code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.cr_members (
  class_id uuid not null references public.cr_classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('teacher', 'student')),
  joined_at timestamptz not null default now(),
  primary key (class_id, user_id)
);
create index if not exists cr_members_user_idx on public.cr_members(user_id);

create or replace function public.cr_is_member(c uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from cr_members where class_id = c and user_id = auth.uid()) $$;
create or replace function public.cr_is_teacher(c uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from cr_members where class_id = c and user_id = auth.uid() and role = 'teacher') $$;

-- the creator is the first teacher
create or replace function public.cr_class_created() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into cr_members(class_id, user_id, role) values (new.id, new.owner, 'teacher') on conflict do nothing; return new; end $$;
drop trigger if exists cr_class_created on public.cr_classes;
create trigger cr_class_created after insert on public.cr_classes for each row execute function public.cr_class_created();

-- joining by code is the only way a student adds themself
create or replace function public.cr_join(p_code text) returns uuid language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select id into c from cr_classes where code = upper(trim(p_code)) and not archived;
  if c is null then raise exception 'No class has that code'; end if;
  insert into cr_members(class_id, user_id, role) values (c, auth.uid(), 'student') on conflict do nothing;
  return c;
end $$;
-- a teacher adds a co-teacher (or a student) by email
create or replace function public.cr_add_member(p_class uuid, p_email text, p_role text) returns void language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  if not cr_is_teacher(p_class) then raise exception 'Only teachers can add people'; end if;
  if p_role not in ('teacher', 'student') then raise exception 'Unknown role'; end if;
  select id into u from profiles where lower(email) = lower(trim(p_email));
  if u is null then raise exception 'Nobody with that email has a Cinnabar account yet'; end if;
  insert into cr_members(class_id, user_id, role) values (p_class, u, p_role) on conflict (class_id, user_id) do update set role = excluded.role;
end $$;
-- a new code, when the old one leaked
create or replace function public.cr_new_code(p_class uuid) returns text language plpgsql security definer set search_path = public as $$
declare k text := upper(substr(md5(gen_random_uuid()::text), 1, 6));
begin if not cr_is_teacher(p_class) then raise exception 'Only teachers can do that'; end if; update cr_classes set code = k where id = p_class; return k; end $$;

-- ── stream: announcements, assignments, materials, questions ────────────────
create table if not exists public.cr_posts (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.cr_classes(id) on delete cascade,
  author uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('announcement', 'assignment', 'material', 'question')),
  title text, body text not null default '',
  topic text,
  due_at timestamptz, points numeric check (points is null or points >= 0),
  file_id uuid references public.files(id) on delete set null,
  link text check (link is null or link ~* '^https?://'),
  created_at timestamptz not null default now()
);
create index if not exists cr_posts_class_idx on public.cr_posts(class_id, created_at desc);
create table if not exists public.cr_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.cr_posts(id) on delete cascade,
  author uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create table if not exists public.cr_submissions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.cr_posts(id) on delete cascade,
  student uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null default '',
  file_id uuid references public.files(id) on delete set null,
  turned_in boolean not null default false,
  submitted_at timestamptz,
  grade numeric, feedback text, returned_at timestamptz,
  unique (post_id, student)
);
create or replace function public.cr_post_class(p uuid) returns uuid language sql stable security definer set search_path = public as $$ select class_id from cr_posts where id = p $$;
-- students may change their own work, never the grade; teachers only grade
create or replace function public.cr_submission_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if cr_is_teacher(cr_post_class(new.post_id)) and new.student <> auth.uid() then
    new.body := old.body; new.file_id := old.file_id; new.turned_in := old.turned_in; new.submitted_at := old.submitted_at;
    if new.grade is distinct from old.grade or new.feedback is distinct from old.feedback then new.returned_at := now(); end if;
  else
    new.grade := old.grade; new.feedback := old.feedback; new.returned_at := old.returned_at;
    if new.turned_in and not old.turned_in then new.submitted_at := now(); end if;
  end if;
  new.student := old.student; new.post_id := old.post_id; return new;
end $$;
drop trigger if exists cr_submission_guard on public.cr_submissions;
create trigger cr_submission_guard before update on public.cr_submissions for each row execute function public.cr_submission_guard();
create or replace function public.cr_submission_insert_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin new.grade := null; new.feedback := null; new.returned_at := null; if new.turned_in then new.submitted_at := now(); end if; return new; end $$;
drop trigger if exists cr_submission_insert_guard on public.cr_submissions;
create trigger cr_submission_insert_guard before insert on public.cr_submissions for each row execute function public.cr_submission_insert_guard();

-- ── attendance ─────────────────────────────────────────────────────────────
create table if not exists public.cr_attendance (
  class_id uuid not null references public.cr_classes(id) on delete cascade,
  day date not null default current_date,
  student uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('present', 'late', 'absent', 'excused')),
  marked_by uuid default auth.uid(),
  primary key (class_id, day, student)
);

-- ── forums ─────────────────────────────────────────────────────────────────
create table if not exists public.fr_boards (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  description text not null default '',
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  class_id uuid references public.cr_classes(id) on delete cascade,   -- null: every signed-in user
  color text not null default '#ff7a1a',
  created_at timestamptz not null default now()
);
create table if not exists public.fr_threads (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.fr_boards(id) on delete cascade,
  author uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  body text not null default '' check (length(body) <= 20000),
  pinned boolean not null default false, locked boolean not null default false, solved boolean not null default false,
  created_at timestamptz not null default now(), last_activity timestamptz not null default now()
);
create index if not exists fr_threads_board_idx on public.fr_threads(board_id, pinned desc, last_activity desc);
create table if not exists public.fr_replies (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.fr_threads(id) on delete cascade,
  author uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null check (length(body) between 1 and 20000),
  created_at timestamptz not null default now()
);
create table if not exists public.fr_votes (
  thread_id uuid not null references public.fr_threads(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (thread_id, user_id)
);
create or replace function public.fr_can_see(b uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from fr_boards where id = b and (class_id is null or cr_is_member(class_id))) $$;
create or replace function public.fr_is_mod(b uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from fr_boards where id = b and (owner = auth.uid() or (class_id is not null and cr_is_teacher(class_id)))) $$;
create or replace function public.fr_thread_board(t uuid) returns uuid language sql stable security definer set search_path = public as $$ select board_id from fr_threads where id = t $$;
-- authors edit their words; only moderators pin, lock or mark solved (an author may mark their own question solved)
create or replace function public.fr_thread_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not fr_is_mod(old.board_id) then
    new.pinned := old.pinned; new.locked := old.locked;
    if old.author <> auth.uid() then new.solved := old.solved; new.title := old.title; new.body := old.body; end if;
  end if;
  new.author := old.author; new.board_id := old.board_id; return new;
end $$;
drop trigger if exists fr_thread_guard on public.fr_threads;
create trigger fr_thread_guard before update on public.fr_threads for each row execute function public.fr_thread_guard();
create or replace function public.fr_reply_bump() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from fr_threads where id = new.thread_id and locked) and not fr_is_mod(fr_thread_board(new.thread_id)) then raise exception 'This thread is locked'; end if;
  update fr_threads set last_activity = now() where id = new.thread_id; return new;
end $$;
drop trigger if exists fr_reply_bump on public.fr_replies;
create trigger fr_reply_bump before insert on public.fr_replies for each row execute function public.fr_reply_bump();

-- ── calendar ───────────────────────────────────────────────────────────────
create table if not exists public.cal_events (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  class_id uuid references public.cr_classes(id) on delete cascade,   -- null: personal
  title text not null check (length(title) between 1 and 200),
  starts_at timestamptz not null, ends_at timestamptz,
  location text, notes text, color text,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create index if not exists cal_events_time_idx on public.cal_events(starts_at);

-- ── Row-Level Security ─────────────────────────────────────────────────────
alter table public.cr_classes enable row level security;
alter table public.cr_members enable row level security;
alter table public.cr_posts enable row level security;
alter table public.cr_comments enable row level security;
alter table public.cr_submissions enable row level security;
alter table public.cr_attendance enable row level security;
alter table public.fr_boards enable row level security;
alter table public.fr_threads enable row level security;
alter table public.fr_replies enable row level security;
alter table public.fr_votes enable row level security;
alter table public.cal_events enable row level security;

do $$ declare t text; p text; begin
  for t, p in select tablename, policyname from pg_policies where schemaname = 'public' and (tablename like 'cr\_%' or tablename like 'fr\_%' or tablename = 'cal_events') loop
    execute format('drop policy %I on public.%I', p, t);
  end loop;
end $$;

create policy "members see their classes" on public.cr_classes for select to authenticated using (owner = auth.uid() or cr_is_member(id));   -- the owner too: insert ... returning runs before the trigger adds them as a member
create policy "anyone signed in creates a class" on public.cr_classes for insert to authenticated with check (owner = auth.uid());
create policy "teachers edit the class" on public.cr_classes for update to authenticated using (cr_is_teacher(id)) with check (cr_is_teacher(id));
create policy "owner deletes the class" on public.cr_classes for delete to authenticated using (owner = auth.uid());

create policy "members see the roster" on public.cr_members for select to authenticated using (cr_is_member(class_id));
create policy "leave, or teachers remove" on public.cr_members for delete to authenticated using (user_id = auth.uid() or cr_is_teacher(class_id));

create policy "members read the stream" on public.cr_posts for select to authenticated using (cr_is_member(class_id));
create policy "teachers post anything, students ask" on public.cr_posts for insert to authenticated
  with check (author = auth.uid() and (cr_is_teacher(class_id) or (cr_is_member(class_id) and kind = 'question')));
create policy "authors and teachers edit posts" on public.cr_posts for update to authenticated using (author = auth.uid() or cr_is_teacher(class_id));
create policy "authors and teachers delete posts" on public.cr_posts for delete to authenticated using (author = auth.uid() or cr_is_teacher(class_id));

create policy "members read comments" on public.cr_comments for select to authenticated using (cr_is_member(cr_post_class(post_id)));
create policy "members comment" on public.cr_comments for insert to authenticated with check (author = auth.uid() and cr_is_member(cr_post_class(post_id)));
create policy "authors and teachers delete comments" on public.cr_comments for delete to authenticated using (author = auth.uid() or cr_is_teacher(cr_post_class(post_id)));

create policy "own work, or teachers see all" on public.cr_submissions for select to authenticated using (student = auth.uid() or cr_is_teacher(cr_post_class(post_id)));
create policy "students hand in their own work" on public.cr_submissions for insert to authenticated with check (student = auth.uid() and cr_is_member(cr_post_class(post_id)));
create policy "students edit own work, teachers grade" on public.cr_submissions for update to authenticated using (student = auth.uid() or cr_is_teacher(cr_post_class(post_id)));

create policy "teachers keep attendance" on public.cr_attendance for all to authenticated using (cr_is_teacher(class_id)) with check (cr_is_teacher(class_id));
create policy "students see their own attendance" on public.cr_attendance for select to authenticated using (student = auth.uid());

create policy "see open boards and your classes' boards" on public.fr_boards for select to authenticated using (class_id is null or cr_is_member(class_id));
create policy "make a board" on public.fr_boards for insert to authenticated with check (owner = auth.uid() and (class_id is null or cr_is_teacher(class_id)));
create policy "moderators edit boards" on public.fr_boards for update to authenticated using (fr_is_mod(id));
create policy "moderators delete boards" on public.fr_boards for delete to authenticated using (fr_is_mod(id));

create policy "read threads you can see" on public.fr_threads for select to authenticated using (fr_can_see(board_id));
create policy "start a thread" on public.fr_threads for insert to authenticated with check (author = auth.uid() and fr_can_see(board_id) and not pinned and not locked);
create policy "authors and moderators edit threads" on public.fr_threads for update to authenticated using (author = auth.uid() or fr_is_mod(board_id));
create policy "authors and moderators delete threads" on public.fr_threads for delete to authenticated using (author = auth.uid() or fr_is_mod(board_id));

create policy "read replies you can see" on public.fr_replies for select to authenticated using (fr_can_see(fr_thread_board(thread_id)));
create policy "reply" on public.fr_replies for insert to authenticated with check (author = auth.uid() and fr_can_see(fr_thread_board(thread_id)));
create policy "authors and moderators delete replies" on public.fr_replies for delete to authenticated using (author = auth.uid() or fr_is_mod(fr_thread_board(thread_id)));

create policy "see votes" on public.fr_votes for select to authenticated using (fr_can_see(fr_thread_board(thread_id)));
create policy "vote once" on public.fr_votes for insert to authenticated with check (user_id = auth.uid() and fr_can_see(fr_thread_board(thread_id)));
create policy "unvote" on public.fr_votes for delete to authenticated using (user_id = auth.uid());

create policy "own and class events" on public.cal_events for select to authenticated using (owner = auth.uid() or (class_id is not null and cr_is_member(class_id)));
create policy "add own events, teachers add class events" on public.cal_events for insert to authenticated with check (owner = auth.uid() and (class_id is null or cr_is_teacher(class_id)));
create policy "owners edit events" on public.cal_events for update to authenticated using (owner = auth.uid());
create policy "owners delete events" on public.cal_events for delete to authenticated using (owner = auth.uid() or (class_id is not null and cr_is_teacher(class_id)));

grant execute on function public.cr_join(text), public.cr_add_member(uuid, text, text), public.cr_new_code(uuid) to authenticated;
revoke execute on function public.cr_join(text), public.cr_add_member(uuid, text, text), public.cr_new_code(uuid) from anon;

-- live updates for the stream and forums
do $$ begin
  begin alter publication supabase_realtime add table public.cr_posts; exception when others then null; end;
  begin alter publication supabase_realtime add table public.cr_comments; exception when others then null; end;
  begin alter publication supabase_realtime add table public.fr_replies; exception when others then null; end;
  begin alter publication supabase_realtime add table public.fr_threads; exception when others then null; end;
end $$;

-- ── v2: games and quizzes as classwork, student IDs, teacher grade entry (Skyward import/export) ──
alter table public.cr_posts drop constraint if exists cr_posts_kind_check;
alter table public.cr_posts add constraint cr_posts_kind_check check (kind in ('announcement', 'assignment', 'material', 'question', 'game', 'quiz'));
alter table public.cr_posts add column if not exists game text check (game is null or game ~ '^[a-z0-9-]{1,32}$');
alter table public.cr_posts add column if not exists form_id uuid;   -- the quiz's form; forms.sql adds the foreign key
alter table public.cr_members add column if not exists student_number text check (student_number is null or length(student_number) <= 32);

-- teachers set a student's ID (for Skyward and other gradebooks); members can't change roles or IDs themselves
create or replace function public.cr_set_student_number(p_class uuid, p_student uuid, p_number text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not cr_is_teacher(p_class) then raise exception 'Only teachers can do that' using errcode = '42501'; end if;
  update cr_members set student_number = nullif(trim(p_number), '') where class_id = p_class and user_id = p_student;
end $$;

-- teachers enter a grade even when nothing was handed in (paper work, imports)
create or replace function public.cr_set_grade(p_post uuid, p_student uuid, p_grade numeric, p_feedback text default null) returns void language plpgsql security definer set search_path = public as $$
declare c uuid := cr_post_class(p_post);
begin
  if c is null or not cr_is_teacher(c) then raise exception 'Only teachers can grade' using errcode = '42501'; end if;
  if not exists (select 1 from cr_members where class_id = c and user_id = p_student and role = 'student') then raise exception 'That student isn''t in this class'; end if;
  if p_grade is not null and (p_grade < 0 or p_grade > 100000) then raise exception 'That grade is out of range'; end if;
  perform set_config('cinnabar.auto_grade', 'on', true);   -- transaction-local; PostgREST exposes no way for clients to set it
  insert into cr_submissions (post_id, student, grade, feedback, returned_at) values (p_post, p_student, p_grade, p_feedback, now())
    on conflict (post_id, student) do update set grade = excluded.grade, feedback = coalesce(excluded.feedback, cr_submissions.feedback), returned_at = now();
  perform set_config('cinnabar.auto_grade', 'off', true);
end $$;

-- games and quizzes grade themselves. A quiz's score comes from its marked form response, never from the browser.
create or replace function public.cr_auto_score(p_post uuid, p_score numeric default null) returns numeric language plpgsql security definer set search_path = public as $$
declare p cr_posts; s numeric; m numeric;
begin
  select * into p from cr_posts where id = p_post;
  if p.id is null or not cr_is_member(p.class_id) or cr_is_teacher(p.class_id) then raise exception 'Only students in this class can do that' using errcode = '42501'; end if;
  if p.kind = 'quiz' then
    select max(score), max(max_score) into s, m from fm_responses where form_id = p.form_id and respondent = auth.uid();
    if s is null then raise exception 'Take the quiz first'; end if;
    s := case when coalesce(m, 0) > 0 and p.points is not null then round(s / m * p.points, 1) else s end;
  elsif p.kind = 'game' then
    s := least(greatest(coalesce(p_score, 0), 0), coalesce(p.points, 100));   -- the points are the target score
  else raise exception 'This classwork isn''t graded automatically'; end if;
  perform set_config('cinnabar.auto_grade', 'on', true);
  insert into cr_submissions (post_id, student, body, turned_in) values (p_post, auth.uid(), '', true) on conflict (post_id, student) do nothing;
  update cr_submissions set turned_in = true, submitted_at = coalesce(submitted_at, now()), body = 'Best score ' || greatest(s, coalesce(grade, 0)),
    grade = greatest(s, coalesce(grade, 0)), returned_at = now() where post_id = p_post and student = auth.uid() and (grade is null or s >= grade);
  perform set_config('cinnabar.auto_grade', 'off', true);
  return s;
end $$;
-- the guard triggers would undo these server-side grades; let the security-definer functions through
create or replace function public.cr_submission_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('cinnabar.auto_grade', true) = 'on' then return new; end if;
  if cr_is_teacher(cr_post_class(new.post_id)) and new.student <> auth.uid() then
    new.body := old.body; new.file_id := old.file_id; new.turned_in := old.turned_in; new.submitted_at := old.submitted_at;
    if new.grade is distinct from old.grade or new.feedback is distinct from old.feedback then new.returned_at := now(); end if;
  else
    new.grade := old.grade; new.feedback := old.feedback; new.returned_at := old.returned_at;
    if new.turned_in and not old.turned_in then new.submitted_at := now(); end if;
  end if;
  new.student := old.student; new.post_id := old.post_id; return new;
end $$;
create or replace function public.cr_submission_insert_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('cinnabar.auto_grade', true) = 'on' then return new; end if;
  new.grade := null; new.feedback := null; new.returned_at := null; if new.turned_in then new.submitted_at := now(); end if; return new;
end $$;
grant execute on function public.cr_set_grade(uuid, uuid, numeric, text), public.cr_auto_score(uuid, numeric), public.cr_set_student_number(uuid, uuid, text) to authenticated;
revoke execute on function public.cr_set_grade(uuid, uuid, numeric, text), public.cr_auto_score(uuid, numeric), public.cr_set_student_number(uuid, uuid, text) from anon, public;

-- ── v3: 4-character class codes that last one day, and live activities ──────
alter table public.cr_classes add column if not exists code_at timestamptz not null default now();
-- No 0/O or 1/I, so a code read off the board is typed right. 32^4 codes; cr_join limits guessing.
create or replace function public.cr_gen_code() returns text language plpgsql volatile security definer set search_path = public as $$
declare k text;
begin
  loop
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '') into k from generate_series(1, 4);
    exit when not exists (select 1 from cr_classes where code = k);
  end loop;
  return k;
end $$;
alter table public.cr_classes alter column code set default public.cr_gen_code();
do $$ declare r record; begin   -- older 6-character codes become 4-character ones
  for r in select id from public.cr_classes where length(code) <> 4 loop
    update public.cr_classes set code = public.cr_gen_code(), code_at = now() where id = r.id;
  end loop;
end $$;

-- Wrong guesses are counted (20 an hour per account), so codes can't be found by trying them all.
create table if not exists public.cr_join_tries (uid uuid not null, hour timestamptz not null, n int not null default 0, primary key (uid, hour));
alter table public.cr_join_tries enable row level security;   -- no policies: only cr_join touches it
revoke all on public.cr_join_tries from anon, authenticated;
-- Returns the class, or null when no class has that code today (null, not an error, so the wrong guess stays counted).
create or replace function public.cr_join(p_code text) returns uuid language plpgsql security definer set search_path = public as $$
declare c uuid; tries int;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into cr_join_tries as t (uid, hour, n) values (auth.uid(), date_trunc('hour', now()), 1)
    on conflict (uid, hour) do update set n = t.n + 1 returning n into tries;
  if tries > 20 then raise exception 'Too many tries. Wait an hour, then ask your teacher for today''s code.' using errcode = '53400'; end if;
  select id into c from cr_classes where code = upper(trim(p_code)) and not archived and code_at > now() - interval '1 day';
  if c is null then return null; end if;
  insert into cr_members(class_id, user_id, role) values (c, auth.uid(), 'student') on conflict do nothing;
  delete from cr_join_tries where uid = auth.uid();
  return c;
end $$;
create or replace function public.cr_new_code(p_class uuid) returns text language plpgsql security definer set search_path = public as $$
declare k text := cr_gen_code();
begin if not cr_is_teacher(p_class) then raise exception 'Only teachers can do that'; end if; update cr_classes set code = k, code_at = now() where id = p_class; return k; end $$;
-- today's code: a teacher asking for it after a day gets a fresh one
create or replace function public.cr_code(p_class uuid) returns text language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if not cr_is_teacher(p_class) then raise exception 'Only teachers can do that' using errcode = '42501'; end if;
  select code into k from cr_classes where id = p_class and code_at > now() - interval '1 day';
  return coalesce(k, cr_new_code(p_class));
end $$;
create or replace function public.cr_add_member(p_class uuid, p_email text, p_role text) returns void language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  if not cr_is_teacher(p_class) then raise exception 'Only teachers can add people'; end if;
  if p_role not in ('teacher', 'student') then raise exception 'Unknown role'; end if;
  select id into u from profiles where lower(email) = lower(trim(p_email));
  if u is null then raise exception 'Nobody has that Cinnabar username yet'; end if;
  insert into cr_members(class_id, user_id, role) values (p_class, u, p_role) on conflict (class_id, user_id) do update set role = excluded.role;
end $$;
grant execute on function public.cr_code(uuid) to authenticated;
revoke execute on function public.cr_code(uuid), public.cr_gen_code() from anon, public;

-- One live activity per class. While it's on, every student in the class is taken to it.
create table if not exists public.cr_live (
  class_id uuid primary key references public.cr_classes(id) on delete cascade,
  post_id uuid references public.cr_posts(id) on delete cascade,   -- a game or quiz from classwork (graded), or
  game text check (game is null or game ~ '^[a-z0-9-]{1,32}$'),     -- just a game (not graded)
  title text not null check (length(title) between 1 and 120),
  started_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  check (post_id is not null or game is not null)
);
alter table public.cr_live enable row level security;
drop policy if exists "members see live" on public.cr_live;
drop policy if exists "teachers start live" on public.cr_live;
drop policy if exists "teachers change live" on public.cr_live;
drop policy if exists "teachers end live" on public.cr_live;
create policy "members see live" on public.cr_live for select to authenticated using (cr_is_member(class_id));
create policy "teachers start live" on public.cr_live for insert to authenticated with check (cr_is_teacher(class_id) and started_by = auth.uid() and (post_id is null or cr_post_class(post_id) = class_id));
create policy "teachers change live" on public.cr_live for update to authenticated using (cr_is_teacher(class_id)) with check (cr_is_teacher(class_id) and started_by = auth.uid() and (post_id is null or cr_post_class(post_id) = class_id));
create policy "teachers end live" on public.cr_live for delete to authenticated using (cr_is_teacher(class_id));
grant select, insert, update, delete on public.cr_live to authenticated;
do $$ begin begin alter publication supabase_realtime add table public.cr_live; exception when others then null; end; end $$;

-- Only teacher accounts (and accounts from before types existed) create classes; work accounts don't join them.
drop policy if exists "anyone signed in creates a class" on public.cr_classes;
drop policy if exists "teachers create classes" on public.cr_classes;
create policy "teachers create classes" on public.cr_classes for insert to authenticated
  with check (owner = auth.uid() and coalesce((select kind from public.profiles where id = auth.uid()), 'teacher') = 'teacher');
create or replace function public.cr_no_work() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select kind from profiles where id = new.user_id) = 'work' then raise exception 'Work accounts don''t use Classroom' using errcode = '42501'; end if;
  if new.role = 'teacher' and (select kind from profiles where id = new.user_id) = 'student' then raise exception 'Student accounts can''t teach a class' using errcode = '42501'; end if;
  return new;
end $$;
drop trigger if exists cr_no_work on public.cr_members;
create trigger cr_no_work before insert or update on public.cr_members for each row execute function public.cr_no_work();
