alter table public.sessions add column if not exists guide_relevance text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sessions_guide_relevance_check') then
    alter table public.sessions add constraint sessions_guide_relevance_check
      check (guide_relevance is null or guide_relevance in ('not_relevant', 'neutral', 'relevant'));
  end if;
end $$;
