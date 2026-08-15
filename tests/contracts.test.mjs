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

test("Task Category 분석은 모든 결과에 표본 수 n을 포함한다", () => {
  assert.match(analysis, /Task Category별 session 수/);
  assert.match(analysis, /Task State × Task Category별 Continuation Rate/);
  assert.ok((analysis.match(/count\(\*\) as n/g) || []).length >= 7);
});

test("필수 이벤트를 모두 추적한다", () => {
  for (const event of ["page_view", "state_selected", "guide_viewed", "start_5min", "complete_5min", "continue_5min", "stop_after_5min", "extra_5min_complete", "feedback_selected", "session_finished", "early_exit"]) {
    assert.match(app, new RegExp(`"${event}"`));
  }
});

test("기본 버전과 실험 모드를 설정에서 분리한다", () => {
  assert.match(config, /DEFAULT_VERSION:\s*"v2"/);
  assert.match(config, /EXPERIMENT_MODE:\s*"manual"/);
});

test("Supabase RLS와 SELECT 차단 계약을 포함한다", () => {
  assert.match(sql, /enable row level security/i);
  assert.doesNotMatch(sql, /grant\s+select\s+on\s+public\.(sessions|events)\s+to\s+anon/i);
});
