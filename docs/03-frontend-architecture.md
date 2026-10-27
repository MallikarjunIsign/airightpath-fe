# 03 — Frontend Architecture

React 18 + TypeScript, built by Vite, styled with Tailwind over CSS custom
properties. No Redux — shared state lives in five React contexts and everything
else is local component state.

`@` is aliased to `src/`, so imports read `@/services/...` everywhere.

## Folder map

| Folder | Holds |
| --- | --- |
| [`src/config/`](../src/config/) | Endpoints, routes, roles, permissions, env, feature configs, messages, validation |
| [`src/contexts/`](../src/contexts/) | Auth, Theme, Sidebar, ProfileImage, PendingAssessments |
| [`src/hooks/`](../src/hooks/) | 27 hooks — proctoring, media, timers, RBAC, websocket, utility |
| [`src/services/`](../src/services/) | One module per backend domain; the only place axios is used |
| [`src/types/`](../src/types/) | Shared TypeScript types mirroring backend DTOs |
| [`src/utils/`](../src/utils/) | Pure functions: scoring, formatting, exports, duration, storage |
| [`src/components/ui/`](../src/components/ui/) | 30 primitives (Button, Table, Modal, Toast, Badge …) |
| [`src/components/`](../src/components/) | Feature components grouped by area: `admin`, `admin/result`, `exam`, `interview`, `jobs`, `application`, `auth`, `layout`, `result` |
| [`src/pages/`](../src/pages/) | Route components: `admin`, `candidate`, `auth`, `public`, `errors` |
| [`src/theme/tokens.ts`](../src/theme/tokens.ts) | Design tokens |

## Startup

[`src/main.tsx`](../src/main.tsx) composes the provider tree, and the order is
deliberate:

```
StrictMode
 └ BrowserRouter
    └ ThemeProvider          theme applies even to an error screen
       └ ErrorBoundary       catches everything below it
          └ AuthProvider     bootstraps the session before any page renders
             └ ToastProvider
                └ ProfileImageProvider
                   └ SidebarProvider
                      └ PendingAssessmentsProvider
                         └ App   (routes)
```

`AuthProvider` bootstraps by reading the persisted access token and, if it has
expired, performing one refresh; only then do routes evaluate, so a reload does
not flash the login page.

## Routing and guards

Defined in [`src/App.tsx`](../src/App.tsx); every path constant lives in
[`src/config/routes.ts`](../src/config/routes.ts) (with helpers such as
`applyJobUrl(jobPrefix)` for shareable links).

| Branch | Guard | Layout |
| --- | --- | --- |
| `/`, `/about`, `/contact`, `/mobile-connect` | none | page-owned |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | redirects to the role dashboard when already signed in | page-owned |
| `/admin/*` | `ProtectedRoute allowedRoles={['ADMIN','SUPER_ADMIN']}` | `Layout` (sidebar + navbar) |
| `/candidate/*` | `ProtectedRoute` (authenticated) | `Layout` |
| `/candidate/exam/*` | `ProtectedRoute` | `ExamLayout` — **lockdown, no chrome** |
| `/candidate/interview/*` | `ProtectedRoute` | `InterviewLayout` — **lockdown, no chrome** |
| `/unauthorized`, `/forbidden`, `*` | none | error pages |

Exam and interview get their own layouts precisely so there is no sidebar,
navbar or navigation affordance to click during a proctored session.

Finer-grained gating inside a page uses
[`PermissionGate`](../src/components/auth/PermissionGate.tsx) and
[`RoleGate`](../src/components/auth/RoleGate.tsx), both backed by
[`useRbac()`](../src/hooks/useRbac.ts) which exposes `hasRole`, `hasAnyRole`,
`hasPermission`, `hasAnyPermission` and the `can` alias.

## State

| Context | Owns |
| --- | --- |
| [`AuthContext`](../src/contexts/AuthContext.tsx) | User, roles, permissions, `isAuthenticated`, login/logout, session bootstrap |
| [`ThemeContext`](../src/contexts/ThemeContext.tsx) | Light/dark, persisted, applied as CSS variables |
| [`SidebarContext`](../src/contexts/SidebarContext.tsx) | Collapsed/expanded sidebar |
| [`ProfileImageContext`](../src/contexts/ProfileImageContext.tsx) | Avatar bytes, so navbar and profile page share one fetch |
| [`PendingAssessmentsContext`](../src/contexts/PendingAssessmentsContext.tsx) | Assessments the signed-in candidate still has to sit — one fetch feeding both the sidebar dot and the notification bell. Candidates only; for admins it stays empty and never calls the endpoint |

Everything else is component state or `usePersistentState` /
`useLocalStorage` for values that must survive a reload (exam answers, draft
code).

## Service layer

Rules the codebase follows:

1. Pages and components never import axios. They call a service.
2. Services never hardcode a URL. They read
   [`ENDPOINTS`](../src/config/api.endpoints.ts).
3. Only [`api.service.ts`](../src/services/api.service.ts) configures axios.

| Service | Domain |
| --- | --- |
| [`api.service.ts`](../src/services/api.service.ts) | Axios instance, token store, interceptors, refresh, error extraction |
| [`auth.service.ts`](../src/services/auth.service.ts) | Login, register, refresh, logout, `/me`, OTP, passwords |
| [`user.service.ts`](../src/services/user.service.ts) | User list, profile, activate/deactivate, avatar |
| [`job.service.ts`](../src/services/job.service.ts) | Job CRUD; `isEndpointMissing` tolerates backends without update/delete |
| [`job-application.service.ts`](../src/services/job-application.service.ts) | Apply, list, screen, shortlist, referral status, all candidate mails |
| [`resume.service.ts`](../src/services/resume.service.ts) | Upload/update/view resume, bulk upload |
| [`ats.service.ts`](../src/services/ats.service.ts) | Batch resume screening |
| [`assessment.service.ts`](../src/services/assessment.service.ts) | Upload paper, assign, fetch, submit, save result, reschedule, question generation |
| [`compiler.service.ts`](../src/services/compiler.service.ts) | Run code, save unattempted, read code results |
| [`exam-proctoring.service.ts`](../src/services/exam-proctoring.service.ts) | Identity photo, room scan, capture reads |
| [`interview.service.ts`](../src/services/interview.service.ts) | Assign, results, stats, proctoring events, conversation, room verify |
| [`ai.service.ts`](../src/services/ai.service.ts) | Interview start/answer, voice lifecycle, recordings upload, compile |
| [`interview-ws.service.ts`](../src/services/interview-ws.service.ts) | STOMP client for the interview: connect, subscribe, send, binary frames |
| [`websocket.service.ts`](../src/services/websocket.service.ts) | Generic socket wrapper with typed handlers |
| [`prompt.service.ts`](../src/services/prompt.service.ts) | Job prompts and evaluation categories |

## Hooks

**Exam proctoring (L1)** — [`useExamProctoring`](../src/hooks/useExamProctoring.ts)
composes [`useFullscreen`](../src/hooks/useFullscreen.ts),
[`usePageVisibility`](../src/hooks/usePageVisibility.ts),
[`useFaceDetection`](../src/hooks/useFaceDetection.ts),
[`useExamCamera`](../src/hooks/useExamCamera.ts),
[`useMicNoiseLevel`](../src/hooks/useMicNoiseLevel.ts) and
[`useBeforeUnload`](../src/hooks/useBeforeUnload.ts). The page owns questions,
timer and submit; the hook owns proctoring. `begin()` runs the permission
sequence (fullscreen → models → camera) and `markActive()` turns the violation
counters on afterwards, so the initial permission prompts never register as
violations. [`useDevToolsDetection`](../src/hooks/useDevToolsDetection.ts) and
[`useIsDesktop`](../src/hooks/useIsDesktop.ts) round out the lockdown.

**Interview media (L2)** — [`useVoiceInterview`](../src/hooks/useVoiceInterview.ts)
is the state machine, over
[`useAudioStreaming`](../src/hooks/useAudioStreaming.ts),
[`useAudioChunking`](../src/hooks/useAudioChunking.ts),
[`useAudioPlayback`](../src/hooks/useAudioPlayback.ts),
[`useMediaRecorder`](../src/hooks/useMediaRecorder.ts),
[`useScreenRecorder`](../src/hooks/useScreenRecorder.ts),
[`useSpeechRecognition`](../src/hooks/useSpeechRecognition.ts),
[`useSpeechSynthesis`](../src/hooks/useSpeechSynthesis.ts),
[`useMobileStream`](../src/hooks/useMobileStream.ts) and
[`useWebSocket`](../src/hooks/useWebSocket.ts).

**Shared** — `useTimer`, `useQuestionTimer`, `useNow`, `useDebounce`,
`useLocalStorage`, `usePersistentState`, `useRbac`, `useJobListing`,
`useJobScoreboard`, `useResumeViewer`.

## Utilities worth knowing

| Utility | Purpose |
| --- | --- |
| [`exam-duration.utils.ts`](../src/utils/exam-duration.utils.ts) | Exam length = question count x per-question allowance, with admin override and clamping |
| [`result.utils.ts`](../src/utils/result.utils.ts) | Difficulty banding, coding-row merging, summary totals, submission metadata — shared by admin and candidate result views so both quote identical numbers |
| [`results-export.utils.ts`](../src/utils/results-export.utils.ts) | The Excel workbook. ExcelJS is dynamically imported inside the builder so a large dependency used by one admin button stays out of the bundle every candidate downloads. Cells carry typed values, never display strings |
| [`answer-sheet.utils.ts`](../src/utils/answer-sheet.utils.ts) | PDF answer sheets (jsPDF) |
| [`question-paper.utils.ts`](../src/utils/question-paper.utils.ts) | Parsing and counting questions in an uploaded paper |
| [`compiler.utils.ts`](../src/utils/compiler.utils.ts) | `isGraded` / `isPassed` verdict helpers |
| [`code.utils.ts`](../src/utils/code.utils.ts) | `isSkeletonCode` — tells an untouched template from a real attempt |
| [`jwt.utils.ts`](../src/utils/jwt.utils.ts) | `isJwtExpired`, used before spending a refresh |
| [`datetime.utils.ts`](../src/utils/datetime.utils.ts), [`format.utils.ts`](../src/utils/format.utils.ts) | `parseStamp` and display formatting for the mixed timestamp shapes the API returns |

## Configuration

| File | Contents |
| --- | --- |
| [`env.ts`](../src/config/env.ts) | `API_BASE_URL`, `WS_URL`, dev/prod flags. Code default is `http://localhost:8081`; `.env.example` ships `8082` — set it explicitly per environment |
| [`app.config.ts`](../src/config/app.config.ts) | Timeouts, file limits, compiler languages, exam and interview timing, pagination, WS reconnect policy |
| [`proctoring.config.ts`](../src/config/proctoring.config.ts) | Every exam proctoring switch and threshold, all driven by `VITE_PROCTORING_*` env vars so behaviour is tuned per environment without a code change |
| [`coding-exam.config.ts`](../src/config/coding-exam.config.ts) | Test-case visibility mode: `locked`, `open` or `partial` |
| [`api.endpoints.ts`](../src/config/api.endpoints.ts) | Every backend path |
| [`routes.ts`](../src/config/routes.ts) | Every frontend path |
| [`roles.ts`](../src/config/roles.ts), [`permissions.ts`](../src/config/permissions.ts) | RBAC name constants |
| [`messages.ts`](../src/config/messages.ts), [`error-messages.ts`](../src/config/error-messages.ts) | User-facing copy in one place |
| [`validation.ts`](../src/config/validation.ts) | Shared zod schemas |
| [`toast-events.ts`](../src/config/toast-events.ts) | Lets non-React code (the axios interceptor) raise a toast |

Note: [`permissions.ts`](../src/config/permissions.ts) is a client-side list and
is **not** identical to the backend `PermissionName` enum — see the mismatch
table in [08-security-rbac.md](08-security-rbac.md).

## Styling

Tailwind utilities over CSS custom properties (`var(--success)`,
`var(--error)`, `var(--warning)` …), so a theme switch re-paints without any
component knowing which theme is active. Tokens and component rules live in
[`../DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md).

## Build

| Command | Does |
| --- | --- |
| `npm run dev` | Vite dev server on `0.0.0.0:5173`, `/api` proxied to `http://localhost:8081` (host binding is what lets a phone on the LAN reach it for the room-scan flow) |
| `npm run build` | Production bundle to `dist/` |
| `npm run preview` | Serve the built bundle |
| `npm run typecheck` | `tsc --noEmit -p tsconfig.app.json` |
| `npm run lint` | ESLint 9 flat config |
