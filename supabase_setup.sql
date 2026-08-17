-- Supabase SQL Editor에서 한 번 실행하세요.
create extension if not exists pgcrypto;

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  session_id uuid not null unique,
  app_version text not null check (app_version in ('v1', 'v2')),
  task_state text check (task_state is null or task_state in ('not_started', 'interrupted', 'distracted', 'finishing')),
  task_category text check (task_category is null or task_category in ('study', 'reading', 'assignment', 'work', 'coding', 'research', 'writing', 'presentation', 'exercise', 'cleaning', 'housework', 'administrative', 'communication', 'personal_project', 'hobby_creative', 'other', 'prefer_not_to_say')),
  guide_relevance text check (guide_relevance is null or guide_relevance in ('not_relevant', 'neutral', 'relevant')),
  page_opened_at timestamptz not null,
  started_at timestamptz,
  first_completed_at timestamptz,
  finished_at timestamptz,
  first_continue boolean,
  reentry_outcome text check (reentry_outcome is null or reentry_outcome in ('timer_continue', 'independent_continue', 'stopped')),
  total_cycles integer not null default 0 check (total_cycles >= 0),
  feedback text check (feedback is null or feedback in ('worse', 'same', 'better')),
  stop_reason text check (stop_reason is null or stop_reason in ('task_done', 'tired', 'interrupted_external', 'cant_focus', 'no_specific_reason', 'prefer_not_to_say')),
  lifetime_session_count integer check (lifetime_session_count is null or lifetime_session_count >= 1),
  current_streak_days integer check (current_streak_days is null or current_streak_days >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  session_id uuid not null,
  event_name text not null,
  app_version text not null check (app_version in ('v1', 'v2')),
  task_state text check (task_state is null or task_state in ('not_started', 'interrupted', 'distracted', 'finishing')),
  task_category text check (task_category is null or task_category in ('study', 'reading', 'assignment', 'work', 'coding', 'research', 'writing', 'presentation', 'exercise', 'cleaning', 'housework', 'administrative', 'communication', 'personal_project', 'hobby_creative', 'other', 'prefer_not_to_say')),
  cycle_index integer not null default 0 check (cycle_index >= 0),
  event_time timestamptz not null,
  elapsed_from_page_view bigint,
  elapsed_from_session_start bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 기존 설치에도 안전하게 적용되는 migration.
alter table public.sessions add column if not exists task_category text;
alter table public.events add column if not exists task_category text;
alter table public.sessions add column if not exists lifetime_session_count integer;
alter table public.sessions add column if not exists current_streak_days integer;
alter table public.sessions add column if not exists stop_reason text;
alter table public.sessions add column if not exists reentry_outcome text;
alter table public.sessions add column if not exists guide_relevance text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sessions_task_category_check') then
    alter table public.sessions add constraint sessions_task_category_check
      check (task_category is null or task_category in ('study', 'reading', 'assignment', 'work', 'coding', 'research', 'writing', 'presentation', 'exercise', 'cleaning', 'housework', 'administrative', 'communication', 'personal_project', 'hobby_creative', 'other', 'prefer_not_to_say'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_task_category_check') then
    alter table public.events add constraint events_task_category_check
      check (task_category is null or task_category in ('study', 'reading', 'assignment', 'work', 'coding', 'research', 'writing', 'presentation', 'exercise', 'cleaning', 'housework', 'administrative', 'communication', 'personal_project', 'hobby_creative', 'other', 'prefer_not_to_say'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sessions_lifetime_session_count_check') then
    alter table public.sessions add constraint sessions_lifetime_session_count_check
      check (lifetime_session_count is null or lifetime_session_count >= 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sessions_current_streak_days_check') then
    alter table public.sessions add constraint sessions_current_streak_days_check
      check (current_streak_days is null or current_streak_days >= 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sessions_stop_reason_check') then
    alter table public.sessions add constraint sessions_stop_reason_check
      check (stop_reason is null or stop_reason in ('task_done', 'tired', 'interrupted_external', 'cant_focus', 'no_specific_reason', 'prefer_not_to_say'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sessions_reentry_outcome_check') then
    alter table public.sessions add constraint sessions_reentry_outcome_check
      check (reentry_outcome is null or reentry_outcome in ('timer_continue', 'independent_continue', 'stopped'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sessions_guide_relevance_check') then
    alter table public.sessions add constraint sessions_guide_relevance_check
      check (guide_relevance is null or guide_relevance in ('not_relevant', 'neutral', 'relevant'));
  end if;
end $$;

create index if not exists sessions_version_idx on public.sessions (app_version);
create index if not exists sessions_state_idx on public.sessions (task_state) where app_version = 'v2';
create index if not exists sessions_category_idx on public.sessions (task_category) where task_category is not null;
create index if not exists sessions_state_category_idx on public.sessions (task_state, task_category) where task_category is not null;
create index if not exists sessions_opened_idx on public.sessions (page_opened_at);
create index if not exists events_session_idx on public.events (session_id, event_time);
create index if not exists events_name_version_idx on public.events (event_name, app_version);

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sessions_set_updated_at on public.sessions;
create trigger sessions_set_updated_at before update on public.sessions
for each row execute function public.set_updated_at();

alter table public.sessions enable row level security;
alter table public.events enable row level security;

revoke all on public.sessions from anon, authenticated;
revoke all on public.events from anon, authenticated;
grant insert, update on public.sessions to anon, authenticated;
grant insert on public.events to anon, authenticated;
grant usage, select on sequence public.events_id_seq to anon, authenticated;

drop policy if exists "anonymous session insert" on public.sessions;
create policy "anonymous session insert" on public.sessions
for insert to anon, authenticated
with check (
  user_id::text = coalesce((current_setting('request.headers', true)::jsonb ->> 'x-user-id'), '')
);

drop policy if exists "anonymous own session update" on public.sessions;
create policy "anonymous own session update" on public.sessions
for update to anon, authenticated
using (
  user_id::text = coalesce((current_setting('request.headers', true)::jsonb ->> 'x-user-id'), '')
)
with check (
  user_id::text = coalesce((current_setting('request.headers', true)::jsonb ->> 'x-user-id'), '')
);

drop policy if exists "anonymous event insert" on public.events;
create policy "anonymous event insert" on public.events
for insert to anon, authenticated
with check (
  user_id::text = coalesce((current_setting('request.headers', true)::jsonb ->> 'x-user-id'), '')
);

-- SELECT 정책은 의도적으로 없습니다. 익명 웹 클라이언트는 분석 데이터를 읽을 수 없습니다.
