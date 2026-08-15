alter table public.sessions add column if not exists task_category text;
alter table public.events add column if not exists task_category text;

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
end $$;

create index if not exists sessions_category_idx
  on public.sessions (task_category) where task_category is not null;
create index if not exists sessions_state_category_idx
  on public.sessions (task_state, task_category) where task_category is not null;
