alter table public.sessions add column if not exists stop_reason text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sessions_stop_reason_check') then
    alter table public.sessions add constraint sessions_stop_reason_check
      check (stop_reason is null or stop_reason in ('task_done', 'tired', 'interrupted_external', 'cant_focus', 'no_specific_reason', 'prefer_not_to_say'));
  end if;
end $$;
