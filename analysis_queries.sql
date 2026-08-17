-- Supabase SQL Editor에서 관리자 권한으로 실행하세요.

-- 1) V1/V2 세션 수
select app_version, count(*) as sessions
from public.sessions
group by app_version
order by app_version;

-- 2) 버전별 핵심 KPI
select
  app_version,
  count(*) as sessions,
  round(100.0 * count(*) filter (where started_at is not null) / nullif(count(*), 0), 2) as start_rate_pct,
  round(100.0 * count(*) filter (where first_completed_at is not null) / nullif(count(*) filter (where started_at is not null), 0), 2) as completion_rate_pct,
  round(100.0 * count(*) filter (where first_continue is true) / nullif(count(*) filter (where first_completed_at is not null), 0), 2) as continuation_rate_pct,
  round(100.0 * count(*) filter (where reentry_outcome in ('timer_continue', 'independent_continue')) / nullif(count(*) filter (where first_completed_at is not null), 0), 2) as reentry_success_rate_pct,
  round(100.0 * count(*) filter (where reentry_outcome = 'independent_continue') / nullif(count(*) filter (where first_completed_at is not null), 0), 2) as independent_continuation_rate_pct,
  round(avg(total_cycles)::numeric, 2) as average_cycle
from public.sessions
group by app_version
order by app_version;

-- 3) V2 Task State별 KPI
select
  task_state,
  count(*) as sessions,
  count(distinct user_id) as users,
  round(100.0 * count(*) filter (where started_at is not null) / nullif(count(*), 0), 2) as start_rate_pct,
  round(100.0 * count(*) filter (where first_completed_at is not null) / nullif(count(*) filter (where started_at is not null), 0), 2) as completion_rate_pct,
  round(100.0 * count(*) filter (where first_continue is true) / nullif(count(*) filter (where first_completed_at is not null), 0), 2) as continuation_rate_pct,
  round(100.0 * count(*) filter (where reentry_outcome in ('timer_continue', 'independent_continue')) / nullif(count(*) filter (where first_completed_at is not null), 0), 2) as reentry_success_rate_pct,
  round(avg(total_cycles)::numeric, 2) as average_cycle
from public.sessions
where app_version = 'v2'
group by task_state
order by task_state;

-- 4) 날짜별 익명 사용자와 세션 수
select
  date_trunc('day', page_opened_at)::date as day,
  count(distinct user_id) as users,
  count(*) as sessions
from public.sessions
group by day
order by day desc;

-- 5) Early Exit Rate: 타이머 시작 세션 중 early_exit이 발생한 비율
with started as (
  select distinct session_id from public.events where event_name = 'start_5min'
), exited as (
  select distinct session_id from public.events where event_name = 'early_exit'
)
select round(100.0 * count(*) filter (where e.session_id is not null) / nullif(count(*), 0), 2) as early_exit_rate_pct
from started s
left join exited e using (session_id);

-- 6) 이벤트 퍼널 원자료
select app_version, event_name, count(distinct session_id) as sessions
from public.events
where event_name in ('page_view', 'start_5min', 'complete_5min', 'continue_5min', 'continue_independently', 'early_exit', 'session_finished')
group by app_version, event_name
order by app_version, event_name;

-- 7) Task Category별 session 수
select
  task_category,
  count(*) as n
from public.sessions
where task_category is not null
group by task_category
order by n desc, task_category;

-- 8) Task Category별 Completion Rate
-- 주의: category는 첫 완료 후 수집되므로, category가 있는 표본의 Completion Rate는 구조적으로 100%입니다.
select
  task_category,
  count(*) as n,
  round(
    100.0 * count(*) filter (where first_completed_at is not null)
    / nullif(count(*) filter (where started_at is not null), 0),
    2
  ) as completion_rate_pct
from public.sessions
where task_category is not null
group by task_category
order by n desc, task_category;

-- 9) Task Category별 Continuation Rate
select
  task_category,
  count(*) as n,
  round(
    100.0 * count(*) filter (where first_continue is true)
    / nullif(count(*) filter (where first_completed_at is not null), 0),
    2
  ) as continuation_rate_pct
from public.sessions
where task_category is not null
group by task_category
order by n desc, task_category;

-- 10) V1/V2 각각의 Task Category별 Continuation Rate
select
  app_version,
  task_category,
  count(*) as n,
  round(
    100.0 * count(*) filter (where first_continue is true)
    / nullif(count(*) filter (where first_completed_at is not null), 0),
    2
  ) as continuation_rate_pct
from public.sessions
where task_category is not null
group by app_version, task_category
order by app_version, n desc, task_category;

-- 11) Task State × Task Category별 session 수 (V1은 task_state가 null이므로 V2 조합 분석)
select
  task_state,
  task_category,
  count(*) as n
from public.sessions
where task_state is not null and task_category is not null
group by task_state, task_category
order by n desc, task_state, task_category;

-- 12) Task State × Task Category별 Completion Rate
-- 주의: category는 첫 완료 후 수집되므로, category가 있는 조합의 Completion Rate는 구조적으로 100%입니다.
select
  task_state,
  task_category,
  count(*) as n,
  round(
    100.0 * count(*) filter (where first_completed_at is not null)
    / nullif(count(*) filter (where started_at is not null), 0),
    2
  ) as completion_rate_pct
from public.sessions
where task_state is not null and task_category is not null
group by task_state, task_category
order by n desc, task_state, task_category;

-- 13) Task State × Task Category별 Continuation Rate
select
  task_state,
  task_category,
  count(*) as n,
  round(
    100.0 * count(*) filter (where first_continue is true)
    / nullif(count(*) filter (where first_completed_at is not null), 0),
    2
  ) as continuation_rate_pct
from public.sessions
where task_state is not null and task_category is not null
group by task_state, task_category
order by n desc, task_state, task_category;

-- 14) 재방문(리텐션) 버킷별 Continuation Rate
-- 세션 완료 시점의 누적 재진입 횟수(lifetime_session_count)가 높을수록 지속률이 오르는지 확인
select
  case
    when lifetime_session_count is null then 'unknown (구버전 데이터)'
    when lifetime_session_count = 1 then '1 (첫 재진입)'
    when lifetime_session_count between 2 and 3 then '2-3'
    else '4+'
  end as lifetime_session_bucket,
  count(*) as n,
  round(avg(current_streak_days)::numeric, 2) as avg_streak_days,
  round(
    100.0 * count(*) filter (where first_continue is true)
    / nullif(count(*) filter (where first_completed_at is not null), 0),
    2
  ) as continuation_rate_pct
from public.sessions
group by lifetime_session_bucket
order by lifetime_session_bucket;

-- 15) 연속 사용일수(streak) 분포
select
  current_streak_days,
  count(*) as n
from public.sessions
where current_streak_days is not null
group by current_streak_days
order by current_streak_days;

-- 16) 중단 이유별 분포
select
  stop_reason,
  count(*) as n
from public.sessions
where stop_reason is not null
group by stop_reason
order by n desc, stop_reason;

-- 17) 중단 이유별 평균 진행 cycle 수 (어떤 이유일 때 더 일찍 그만두는지)
select
  stop_reason,
  count(*) as n,
  round(avg(total_cycles)::numeric, 2) as average_cycle
from public.sessions
where stop_reason is not null
group by stop_reason
order by average_cycle asc;
