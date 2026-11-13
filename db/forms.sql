-- Cinnabar Forms: surveys and auto-graded quizzes. Idempotent. Needs schema.sql and classroom.sql.
-- Respondents never read the forms table: they get the questions through fm_open(), which strips the answers,
-- and their score is computed here by a trigger, so it can't be faked from the browser.
create table if not exists public.fm_forms (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'Untitled form' check (length(title) <= 200),
  description text not null default '',
  questions jsonb not null default '[]'::jsonb,   -- [{id, kind: short|long|choice|checks|scale, text, options[], answer, points, required}]
  quiz boolean not null default false,
  accepting boolean not null default true,
  show_score boolean not null default true,
  one_response boolean not null default true,
  class_id uuid references public.cr_classes(id) on delete set null,   -- optional: only that class may answer
  color text not null default '#e2361f',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.fm_responses (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.fm_forms(id) on delete cascade,
  respondent uuid not null default auth.uid() references auth.users(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,   -- {question id: text | [choices]}
  score numeric, max_score numeric,
  created_at timestamptz not null default now()
);
create index if not exists fm_responses_form_idx on public.fm_responses(form_id, created_at);

-- v2: test mode (fullscreen, or Mercury Lockdown in Quicksilver) and how often a student left the test
alter table public.fm_forms add column if not exists test_mode text not null default 'off' check (test_mode in ('off', 'fullscreen', 'lockdown'));
alter table public.fm_responses add column if not exists left_count int not null default 0 check (left_count between 0 and 10000);
alter table public.cr_posts drop constraint if exists cr_posts_form_fk;
alter table public.cr_posts add constraint cr_posts_form_fk foreign key (form_id) references public.fm_forms(id) on delete set null;

create or replace function public.fm_can_answer(f public.fm_forms) returns boolean language sql stable security definer set search_path = public as $$
  select f.accepting and (f.class_id is null or cr_is_member(f.class_id)) $$;

-- the form for answering: questions without the answers
create or replace function public.fm_open(p_form uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare f fm_forms; mine fm_responses;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into f from fm_forms where id = p_form;
  if f.id is null then raise exception 'This form doesn''t exist'; end if;
  if f.owner <> auth.uid() and not (f.class_id is null or cr_is_member(f.class_id)) then raise exception 'This form is only for one class'; end if;
  select * into mine from fm_responses where form_id = p_form and respondent = auth.uid() order by created_at desc limit 1;
  return jsonb_build_object('id', f.id, 'title', f.title, 'description', f.description, 'quiz', f.quiz, 'accepting', f.accepting, 'color', f.color,
    'one_response', f.one_response, 'owner', f.owner, 'test_mode', f.test_mode, 'show_score', f.show_score,
    'attempts', (select count(*) from fm_responses r where r.form_id = f.id and r.respondent = auth.uid()),
    'questions', coalesce((select jsonb_agg(q - 'answer') from jsonb_array_elements(f.questions) q), '[]'::jsonb),
    'mine', case when mine.id is null then null else jsonb_build_object('answers', mine.answers, 'created_at', mine.created_at,
       'score', case when f.show_score then mine.score end, 'max_score', case when f.show_score then mine.max_score end) end);
end $$;

-- marking: choice = exact option, checks = same set, short = case/space-insensitive match (an answer may list alternatives split by |)
create or replace function public.fm_mark() returns trigger language plpgsql security definer set search_path = public as $$
declare f fm_forms; q jsonb; a jsonb; got numeric := 0; total numeric := 0; pts numeric;
begin
  select * into f from fm_forms where id = new.form_id;
  if not fm_can_answer(f) then raise exception 'This form isn''t accepting responses'; end if;
  if f.one_response and exists (select 1 from fm_responses where form_id = new.form_id and respondent = new.respondent and id <> new.id) then raise exception 'You already answered this form'; end if;
  new.respondent := auth.uid(); new.created_at := now();
  for q in select * from jsonb_array_elements(f.questions) loop
    a := new.answers -> (q ->> 'id');
    if coalesce((q ->> 'required')::boolean, false) and (a is null or a = '""'::jsonb or a = '[]'::jsonb) then raise exception 'Please answer: %', q ->> 'text'; end if;
    if f.quiz and q ? 'answer' and q -> 'answer' <> 'null'::jsonb then
      pts := coalesce((q ->> 'points')::numeric, 1); total := total + pts;
      if a is not null and (
           (q ->> 'kind' in ('choice', 'scale') and a #>> '{}' = q -> 'answer' #>> '{}')
        or (q ->> 'kind' = 'checks' and jsonb_typeof(a) = 'array' and jsonb_typeof(q -> 'answer') = 'array' and a @> (q -> 'answer') and (q -> 'answer') @> a)
        or (q ->> 'kind' in ('short', 'long') and lower(regexp_replace(trim(a #>> '{}'), '\s+', ' ', 'g')) = any (
              select lower(regexp_replace(trim(x), '\s+', ' ', 'g')) from unnest(string_to_array(q -> 'answer' #>> '{}', '|')) x))
      ) then got := got + pts; end if;
    end if;
  end loop;
  new.score := case when f.quiz then got end; new.max_score := case when f.quiz then total end;
  return new;
end $$;
drop trigger if exists fm_mark on public.fm_responses;
create trigger fm_mark before insert on public.fm_responses for each row execute function public.fm_mark();
create or replace function public.fm_touch() returns trigger language plpgsql as $$ begin new.updated_at := now(); new.owner := old.owner; return new; end $$;
drop trigger if exists fm_touch on public.fm_forms;
create trigger fm_touch before update on public.fm_forms for each row execute function public.fm_touch();

alter table public.fm_forms enable row level security;
alter table public.fm_responses enable row level security;
drop policy if exists "owners manage forms" on public.fm_forms;
create policy "owners manage forms" on public.fm_forms for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid() and (class_id is null or cr_is_teacher(class_id)));
drop policy if exists "answer forms" on public.fm_responses;
create policy "answer forms" on public.fm_responses for insert to authenticated with check (respondent = auth.uid());
drop policy if exists "see own and owned responses" on public.fm_responses;
create policy "see own and owned responses" on public.fm_responses for select to authenticated
  using (respondent = auth.uid() or exists (select 1 from fm_forms f where f.id = form_id and f.owner = auth.uid()));
drop policy if exists "owners delete responses" on public.fm_responses;
create policy "owners delete responses" on public.fm_responses for delete to authenticated using (exists (select 1 from fm_forms f where f.id = form_id and f.owner = auth.uid()));
-- respondents can't read their own score columns directly when the owner hides scores: they go through fm_open()
revoke select on public.fm_responses from authenticated, anon;
grant select (id, form_id, respondent, answers, created_at) on public.fm_responses to authenticated;
create or replace function public.fm_results(p_form uuid) returns setof public.fm_responses language sql stable security definer set search_path = public as $$
  select r.* from fm_responses r join fm_forms f on f.id = r.form_id where r.form_id = p_form and f.owner = auth.uid() order by r.created_at $$;
grant execute on function public.fm_open(uuid), public.fm_results(uuid) to authenticated;
revoke execute on function public.fm_open(uuid), public.fm_results(uuid) from anon;
