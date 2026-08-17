import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const html = await readFile(new URL("index.html", root), "utf8");
const app = await readFile(new URL("app.js", root), "utf8");
const config = await readFile(new URL("config.js", root), "utf8");
const sql = await readFile(new URL("supabase_setup.sql", root), "utf8");
const analysis = await readFile(new URL("analysis_queries.sql", root), "utf8");

test("V1과 V2 진입 화면 계약을 포함한다", () => {
  assert.match(html, /data-action="v1-start"/);
  for (const state of ["not_started", "interrupted", "distracted", "finishing"]) assert.match(html, new RegExp(`data-state="${state}"`));
});

test("Task Category를 첫 완료 후 선택형 metadata로 수집한다", () => {
  for (const category of ["study", "reading", "assignment", "work", "coding", "research", "writing", "presentation", "exercise", "cleaning", "housework", "administrative", "communication", "personal_project", "hobby_creative", "other", "prefer_not_to_say"]) {
    assert.match(html, new RegExp(`data-task-category="${category}"`));
  }
  assert.match(app, /"task_category_selected"/);
  assert.match(app, /completedCycles < 1/);
  assert.match(app, /document\.querySelector\("\[data-action='continue'\]"\)\.addEventListener\("click", continueTimer\)/);
  assert.match(app, /document\.querySelector\("\[data-action='stop'\]"\)\.addEventListener/);
  assert.match(sql, /task_category text/);
});

test("독립적으로 이어가기와 Re-entry Success 측정 계약을 포함한다", () => {
  assert.match(html, /data-action="continue-independently"/);
  assert.match(html, /이제 혼자 이어서 할게/);
  assert.match(app, /"continue_independently"/);
  assert.match(app, /reentryOutcome/);
  assert.match(sql, /reentry_outcome text/);
  assert.match(analysis, /reentry_success_rate_pct/);
});

test("Task Category 분석은 모든 결과에 표본 수 n을 포함한다", () => {
  assert.match(analysis, /Task Category별 session 수/);
  assert.match(analysis, /Task State × Task Category별 Continuation Rate/);
  assert.ok((analysis.match(/count\(\*\) as n/g) || []).length >= 7);
});

test("필수 이벤트를 모두 추적한다", () => {
  for (const event of ["page_view", "state_selected", "guide_viewed", "start_5min", "complete_5min", "continue_5min", "continue_independently", "stop_after_5min", "extra_5min_complete", "feedback_selected", "session_finished", "early_exit"]) {
    assert.match(app, new RegExp(`"${event}"`));
  }
});

test("기본 버전과 실험 모드를 설정에서 분리한다", () => {
  assert.match(config, /DEFAULT_VERSION:\s*"v2"/);
  assert.match(config, /EXPERIMENT_MODE:\s*"manual"/);
});

test("재방문(누적 세션·연속일) 기록 계약을 포함한다", () => {
  assert.match(html, /data-total-sessions/);
  assert.match(html, /data-current-streak/);
  assert.match(html, /data-streak-banner/);
  assert.match(app, /function recordHistory/);
  assert.match(app, /function renderStreakBanner/);
  assert.match(app, /"lifetime_session_count"|lifetime_session_count:/);
  assert.match(app, /"current_streak_days"|current_streak_days:/);
  assert.match(sql, /lifetime_session_count/);
  assert.match(sql, /current_streak_days/);
});

test("중단 이유 선택 계약을 포함한다", () => {
  for (const reason of ["task_done", "tired", "interrupted_external", "cant_focus", "no_specific_reason", "prefer_not_to_say"]) {
    assert.match(html, new RegExp(`data-stop-reason="${reason}"`));
  }
  assert.match(app, /"stop_reason_selected"/);
  assert.match(app, /function selectStopReason/);
  assert.match(sql, /stop_reason text/);
});

test("가이드 관련성 평가 계약을 포함한다", () => {
  for (const value of ["not_relevant", "neutral", "relevant"]) {
    assert.match(html, new RegExp(`data-guide-relevance="${value}"`));
  }
  assert.match(app, /"guide_relevance_rated"/);
  assert.match(app, /function selectGuideRelevance/);
  assert.match(sql, /guide_relevance text/);
  assert.match(analysis, /가이드 관련성/);
});

test("Supabase RLS와 SELECT 차단 계약을 포함한다", () => {
  assert.match(sql, /enable row level security/i);
  assert.doesNotMatch(sql, /grant\s+select\s+on\s+public\.(sessions|events)\s+to\s+anon/i);
});
