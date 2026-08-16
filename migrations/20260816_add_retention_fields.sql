alter table public.sessions add column if not exists lifetime_session_count integer;
alter table public.sessions add column if not exists current_streak_days integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sessions_lifetime_session_count_check') then
    alter table public.sessions add constraint sessions_lifetime_session_count_check
      check (lifetime_session_count is null or lifetime_session_count >= 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sessions_current_streak_days_check') then
    alter table public.sessions add constraint sessions_current_streak_days_check
      check (current_streak_days is null or current_streak_days >= 1);
  end if;
end $$;
