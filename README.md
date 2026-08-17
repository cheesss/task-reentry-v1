# 5분 Task Re-entry

멈춘 사용자가 현재의 `Task State`에 맞는 최소 행동으로 작업 흐름에 다시 들어가도록 돕는 모바일 우선 웹서비스입니다. AI API, 로그인, 할 일 목록 없이 HTML/CSS/Vanilla JavaScript만 사용합니다.

## V1과 V2

| 버전 | 흐름 | 목적 |
|---|---|---|
| V1 | 접속 → 5분 시작 → 완료 → 계속/종료 | 단순 5분 시작 baseline |
| V2 | 접속 → 상태 선택 → 상태별 가이드 → 5분 시작 → 완료 → 계속/종료 | Task State 기반 개선안 |

기본값은 V2입니다.

- V1: `/?version=v1`
- V2: `/?version=v2`
- 기본값 변경: `config.js`의 `DEFAULT_VERSION`
- 자동 A/B: `config.js`의 `EXPERIMENT_MODE`를 `ab_test`로 변경

URL 파라미터는 수동 설정과 A/B 배정을 우선하여 테스트 버전을 강제합니다. A/B 배정은 브라우저 `localStorage`에 유지됩니다.

## 파일 구조

- `index.html`: V1/V2 화면, 타이머, 종료 확인 대화상자
- `style.css`: 모바일 우선 레이아웃과 접근성 스타일
- `app.js`: 상태 머신, timestamp 타이머, 복구, 재방문(누적 세션·연속일) 기록, 이벤트 및 원격 저장
- `config.js`: 버전·GA4·Supabase 설정
- `supabase_setup.sql`: 테이블, 인덱스, RLS 정책
- `analysis_queries.sql`: V1/V2 및 Task State KPI 분석
- `tests/contracts.test.mjs`: 정적 기능·보안 계약 검사

## 로컬 실행

Node.js가 있다면 프로젝트 폴더에서 실행합니다.

```bash
npx serve .
```

표시된 로컬 주소 뒤에 `?version=v1` 또는 `?version=v2`를 붙입니다. 단순 파일 더블클릭보다 HTTP 서버 사용을 권장합니다.

검사:

```bash
npm run check
```

## Supabase 연결

1. Supabase 프로젝트를 생성합니다.
2. SQL Editor에서 `supabase_setup.sql` 전체를 실행합니다.
3. Project Settings → API에서 Project URL과 anon/public key를 확인합니다.
4. `config.js`에 값을 입력합니다.

```js
SUPABASE_URL: "https://YOUR_PROJECT.supabase.co",
SUPABASE_ANON_KEY: "YOUR_PUBLIC_ANON_KEY",
```

`service_role` 키는 절대로 프런트엔드에 넣지 않습니다. RLS는 익명 INSERT와 동일 `x-user-id`의 세션 UPDATE만 허용하며 SELECT는 허용하지 않습니다. 헤더 ID는 인증 수단이 아니므로 민감정보는 저장하지 않습니다. Supabase가 비어 있거나 네트워크 장애가 발생해도 서비스는 계속 작동하고, 실패한 이벤트는 브라우저 큐에 최대 200개 보존되어 다음 온라인 접속 때 재전송됩니다.

Vercel 환경변수는 정적 JavaScript에 자동 주입되지 않습니다. 이 MVP에서는 `config.js`의 public URL/anon key만 사용하거나, 배포 전에 별도 빌드 단계로 `config.js`를 생성하세요. 둘 다 공개 가능한 값이지만 RLS는 반드시 유지해야 합니다.

## Google Analytics 4 연결

GA4 Data Stream에서 Measurement ID를 확인하고 `config.js`에 입력합니다.

```js
GA_MEASUREMENT_ID: "G-XXXXXXXXXX",
```

ID가 비어 있으면 GA 스크립트를 불러오지 않으며 모든 이벤트는 콘솔에 계속 출력됩니다. 주요 custom event는 `start_5min`, `complete_5min`, `continue_5min`, `stop_after_5min`, `state_selected`이며 `app_version`, `task_state`, `cycle_index`가 parameter로 전달됩니다.

## 데이터 모델과 이벤트

익명 브라우저 단위 `user_id`와 실행 단위 `session_id`를 별도로 생성합니다. 수집 이벤트:

- `page_view`
- `state_selected`, `guide_viewed`
- `start_5min`, `complete_5min`
- `continue_5min`, `continue_independently`, `extra_5min_complete`
- `stop_after_5min`, `early_exit`, `session_finished`
- `feedback_selected`
- `task_category_selected` (첫 5분 완료 후 카테고리를 선택할 때 기록)
- `stop_reason_selected` (종료 화면에서 중단 이유를 선택할 때 기록)
- `guide_relevance_rated` (가이드 화면에서 관련성을 평가할 때 기록, V2 전용)
- `tab_hidden`, `tab_visible`

모든 이벤트에 버전, 상태, 선택된 작업 종류, cycle, 시간, page/session 경과시간을 포함합니다. V1의 `task_state`는 `null`입니다. `task_category`는 첫 5분 완료 뒤 선택적으로 수집되며 가이드나 Task State 판정에는 사용하지 않습니다.

## 재방문 기록 (누적 세션·연속 사용일)

브라우저 `localStorage`(`task_reentry_history_v1`)에 기기 단위로 누적 재진입 세션 수(`totalSessions`)와 연속 사용일(`currentStreak`)을 기록합니다. 세션이 `done` 화면에 도달할 때마다 갱신되며, 홈/상태선택 화면에는 "연속 N일째" 또는 "벌써 N번째 재진입" 배너로 보여주고, 종료 화면에는 누적 세션 수와 연속일을 함께 표시합니다.

세션이 끝날 때 그 시점의 누적값을 `sessions.lifetime_session_count`, `sessions.current_streak_days` 컬럼과 `session_finished` 이벤트 metadata에 스냅샷으로 함께 저장하므로, "재방문 횟수가 많을수록 Continuation Rate가 높아지는가"를 SQL로 검증할 수 있습니다. 로그인이 없으므로 기기를 바꾸면 기록도 초기화됩니다.

## 가이드 관련성 평가

V2의 가이드 화면에서 "이 안내가 지금 상황과 잘 맞나요?"를 선택 사항으로 물어 `sessions.guide_relevance`(`not_relevant`/`neutral`/`relevant`)에 저장합니다. Task State별 완료율·재진입 성공률 차이는 보이더라도 "왜" 특정 상태의 가이드가 덜 통하는지는 알기 어려웠는데, 이 평가를 타이머 시작 전(결과를 모르는 시점)에 받아서 가이드 문구 자체의 관련성을 outcome과 분리해 측정합니다. `analysis_queries.sql`의 18번(Task State별 관련성 분포), 19번(관련성과 재진입 성공률의 관계) 쿼리로 확인합니다.

## 중단 이유

완료(`done`) 화면에서 "오늘은 어떤 이유로 마무리했나요?"를 선택 사항으로 물어 `sessions.stop_reason`에 저장합니다(`task_done`/`tired`/`interrupted_external`/`cant_focus`/`no_specific_reason`/`prefer_not_to_say`). 5분을 다 채우고 멈춘 경우와 타이머 중간에 종료한 경우 모두 이 화면으로 오므로 두 상황을 모두 포괄합니다. `analysis_queries.sql`의 16, 17번 쿼리로 이유별 분포와 평균 진행 cycle을 확인해 V1/V2의 부족한 지점을 데이터로 파악할 수 있습니다.

## KPI 확인

Supabase SQL Editor에서 `analysis_queries.sql`의 쿼리를 실행합니다.

- Start Rate = `started_at 존재 / 전체 session`
- Completion Rate = `first_completed_at 존재 / started_at 존재`
- Continuation Rate = `first_continue = true / first_completed_at 존재`
- Re-entry Success Rate = `reentry_outcome이 timer_continue 또는 independent_continue / first_completed_at 존재`
- Independent Continuation Rate = `reentry_outcome = independent_continue / first_completed_at 존재`
- Early Exit Rate = `early_exit session / start_5min session`
- Average Cycle = `avg(total_cycles)`

Task Category 분석 쿼리는 카테고리별 및 `Task State × Task Category`별 session 수, Completion Rate, Continuation Rate를 제공합니다. 모든 결과에 표본 수 `n`이 함께 표시됩니다. 카테고리를 선택하지 않은 세션은 카테고리 세부 분석에서 제외되지만 전체 V1/V2 KPI에는 그대로 포함됩니다.

카테고리를 첫 5분 완료 후에만 묻기 때문에, 카테고리가 기록된 표본의 Completion Rate는 구조적으로 100%입니다. 카테고리별 완료율을 비편향적으로 비교하려면 시작 전에 카테고리를 수집해야 하며, 현재 UX 요구사항에서는 Continuation Rate가 유효한 카테고리 비교 지표입니다.

Main KPI는 V1과 V2의 **Re-entry Success Rate** 차이입니다. 타이머를 다시 시작한 비율은 기존 Continuation Rate로, 타이머 없이 이어가겠다고 응답한 비율은 Independent Continuation Rate로 함께 확인합니다. `independent_continue`는 실제 후속 행동이 아닌 자기보고 의도라는 한계가 있습니다. V2는 `task_state`별 사용자 수, 시작률, 완료율, 재진입 성공률과 평균 cycle도 비교합니다.

공개 관리자 페이지는 만들지 않았습니다. anon key로 전체 분석 데이터를 읽게 하면 RLS와 개인정보 최소화 원칙을 깨기 때문입니다. 분석은 인증된 Supabase Dashboard의 SQL Editor 또는 CSV export에서 수행합니다.

## Vercel 배포

Vercel Dashboard에서 새 프로젝트를 만들고 이 폴더를 배포하거나 CLI를 사용합니다.

```bash
npx vercel deploy --prod
```

정적 사이트이므로 별도 Build Command는 필요하지 않습니다. Output Directory는 `.`입니다. Vercel Deployment Protection이 활성화되어 있으면 공개 방문자는 로그인 화면을 보게 되므로, 공개 실험 전 Project Settings → Deployment Protection을 확인합니다.

## 동작 및 복구

- 타이머는 `endAt - Date.now()`로 계산되어 백그라운드에서도 정확합니다.
- 새로고침 시 종료 전 타이머를 복구합니다.
- 복귀 시 이미 종료 시간이 지났다면 완료 화면으로 이동합니다.
- 첫 5분과 추가 cycle을 구분하며 여러 번 연장할 수 있습니다.
- 중간 종료 시 진행 milliseconds와 `early_exit`을 기록합니다.
- 종료 화면은 총 진행시간과 완료 cycle을 표시합니다.

## 배포 전 체크리스트

1. `npm run check`
2. `?version=v1`, `?version=v2` 진입 확인
3. 모바일 375px/430px와 데스크톱 확인
4. 새로고침 복구와 중간 종료 확인
5. Supabase SQL 실행 후 Network 탭에서 2xx 확인
6. GA4 DebugView에서 custom event 확인
7. Vercel Deployment Protection과 공개 URL 확인
