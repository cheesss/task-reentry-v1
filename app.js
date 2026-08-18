(function () {
  "use strict";

  const CONFIG = window.TASK_REENTRY_CONFIG || {};
  const VALID_VERSIONS = ["v1", "v2"];
  const TASK_CATEGORIES = new Set([
    "study", "reading", "assignment", "work", "coding", "research", "writing",
    "presentation", "exercise", "cleaning", "housework", "administrative",
    "communication", "personal_project", "hobby_creative", "other", "prefer_not_to_say",
  ]);
  const STOP_REASONS = new Set([
    "task_done", "tired", "interrupted_external", "cant_focus", "no_specific_reason", "prefer_not_to_say",
  ]);
  const QUICK_EXIT_THRESHOLD_MS = 5000;
  const STORAGE = {
    userId: "task_reentry_user_id",
    assignedVersion: "task_reentry_assigned_version",
    appState: "task_reentry_app_state_v2",
    eventQueue: "task_reentry_event_queue_v2",
    history: "task_reentry_history_v1",
    goal: "task_reentry_goal_v1",
  };

  const GUIDES = {
    not_started: {
      title: "준비하지 말고 바로 시작하세요.",
      steps: ["해야 할 파일, 책 또는 도구를 여세요.", "가장 작은 첫 행동 하나만 시작하세요.", "완성하려고 하지 않아도 됩니다."],
      cta: "5분 시작",
      timer: "가장 작은 첫 행동 하나만 시작하세요.",
    },
    interrupted: {
      title: "처음부터 다시 하지 마세요.",
      steps: ["마지막으로 했던 지점으로 돌아가세요.", "바로 다음 한 단위만 진행하세요.", "지난 내용을 다시 완벽하게 이해하려고 하지 않아도 됩니다."],
      cta: "5분 재시작",
      timer: "처음부터 다시 하지 말고\n다음 한 부분만 진행하세요.",
    },
    distracted: {
      title: "지금 하던 것 하나만 남기세요.",
      steps: ["새로운 일을 시작하지 마세요.", "방해되는 창이나 휴대폰을 잠시 치워두세요.", "현재 작업 하나만 5분 유지하세요."],
      cta: "집중 5분 시작",
      timer: "새로운 일은 시작하지 말고\n현재 작업 하나만 유지하세요.",
    },
    finishing: {
      title: "새로운 일을 추가하지 마세요.",
      steps: ["지금 작업에서 끝낼 수 있는 부분 하나만 고르세요.", "완성도를 높이려고 하지 마세요.", "현재 진행 중인 부분 하나만 마무리하세요."],
      cta: "마지막 5분 시작",
      timer: "완성도를 높이지 말고\n진행 중인 부분 하나만 마무리하세요.",
    },
  };

  const elements = {
    screens: Array.from(document.querySelectorAll("[data-screen]")),
    versionBadge: document.querySelector("[data-version-badge]"),
    timer: document.querySelector("[data-timer]"),
    timerLabel: document.querySelector("[data-timer-label]"),
    timerGuidance: document.querySelector("[data-timer-guidance]"),
    guideTitle: document.querySelector("[data-guide-title]"),
    guideSteps: document.querySelector("[data-guide-steps]"),
    guideCta: document.querySelector("[data-guide-cta]"),
    completeEyebrow: document.querySelector("[data-complete-eyebrow]"),
    taskCategoryBlock: document.querySelector("[data-task-category-block]"),
    feedbackBlock: document.querySelector("[data-feedback-block]"),
    totalMinutes: document.querySelector("[data-total-minutes]"),
    totalCycles: document.querySelector("[data-total-cycles]"),
    totalSessions: document.querySelector("[data-total-sessions]"),
    currentStreak: document.querySelector("[data-current-streak]"),
    doneEyebrow: document.querySelector("[data-done-eyebrow]"),
    doneTitle: document.querySelector("[data-done-title]"),
    doneDescription: document.querySelector("[data-done-description]"),
    stopReasonBlock: document.querySelector("[data-stop-reason-block]"),
    tiredBreakBlock: document.querySelector("[data-tired-break]"),
    tiredBreakTimer: document.querySelector("[data-tired-break-timer]"),
    sessionSummary: document.querySelector("[data-session-summary]"),
    quickExitActions: document.querySelector("[data-quick-exit-actions]"),
    streakBanners: Array.from(document.querySelectorAll("[data-streak-banner]")),
    goalPanel: document.querySelector("[data-goal-panel]"),
    goalMotivation: document.querySelector("[data-goal-motivation]"),
    goalToggle: document.querySelector("[data-goal-toggle]"),
    goalForm: document.querySelector("[data-goal-form]"),
    goalTextInput: document.querySelector("[data-goal-text-input]"),
    goalHoursInput: document.querySelector("[data-goal-hours-input]"),
    goalProgressRow: document.querySelector("[data-goal-progress-row]"),
    goalProgressText: document.querySelector("[data-goal-progress-text]"),
    goalGauge: document.querySelector("[data-goal-gauge]"),
    goalGaugeFill: document.querySelector("[data-goal-gauge-fill]"),
    exitDialog: document.querySelector("[data-exit-dialog]"),
    announcer: document.querySelector("[data-announcer]"),
  };

  let state = null;
  let timerInterval = null;
  let pageOpenedAt = Date.now();

  function uuid() {
    return typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function getUserId() {
    let id = localStorage.getItem(STORAGE.userId);
    if (!id) {
      id = uuid();
      localStorage.setItem(STORAGE.userId, id);
    }
    return id;
  }

  function getExperimentVersion() {
    const queryVersion = new URLSearchParams(location.search).get("version")?.toLowerCase();
    if (VALID_VERSIONS.includes(queryVersion)) return queryVersion;

    if (CONFIG.EXPERIMENT_MODE === "ab_test") {
      let assigned = localStorage.getItem(STORAGE.assignedVersion);
      if (!VALID_VERSIONS.includes(assigned)) {
        assigned = Math.random() < 0.5 ? "v1" : "v2";
        localStorage.setItem(STORAGE.assignedVersion, assigned);
      }
      return assigned;
    }

    return VALID_VERSIONS.includes(CONFIG.DEFAULT_VERSION) ? CONFIG.DEFAULT_VERSION : "v2";
  }

  function freshSession(version = getExperimentVersion()) {
    const now = Date.now();
    return {
      schemaVersion: 2,
      userId: getUserId(),
      sessionId: uuid(),
      version,
      taskState: null,
      taskCategory: null,
      screen: version === "v1" ? "home" : "state",
      pageOpenedAt: now,
      sessionStartedAt: null,
      timer: null,
      cycleIndex: 0,
      completedCycles: 0,
      accumulatedMs: 0,
      firstCompletedAt: null,
      firstContinue: null,
      reentryOutcome: null,
      feedback: null,
      stopReason: null,
      finishReason: null,
      quickExit: false,
      finishedAt: null,
      pageViewTracked: false,
      lifetimeSessionCount: null,
      currentStreakDays: null,
    };
  }

  function saveState() {
    localStorage.setItem(STORAGE.appState, JSON.stringify(state));
  }

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE.appState));
      const requestedVersion = getExperimentVersion();
      if (!parsed || parsed.schemaVersion !== 2 || parsed.version !== requestedVersion) return freshSession(requestedVersion);
      parsed.reentryOutcome ??= parsed.firstContinue === true ? "timer_continue" : parsed.firstContinue === false ? "stopped" : null;
      return parsed;
    } catch (error) {
      console.warn("저장된 진행 상태를 복구하지 못했습니다.", error);
      return freshSession();
    }
  }

  function todayLocalDateString(date = new Date()) {
    const offsetMs = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
  }

  function loadHistory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE.history));
      if (parsed && typeof parsed.totalSessions === "number") return parsed;
    } catch (error) {
      console.warn("사용 기록을 불러오지 못했습니다.", error);
    }
    return { totalSessions: 0, currentStreak: 0, longestStreak: 0, lastActiveDate: null, totalActiveMs: 0 };
  }

  function saveHistory(history) {
    localStorage.setItem(STORAGE.history, JSON.stringify(history));
  }

  function recordHistory() {
    const history = loadHistory();
    const todayStr = todayLocalDateString();
    if (history.lastActiveDate === todayStr) {
      // 같은 날 재진입은 streak을 유지합니다.
    } else if (history.lastActiveDate) {
      const diffDays = Math.round((new Date(todayStr) - new Date(history.lastActiveDate)) / 86400000);
      history.currentStreak = diffDays === 1 ? history.currentStreak + 1 : 1;
    } else {
      history.currentStreak = 1;
    }
    history.longestStreak = Math.max(history.longestStreak, history.currentStreak);
    history.totalSessions += 1;
    history.totalActiveMs += state.accumulatedMs;
    history.lastActiveDate = todayStr;
    saveHistory(history);
    return history;
  }

  function renderStreakBanner() {
    const history = loadHistory();
    let text = "";
    if (history.currentStreak >= 2) text = `연속 ${history.currentStreak}일째 다시 시작하고 있어요.`;
    else if (history.totalSessions >= 1) text = `벌써 ${history.totalSessions}번째 재진입이에요.`;
    elements.streakBanners.forEach((banner) => {
      banner.hidden = !text;
      banner.textContent = text;
    });
  }

  function withParticle(text) {
    const lastChar = text.charCodeAt(text.length - 1);
    if (lastChar < 0xac00 || lastChar > 0xd7a3) return `${text}를`;
    return (lastChar - 0xac00) % 28 !== 0 ? `${text}을` : `${text}를`;
  }

  function loadGoal() {
    let goal;
    try {
      goal = JSON.parse(localStorage.getItem(STORAGE.goal));
    } catch (error) {
      goal = null;
    }
    if (!goal || typeof goal !== "object") goal = { goalText: null, dailyGoalHours: null, todayDate: null, todayActiveMs: 0 };
    const todayStr = todayLocalDateString();
    if (goal.todayDate !== todayStr) {
      goal.todayDate = todayStr;
      goal.todayActiveMs = 0;
      saveGoal(goal);
    }
    return goal;
  }

  function saveGoal(goal) {
    localStorage.setItem(STORAGE.goal, JSON.stringify(goal));
  }

  function addTodayActiveMs(ms) {
    if (!(ms > 0)) return;
    const goal = loadGoal();
    goal.todayActiveMs += ms;
    saveGoal(goal);
  }

  function setGoal(goalText, dailyGoalHours) {
    const goal = loadGoal();
    const trimmed = (goalText || "").trim().slice(0, 60);
    goal.goalText = trimmed || null;
    goal.dailyGoalHours = Number.isFinite(dailyGoalHours) && dailyGoalHours > 0
      ? Math.round(Math.min(24, dailyGoalHours) * 10) / 10
      : null;
    saveGoal(goal);
    return goal;
  }

  function goalProgressPercent(goal) {
    if (!goal.dailyGoalHours) return null;
    return Math.min(100, Math.round((goal.todayActiveMs / (goal.dailyGoalHours * 3600000)) * 100));
  }

  function renderGoal() {
    const goal = loadGoal();
    const pct = goalProgressPercent(goal);

    elements.goalMotivation.hidden = !goal.goalText;
    elements.goalMotivation.textContent = goal.goalText ? `${withParticle(goal.goalText)} 위해 시작하자` : "";

    elements.goalProgressRow.hidden = pct === null;
    if (pct !== null) {
      elements.goalProgressText.textContent = `오늘 목표 ${goal.dailyGoalHours}시간 중 ${pct}% 채웠어요`;
      elements.goalGaugeFill.style.width = `${pct}%`;
      elements.goalGauge.setAttribute("aria-valuenow", String(pct));
    }

    elements.goalToggle.textContent = goal.goalText || goal.dailyGoalHours ? "목표 수정" : "목표 설정하기";
    elements.goalTextInput.value = goal.goalText || "";
    elements.goalHoursInput.value = goal.dailyGoalHours || "";
  }

  function formatTotalMinutes(ms) {
    const minutesText = `${Math.max(1, Math.round(ms / 60000))}분`;
    const pct = goalProgressPercent(loadGoal());
    return pct === null ? minutesText : `${minutesText} (오늘 목표의 ${pct}%)`;
  }

  function isRemoteConfigured() {
    return Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
  }

  async function supabaseRequest(path, options = {}) {
    if (!isRemoteConfigured()) return { skipped: true };
    const response = await fetch(`${CONFIG.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: CONFIG.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        "x-user-id": state.userId,
        Prefer: "return=minimal",
        ...(options.headers || {}),
      },
    });
    if (!response.ok) throw new Error(`Supabase ${response.status}`);
    return { ok: true };
  }

  function queueEvent(payload) {
    const queue = JSON.parse(localStorage.getItem(STORAGE.eventQueue) || "[]");
    queue.push(payload);
    localStorage.setItem(STORAGE.eventQueue, JSON.stringify(queue.slice(-200)));
  }

  async function flushEventQueue() {
    if (!isRemoteConfigured()) return;
    const queue = JSON.parse(localStorage.getItem(STORAGE.eventQueue) || "[]");
    if (!queue.length) return;
    try {
      await supabaseRequest("events", { method: "POST", body: JSON.stringify(queue) });
      localStorage.removeItem(STORAGE.eventQueue);
    } catch (error) {
      console.warn("대기 중인 이벤트 전송을 다음 접속 때 재시도합니다.", error);
    }
  }

  function commonEventData() {
    const now = Date.now();
    return {
      user_id: state.userId,
      session_id: state.sessionId,
      app_version: state.version,
      task_state: state.taskState,
      task_category: state.taskCategory,
      cycle_index: state.cycleIndex,
      event_time: new Date(now).toISOString(),
      elapsed_from_page_view: Math.max(0, now - pageOpenedAt),
      elapsed_from_session_start: state.sessionStartedAt ? Math.max(0, now - state.sessionStartedAt) : null,
    };
  }

  function trackEvent(eventName, metadata = {}) {
    const common = commonEventData();
    const payload = { ...common, event_name: eventName, metadata };
    console.log(`[Task Re-entry] ${eventName}`, payload);

    if (typeof window.gtag === "function") {
      window.gtag("event", eventName, {
        app_version: common.app_version,
        task_state: common.task_state || "none",
        task_category: common.task_category || "none",
        cycle_index: common.cycle_index,
        ...metadata,
      });
    }

    if (isRemoteConfigured()) {
      supabaseRequest("events", { method: "POST", body: JSON.stringify(payload) }).catch(() => queueEvent(payload));
    }
  }

  function sessionRow() {
    return {
      user_id: state.userId,
      session_id: state.sessionId,
      app_version: state.version,
      task_state: state.taskState,
      task_category: state.taskCategory,
      page_opened_at: new Date(state.pageOpenedAt).toISOString(),
      started_at: state.sessionStartedAt ? new Date(state.sessionStartedAt).toISOString() : null,
      first_completed_at: state.firstCompletedAt ? new Date(state.firstCompletedAt).toISOString() : null,
      finished_at: state.finishedAt ? new Date(state.finishedAt).toISOString() : null,
      first_continue: state.firstContinue,
      reentry_outcome: state.reentryOutcome,
      total_cycles: state.completedCycles,
      feedback: state.feedback,
      stop_reason: state.stopReason,
      lifetime_session_count: state.lifetimeSessionCount,
      current_streak_days: state.currentStreakDays,
    };
  }

  function saveSession() {
    saveState();
    if (!isRemoteConfigured()) return;
    supabaseRequest("sessions?on_conflict=session_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(sessionRow()),
    }).catch((error) => console.warn("세션 데이터 저장을 건너뜁니다.", error));
  }

  function initAnalytics() {
    if (!CONFIG.GA_MEASUREMENT_ID || document.querySelector("script[data-ga]")) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", CONFIG.GA_MEASUREMENT_ID, { send_page_view: false, anonymize_ip: true });
    const script = document.createElement("script");
    script.async = true;
    script.dataset.ga = "true";
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(CONFIG.GA_MEASUREMENT_ID)}`;
    document.head.append(script);
  }

  function showScreen(name, focus = true) {
    elements.screens.forEach((screen) => { screen.hidden = screen.dataset.screen !== name; });
    elements.goalPanel.hidden = !(name === "home" || name === "state");
    state.screen = name;
    saveState();
    if (focus) {
      requestAnimationFrame(() => document.querySelector(`[data-screen="${name}"] h1`)?.focus({ preventScroll: true }));
    }
  }

  function renderGuide() {
    const guide = GUIDES[state.taskState];
    if (!guide) return showScreen("state");
    elements.guideTitle.textContent = guide.title;
    elements.guideSteps.replaceChildren(...guide.steps.map((step) => {
      const item = document.createElement("li");
      item.textContent = step;
      return item;
    }));
    elements.guideCta.textContent = guide.cta;
    showScreen("guide");
  }

  function selectTaskState(taskState) {
    if (!GUIDES[taskState]) return;
    state.taskState = taskState;
    trackEvent("state_selected");
    saveSession();
    renderGuide();
    trackEvent("guide_viewed");
  }

  function formatRemaining(ms) {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function timerDuration() {
    const value = Number(CONFIG.TIMER_DURATION_MS);
    return Number.isFinite(value) && value > 0 ? value : 300000;
  }

  function timerGuidance() {
    return state.version === "v2" && GUIDES[state.taskState]
      ? GUIDES[state.taskState].timer
      : "지금 해야 할 일 하나만 해보세요.\n완성하려고 하지 않아도 됩니다.";
  }

  function startTimer() {
    const now = Date.now();
    const cycleIndex = state.cycleIndex + 1;
    state.sessionStartedAt ||= now;
    state.cycleIndex = cycleIndex;
    state.timer = { startedAt: now, endAt: now + timerDuration(), cycleIndex };
    saveSession();
    trackEvent(cycleIndex === 1 ? "start_5min" : "continue_5min");
    renderTimer();
  }

  function renderTimer() {
    if (!state.timer) return;
    clearInterval(timerInterval);
    elements.timerLabel.textContent = state.timer.cycleIndex === 1 ? "첫 번째 5분" : `${state.timer.cycleIndex}번째 5분`;
    elements.timerGuidance.textContent = timerGuidance();
    showScreen("timer", false);

    const tick = () => {
      const remaining = state.timer.endAt - Date.now();
      elements.timer.textContent = formatRemaining(remaining);
      if (remaining <= 0) finishTimer();
    };
    tick();
    if (state.timer) timerInterval = window.setInterval(tick, 250);
  }

  function finishTimer() {
    const completedTimer = state.timer;
    if (!completedTimer) return;
    clearInterval(timerInterval);
    timerInterval = null;
    const actualElapsed = Math.max(0, Date.now() - completedTimer.startedAt);
    state.accumulatedMs += Math.min(actualElapsed, timerDuration());
    state.completedCycles = Math.max(state.completedCycles, completedTimer.cycleIndex);
    state.timer = null;
    if (completedTimer.cycleIndex === 1) {
      state.firstCompletedAt ||= Date.now();
      trackEvent("complete_5min", { actual_elapsed_ms: actualElapsed });
    } else {
      trackEvent("extra_5min_complete", { actual_elapsed_ms: actualElapsed });
    }
    elements.completeEyebrow.textContent = completedTimer.cycleIndex === 1 ? "첫 번째 5분을 채웠어요" : `${completedTimer.cycleIndex}번째 5분을 채웠어요`;
    elements.feedbackBlock.hidden = completedTimer.cycleIndex !== 1;
    elements.taskCategoryBlock.hidden = completedTimer.cycleIndex !== 1;
    renderTaskCategorySelection();
    saveSession();
    showScreen("complete");
    elements.announcer.textContent = "5분이 완료되었습니다.";
  }

  function continueTimer() {
    if (state.completedCycles === 1 && state.firstContinue === null) {
      state.firstContinue = true;
      state.reentryOutcome = "timer_continue";
    }
    saveSession();
    startTimer();
  }

  function continueIndependently() {
    if (state.completedCycles === 1 && state.firstContinue === null) {
      state.firstContinue = false;
      state.reentryOutcome = "independent_continue";
    }
    trackEvent("continue_independently");
    finishSession("independent_continue");
  }

  function finishSession(reason = "stopped") {
    clearInterval(timerInterval);
    let quickExit = false;
    if (state.timer) {
      const partialMs = Math.max(0, Date.now() - state.timer.startedAt);
      state.accumulatedMs += partialMs;
      quickExit = state.completedCycles === 0 && partialMs < QUICK_EXIT_THRESHOLD_MS;
      trackEvent("early_exit", { elapsed_in_cycle_ms: partialMs, reason, quick_exit: quickExit });
      state.timer = null;
    } else {
      if (state.completedCycles === 1 && state.firstContinue === null) {
        state.firstContinue = false;
        state.reentryOutcome = reason === "independent_continue" ? "independent_continue" : "stopped";
      }
      if (reason !== "independent_continue") trackEvent("stop_after_5min");
    }
    state.quickExit = quickExit;
    state.finishReason = reason;
    state.finishedAt = Date.now();
    const history = quickExit ? loadHistory() : recordHistory();
    state.lifetimeSessionCount = history.totalSessions;
    state.currentStreakDays = history.currentStreak;
    if (!quickExit) addTodayActiveMs(state.accumulatedMs);
    trackEvent("session_finished", {
      reason,
      total_cycles: state.completedCycles,
      total_active_ms: state.accumulatedMs,
      lifetime_session_count: history.totalSessions,
      current_streak_days: history.currentStreak,
      counted_in_retention: !quickExit,
      quick_exit: quickExit,
    });
    elements.totalMinutes.textContent = formatTotalMinutes(state.accumulatedMs);
    elements.totalCycles.textContent = `${state.completedCycles}회`;
    elements.totalSessions.textContent = `${history.totalSessions}회`;
    elements.currentStreak.textContent = `${history.currentStreak}일째`;
    renderDoneContent();
    renderStopReasonSelection();
    saveSession();
    showScreen("done");
  }

  function resumeQuickExit() {
    if (!state.quickExit) return;
    const now = Date.now();
    state.quickExit = false;
    state.finishReason = null;
    state.finishedAt = null;
    state.timer = { startedAt: now, endAt: now + timerDuration(), cycleIndex: state.cycleIndex || 1 };
    trackEvent("quick_exit_resumed");
    saveSession();
    renderTimer();
  }

  function renderDoneContent() {
    const independent = state.finishReason === "independent_continue" || state.reentryOutcome === "independent_continue";
    const quickExit = Boolean(state.quickExit);
    if (quickExit) {
      elements.doneEyebrow.textContent = "잠깐만요";
      elements.doneTitle.textContent = "잘못 누르셨나요?";
      elements.doneDescription.innerHTML = "괜찮아요, 바로 다시 시작할 수 있어요.<br />정말 그만두고 싶다면 처음으로 돌아가도 됩니다.";
    } else {
      elements.doneEyebrow.textContent = independent ? "작업 흐름을 되찾았어요" : "작업 재진입을 마쳤어요";
      elements.doneTitle.textContent = independent ? "이제 그대로 이어가세요" : "오늘은 여기까지";
      elements.doneDescription.innerHTML = independent
        ? "타이머 없이도 이어갈 수 있다면 재진입에 성공한 거예요.<br />이 화면은 이제 닫아도 됩니다."
        : "5분이라도 다시 시작했다는 것으로 충분합니다.<br />다시 흐름이 끊기면 언제든 돌아오세요.";
    }
    elements.stopReasonBlock.hidden = independent || quickExit;
    elements.sessionSummary.hidden = quickExit;
    elements.quickExitActions.hidden = !quickExit;
  }

  function restore() {
    elements.versionBadge.textContent = state.version.toUpperCase();
    renderStreakBanner();
    renderGoal();
    if (state.timer) {
      if (state.timer.endAt <= Date.now()) finishTimer();
      else renderTimer();
      return;
    }
    if (state.screen === "guide" && state.taskState) return renderGuide();
    if (state.screen === "complete") {
      elements.feedbackBlock.hidden = state.completedCycles !== 1;
      elements.taskCategoryBlock.hidden = state.completedCycles !== 1;
      renderTaskCategorySelection();
      return showScreen("complete", false);
    }
    if (state.screen === "done") {
      elements.totalMinutes.textContent = formatTotalMinutes(state.accumulatedMs);
      elements.totalCycles.textContent = `${state.completedCycles}회`;
      elements.totalSessions.textContent = `${state.lifetimeSessionCount ?? "-"}회`;
      elements.currentStreak.textContent = `${state.currentStreakDays ?? "-"}일째`;
      renderDoneContent();
      renderStopReasonSelection();
      return showScreen("done", false);
    }
    showScreen(state.version === "v1" ? "home" : "state", false);
  }

  function restart() {
    state = freshSession(state.version);
    pageOpenedAt = Date.now();
    saveSession();
    trackEvent("page_view");
    state.pageViewTracked = true;
    saveState();
    restore();
  }

  function renderTaskCategorySelection() {
    document.querySelectorAll("[data-task-category]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.taskCategory === state.taskCategory));
    });
  }

  function selectTaskCategory(taskCategory) {
    if (!TASK_CATEGORIES.has(taskCategory) || state.completedCycles < 1 || state.completedCycles > 1) return;
    if (state.taskCategory === taskCategory) return;
    state.taskCategory = taskCategory;
    renderTaskCategorySelection();
    trackEvent("task_category_selected", { task_category: taskCategory, timestamp: new Date().toISOString() });
    saveSession();
    elements.announcer.textContent = "작업 종류가 선택되었습니다.";
  }

  function renderStopReasonSelection() {
    document.querySelectorAll("[data-stop-reason]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.stopReason === state.stopReason));
    });
    elements.tiredBreakBlock.hidden = state.stopReason !== "tired";
  }

  function startBreakTimer() {
    const BREAK_MS = 3 * 60 * 1000;
    const endAt = Date.now() + BREAK_MS;
    const startBtn = elements.tiredBreakBlock.querySelector("[data-action='start-break']");
          startBtn.hidden = true;

    const breakInterval = setInterval(() => {
      const remaining = endAt - Date.now();
      if (remaining <= 0) {
        clearInterval(breakInterval);
        elements.tiredBreakTimer.textContent = "휴식 끝! 다시 돌아올 준비가 되면 시작하세요.";
        return;
      }
      elements.tiredBreakTimer.textContent = `쉬는 중... ${formatRemaining(remaining)}`;
    }, 250);

    trackEvent("tired_break_started");
  }
  function selectStopReason(reason) {
    if (!STOP_REASONS.has(reason) || state.stopReason === reason) return;
    state.stopReason = reason;
    renderStopReasonSelection();
    trackEvent("stop_reason_selected", { stop_reason: reason });
    saveSession();
    elements.announcer.textContent = "중단 이유가 선택되었습니다.";
  }

  function bindEvents() {
    document.querySelector("[data-action='v1-start']").addEventListener("click", startTimer);
    document.querySelector("[data-action='guide-start']").addEventListener("click", startTimer);
    document.querySelector("[data-action='continue']").addEventListener("click", continueTimer);
    document.querySelector("[data-action='continue-independently']").addEventListener("click", continueIndependently);
    document.querySelector("[data-action='resume-quick-exit']").addEventListener("click", resumeQuickExit);
    document.querySelector("[data-action='stop']").addEventListener("click", () => finishSession("stopped"));
    document.querySelector("[data-action='restart']").addEventListener("click", restart);
    document.querySelector("[data-action='home']").addEventListener("click", (event) => { event.preventDefault(); restart(); });
    document.querySelectorAll("[data-state]").forEach((button) => button.addEventListener("click", () => selectTaskState(button.dataset.state)));
    document.querySelectorAll("[data-task-category]").forEach((button) => button.addEventListener("click", () => selectTaskCategory(button.dataset.taskCategory)));
    document.querySelectorAll("[data-stop-reason]").forEach((button) => button.addEventListener("click", () => selectStopReason(button.dataset.stopReason)));
    document.querySelector("[data-action='start-break']")?.addEventListener("click", startBreakTimer);

    document.querySelector("[data-action='ask-exit']").addEventListener("click", () => elements.exitDialog.showModal());
    document.querySelector("[data-action='cancel-exit']").addEventListener("click", () => elements.exitDialog.close("cancel"));
    document.querySelector("[data-action='confirm-exit']").addEventListener("click", () => {
      elements.exitDialog.close("confirm");
      finishSession("early_exit");
    });

    document.querySelectorAll("[data-feedback]").forEach((button) => button.addEventListener("click", () => {
      state.feedback = button.dataset.feedback;
      document.querySelectorAll("[data-feedback]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      trackEvent("feedback_selected", { feedback: state.feedback });
      saveSession();
    }));

    elements.goalToggle.addEventListener("click", () => { elements.goalForm.hidden = !elements.goalForm.hidden; });
    document.querySelector("[data-action='close-goal-form']").addEventListener("click", () => { elements.goalForm.hidden = true; });
    document.querySelector("[data-action='save-goal']").addEventListener("click", () => {
      setGoal(elements.goalTextInput.value, Number(elements.goalHoursInput.value));
      renderGoal();
      elements.goalForm.hidden = true;
      elements.announcer.textContent = "목표가 저장되었습니다.";
    });

    document.addEventListener("visibilitychange", () => trackEvent(document.hidden ? "tab_hidden" : "tab_visible"));
    window.addEventListener("online", flushEventQueue);
  }

  function initApp() {
    initAnalytics();
    state = loadState();
    pageOpenedAt = Date.now();
    bindEvents();
    if (!state.pageViewTracked) {
      trackEvent("page_view");
      state.pageViewTracked = true;
      saveSession();
    }
    restore();
    flushEventQueue();
  }

  window.TaskReentry = { getExperimentVersion, formatRemaining };
  initApp();
})();
