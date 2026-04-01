# RightPath UI — Complete Knowledge Base

> **For:** Developers with zero React experience who need to understand, debug, and extend this project.
> **What you will learn:** React fundamentals, how this project is structured, how data flows between every file, and how to trace any bug end-to-end.

---

## Table of Contents

1. [Part 1: React Fundamentals (Learn First)](#part-1-react-fundamentals)
2. [Part 2: Project Architecture Overview](#part-2-project-architecture-overview)
3. [Part 3: Application Startup Flow](#part-3-application-startup-flow)
4. [Part 4: Folder-by-Folder Breakdown](#part-4-folder-by-folder-breakdown)
5. [Part 5: State Management — How Data is Stored](#part-5-state-management)
6. [Part 6: Data Flow — Complete Traces](#part-6-data-flow-complete-traces)
7. [Part 7: Authentication & Security Flow](#part-7-authentication--security-flow)
8. [Part 8: Routing & Page Navigation](#part-8-routing--page-navigation)
9. [Part 9: Component Communication Patterns](#part-9-component-communication-patterns)
10. [Part 10: API Layer — Frontend to Backend](#part-10-api-layer)
11. [Part 11: Feature Flows (End-to-End)](#part-11-feature-flows)
12. [Part 12: Styling System](#part-12-styling-system)
13. [Part 13: File Reference — Every File Explained](#part-13-file-reference)
14. [Part 14: How to Debug & Fix Bugs](#part-14-how-to-debug)

---

# Part 1: React Fundamentals

## What is React?

React is a JavaScript library for building user interfaces. Instead of writing HTML files and manipulating the DOM directly (like jQuery), you write **components** — small, reusable pieces of UI that React renders for you.

### Key Concept: Everything is a Component

```
Traditional HTML:          React:
┌──────────────┐          ┌──────────────┐
│ <html>       │          │ <App>        │
│   <body>     │          │   <Navbar>   │
│     <div>    │          │   <Sidebar>  │
│       ...    │          │   <Page>     │
│     </div>   │          │     <Card>   │
│   </body>    │          │     <Button> │
│ </html>      │          │   </Page>    │
└──────────────┘          └──────────────┘
```

A React component is just a **JavaScript function that returns HTML-like code (called JSX)**.

## JSX — HTML Inside JavaScript

```tsx
// This is a React component
function Greeting() {
  const name = "Pavan";
  return <h1>Hello, {name}!</h1>;  // ← This is JSX (HTML + JavaScript)
}
```

**JSX Rules:**
- Looks like HTML but lives inside `.tsx` files
- Use `{}` to embed JavaScript expressions: `{user.name}`, `{2 + 2}`
- Use `className` instead of `class` (because `class` is a reserved JS word)
- Every tag must be closed: `<img />`, `<br />`, `<input />`

## Props — Passing Data DOWN to Child Components

Props (properties) are how a **parent component sends data to a child component**. Think of them as function arguments.

```tsx
// Parent passes data via props
function ParentPage() {
  return <UserCard name="Pavan" email="pavan@example.com" />;
}

// Child receives data via props
function UserCard({ name, email }: { name: string; email: string }) {
  return (
    <div>
      <h2>{name}</h2>
      <p>{email}</p>
    </div>
  );
}
```

**Key rule:** Props flow ONE WAY — parent → child. A child cannot modify its props.

## State — Data That Changes Over Time

State is data that a component **owns and can change**. When state changes, React **re-renders** the component automatically.

```tsx
import { useState } from 'react';

function Counter() {
  // useState returns: [currentValue, functionToUpdateIt]
  const [count, setCount] = useState(0);  // 0 is the initial value

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
      {/* When clicked: setCount(1) → React re-renders → shows "Count: 1" */}
    </div>
  );
}
```

**When does re-render happen?**
1. `setCount()` is called with a new value
2. React compares old state (0) with new state (1)
3. They're different → React re-renders the component
4. The new JSX is computed and the screen updates

## Hooks — Special Functions for Components

Hooks are functions that start with `use` and let you "hook into" React features. You can ONLY call hooks at the top level of a component (not inside if/else or loops).

### `useState` — Store data that changes
```tsx
const [value, setValue] = useState(initialValue);
```

### `useEffect` — Run code when something changes (side effects)
```tsx
useEffect(() => {
  // This code runs AFTER the component renders
  console.log("Component rendered!");

  // Cleanup function (runs when component unmounts or before re-run)
  return () => {
    console.log("Cleaning up!");
  };
}, [dependency1, dependency2]);
// ↑ Dependency array: effect re-runs only when these values change
// [] = run once on mount only
// no array = run on every render (avoid this)
```

**Real example from our project** (`InterviewPage.tsx`):
```tsx
// Auto-scroll chat when conversation changes
useEffect(() => {
  if (chatContainerRef.current) {
    chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
  }
}, [conversation]);  // ← Runs every time 'conversation' state changes
```

### `useCallback` — Memoize a function (prevent re-creation)
```tsx
const handleClick = useCallback(() => {
  doSomething(a, b);
}, [a, b]);  // Only recreate if a or b changes
```

### `useRef` — Hold a value that doesn't trigger re-render
```tsx
const videoRef = useRef<HTMLVideoElement>(null);
// Later: videoRef.current gives you the actual <video> DOM element
```

### `useContext` — Access shared data without passing props
```tsx
const { user, login, logout } = useAuth();  // Gets auth data from Context
```

## Component Lifecycle (Simplified)

```
Component Created (Mount)
    │
    ├── useState initializes
    ├── First render happens
    ├── useEffect(() => {...}, []) runs ← "on mount"
    │
    ▼
Component Updates (Re-render)
    │
    ├── State changes (setState called)
    ├── Props change (parent re-renders)
    ├── Re-render happens
    ├── useEffect runs if dependencies changed
    │
    ▼
Component Removed (Unmount)
    │
    ├── useEffect cleanup functions run
    └── Component is gone from screen
```

## TypeScript in React

TypeScript adds **type safety** to JavaScript. Instead of hoping `user.email` exists, TypeScript guarantees it at compile time.

```tsx
// Define shape of data
interface UserInfo {
  email: string | null;     // email is a string OR null
  firstName: string | null;
}

// Use in component
function Profile({ user }: { user: UserInfo }) {
  return <p>{user.email}</p>;  // TypeScript knows email is string|null
}
```

**Key TypeScript syntax in our project:**
```tsx
type RoleName = 'SUPER_ADMIN' | 'ADMIN' | 'USER';   // Union type — one of these values
interface Props { name: string; age?: number; }       // ? means optional
const [items, setItems] = useState<string[]>([]);     // Generic — array of strings
Record<string, string>                                // Object with string keys and string values
```

---

# Part 2: Project Architecture Overview

## Technology Stack

| Technology | Purpose | File(s) |
|-----------|---------|---------|
| **React 18** | UI library — builds the interface | All `.tsx` files |
| **TypeScript** | Type-safe JavaScript | All `.ts`/`.tsx` files |
| **Vite** | Build tool — compiles & serves the app | `vite.config.ts` |
| **React Router v7** | Page navigation (SPA routing) | `App.tsx`, `routes.ts` |
| **Axios** | HTTP client — talks to backend | `api.service.ts` |
| **Tailwind CSS** | Utility-first CSS styling | `tailwind.config.js`, all `.tsx` files |
| **React Hook Form + Zod** | Form handling + validation | `validation.ts`, form pages |
| **Monaco Editor** | Code editor (VS Code engine) | `CodingAssessmentPage.tsx` |
| **face-api.js** | Face detection during exams | `useFaceDetection.ts` |
| **Lucide React** | Icon library | All page/component files |

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         BROWSER                                  │
│                                                                  │
│  ┌──────────┐   ┌──────────┐   ┌──────────────────────────┐    │
│  │  main.tsx │──▶│  App.tsx  │──▶│  Routes (Pages)          │    │
│  │ (entry)   │   │ (router) │   │  /login → LoginPage      │    │
│  └──────────┘   └──────────┘   │  /admin → AdminDashboard  │    │
│       │                         │  /candidate → CandDash    │    │
│       │ wraps with:             └──────────────────────────┘    │
│       │                                    │                     │
│  ┌────▼────────────────┐          uses     │                     │
│  │   Provider Tree      │    ┌─────────────┘                     │
│  │  ┌─ThemeProvider──┐  │    │                                   │
│  │  │ ┌─AuthProvider┐│  │    ▼                                   │
│  │  │ │ ┌─Toast────┐││  │  ┌──────────┐  ┌──────────┐          │
│  │  │ │ │  <App/>  │││  │  │  Hooks   │  │Components│          │
│  │  │ │ └──────────┘││  │  │useAuth() │  │ Button   │          │
│  │  │ └─────────────┘│  │  │useRbac() │  │ Card     │          │
│  │  └────────────────┘  │  │useTimer()│  │ Modal    │          │
│  └──────────────────────┘  └──────────┘  └──────────┘          │
│                                    │                             │
│                            ┌───────▼──────┐                     │
│                            │   Services    │                     │
│                            │ authService   │                     │
│                            │ aiService     │                     │
│                            │ compilerSvc   │                     │
│                            └───────┬───────┘                     │
│                                    │ HTTP (Axios)                │
└────────────────────────────────────┼─────────────────────────────┘
                                     │
                                     ▼
                          ┌──────────────────┐
                          │  Spring Boot     │
                          │  Backend         │
                          │  localhost:8081  │
                          └──────────────────┘
```

## Data Flow Summary

```
User Action (click/type)
    │
    ▼
Page Component (e.g., LoginPage.tsx)
    │
    ├── Calls Context function (e.g., login())
    │       │
    │       ▼
    │   AuthContext.tsx
    │       │
    │       ├── Calls Service (e.g., authService.login())
    │       │       │
    │       │       ▼
    │       │   auth.service.ts
    │       │       │
    │       │       ├── Uses api.service.ts (Axios instance)
    │       │       │       │
    │       │       │       ▼
    │       │       │   HTTP Request → Backend (Spring Boot)
    │       │       │       │
    │       │       │       ▼
    │       │       │   HTTP Response ← Backend
    │       │       │
    │       │       ▼
    │       │   Returns typed data
    │       │
    │       ▼
    │   Updates state (setUser, setRoles)
    │
    ▼
React re-renders → UI updates
```

---

# Part 3: Application Startup Flow

When a user opens `http://localhost:5173` in the browser, here's exactly what happens:

## Step 1: `index.html` loads

```
Browser loads index.html
    → Finds <script type="module" src="/src/main.tsx">
    → Vite compiles & serves main.tsx
```

**File: `index.html`**
```html
<body>
  <div id="root"></div>  <!-- React renders everything here -->
  <script type="module" src="/src/main.tsx"></script>
</body>
```

## Step 2: `main.tsx` — The Entry Point

This file sets up the **Provider Tree** — a series of wrapper components that make shared data available to the entire app.

```
main.tsx creates this nesting:

<StrictMode>              ← Development checks (double-renders to catch bugs)
  <BrowserRouter>         ← Enables URL-based navigation
    <ThemeProvider>        ← Provides light/dark theme to all components
      <ErrorBoundary>      ← Catches crashes, shows error UI
        <AuthProvider>      ← Provides user/roles/login/logout to all components
          <ToastProvider>    ← Provides toast notifications to all components
            <App />          ← The actual application with routes
          </ToastProvider>
        </AuthProvider>
      </ErrorBoundary>
    </ThemeProvider>
  </BrowserRouter>
</StrictMode>
```

**Why this order matters:**
- `ThemeProvider` is outermost because even error/auth screens need theming
- `AuthProvider` is inside `ThemeProvider` because login page needs the theme
- `ToastProvider` is inside `AuthProvider` because toast may need auth state
- `App` is innermost because it needs access to ALL providers above it

## Step 3: `AuthProvider` bootstraps the session

When `AuthProvider` mounts, it runs `bootstrapSession()`:

```
AuthProvider mounts
    │
    ├── Check: Is there an access token in memory?
    │     │
    │     ├── YES and not expired → Call /api/me → Get roles/permissions
    │     │                         → Call /api/users/email/{email} → Get full profile
    │     │                         → Set user state → App renders authenticated
    │     │
    │     └── NO or expired → Try refresh via HttpOnly cookie
    │           │
    │           ├── Refresh succeeds → Save new token → Load user (same as above)
    │           │
    │           └── Refresh fails → Clear state → App renders login page
    │
    └── Set isLoading = false → App can now render
```

## Step 4: `App.tsx` — Routes decide which page to show

```tsx
// Simplified view of App.tsx routing
<Routes>
  {/* Anyone can access */}
  <Route path="/" element={<HomePage />} />
  <Route path="/login" element={<LoginPage />} />

  {/* Only ADMIN/SUPER_ADMIN */}
  <Route path="/admin" element={<ProtectedRoute allowedRoles={['ADMIN','SUPER_ADMIN']}><Layout /></ProtectedRoute>}>
    <Route path="dashboard" element={<AdminDashboardPage />} />
    ...
  </Route>

  {/* Any authenticated user */}
  <Route path="/candidate" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
    <Route path="dashboard" element={<CandidateDashboardPage />} />
    ...
  </Route>
</Routes>
```

## Step 5: `Layout` renders Sidebar + Navbar + Page

```
┌────────────────────────────────────────────────┐
│ Navbar (top bar — search, theme, profile menu) │
├──────────┬─────────────────────────────────────┤
│          │                                     │
│ Sidebar  │   Page Content (via <Outlet />)     │
│ (left    │                                     │
│  nav)    │   e.g., AdminDashboardPage          │
│          │                                     │
│          │                                     │
└──────────┴─────────────────────────────────────┘
```

**`<Outlet />`** is a React Router concept — it's a placeholder where child routes render their pages. When the URL is `/admin/dashboard`, the `<Outlet />` inside `Layout` renders `AdminDashboardPage`.

---

# Part 4: Folder-by-Folder Breakdown

```
src/
├── main.tsx           ← Entry point. Sets up providers, renders <App />
├── App.tsx            ← Route definitions. Maps URLs to page components
├── index.css          ← Global CSS. Tailwind setup + CSS variable utilities
├── vite-env.d.ts      ← TypeScript declaration for Vite's import.meta.env
│
├── config/            ← Configuration constants (NO logic, just values)
│   ├── api.endpoints.ts    All backend URL paths
│   ├── app.config.ts       App-wide constants (timers, limits, languages)
│   ├── env.ts              Environment variables (API URL, WebSocket URL)
│   ├── error-messages.ts   Error code → human-readable message mapping
│   ├── permissions.ts      Permission name constants + TypeScript type
│   ├── roles.ts            Role name constants + TypeScript type
│   ├── routes.ts           Frontend URL path constants
│   └── validation.ts       Zod validation schemas for forms
│
├── contexts/          ← Global state managers (React Context)
│   ├── AuthContext.tsx      User authentication state + login/logout
│   └── ThemeContext.tsx     Light/dark theme preference
│
├── hooks/             ← Reusable stateful logic (custom hooks)
│   ├── useDebounce.ts       Delay value updates (search input)
│   ├── useFaceDetection.ts  Face detection with warnings
│   ├── useFullscreen.ts     Enter/exit fullscreen mode
│   ├── useLocalStorage.ts   Persist state in localStorage
│   ├── useMediaRecorder.ts  Record video/audio chunks
│   ├── usePageVisibility.ts Detect tab switches
│   ├── useRbac.ts           Role/permission checking helpers
│   ├── useSpeechRecognition.ts  Voice → text
│   ├── useSpeechSynthesis.ts    Text → voice
│   ├── useTimer.ts          Countdown timer with callbacks
│   └── useWebSocket.ts      Real-time WebSocket connection
│
├── services/          ← Backend API communication (Axios calls)
│   ├── api.service.ts       Core Axios instance + interceptors + token
│   ├── auth.service.ts      Login, register, OTP, password APIs
│   ├── user.service.ts      User profile CRUD
│   ├── job.service.ts       Job posting APIs
│   ├── job-application.service.ts  Job application + email APIs
│   ├── assessment.service.ts       Exam management APIs
│   ├── compiler.service.ts         Code execution API
│   ├── ai.service.ts               AI interview APIs
│   ├── interview.service.ts        Interview scheduling APIs
│   ├── resume.service.ts           Resume upload/view APIs
│   └── websocket.service.ts        WebSocket connection manager
│
├── types/             ← TypeScript interfaces (data shapes)
│   ├── api.types.ts         API response/error envelope shapes
│   ├── auth.types.ts        Login/register/user info types
│   ├── user.types.ts        User profile types
│   ├── job.types.ts         Job post + application types
│   ├── assessment.types.ts  Assessment/question/result types
│   ├── compiler.types.ts    Code submission/response types
│   ├── interview.types.ts   Interview schedule/request types
│   └── result.types.ts      Exam result types
│
├── components/        ← Reusable UI building blocks
│   ├── ErrorBoundary.tsx    Crash handler (class component)
│   ├── auth/
│   │   ├── ProtectedRoute.tsx   Route guard (checks auth + roles)
│   │   ├── RoleGate.tsx         Show/hide content by role
│   │   └── PermissionGate.tsx   Show/hide content by permission
│   ├── layout/
│   │   ├── Layout.tsx           Page frame (sidebar + navbar + content area)
│   │   ├── Navbar.tsx           Top bar (search, theme toggle, profile menu)
│   │   └── Sidebar.tsx          Left navigation menu
│   └── ui/                      28 generic UI components
│       ├── Button.tsx, Card.tsx, Modal.tsx, Input.tsx, Select.tsx,
│       ├── Badge.tsx, Toast.tsx, DataTable.tsx, Pagination.tsx,
│       ├── Alert.tsx, Avatar.tsx, Breadcrumb.tsx, Checkbox.tsx,
│       ├── ConfirmDialog.tsx, EmptyState.tsx, FileUpload.tsx,
│       ├── FormField.tsx, PageHeader.tsx, ProgressBar.tsx,
│       ├── SearchInput.tsx, Skeleton.tsx, Spinner.tsx,
│       ├── StatsCard.tsx, StatusBadge.tsx, StatusStepper.tsx,
│       ├── Table.tsx, Tabs.tsx, Textarea.tsx, Timeline.tsx,
│       └── Tooltip.tsx
│
├── pages/             ← Full-page components (one per route)
│   ├── admin/               Admin-only pages (11 pages)
│   ├── auth/                Login, register, password pages (5 pages)
│   ├── candidate/           Candidate pages (14 pages)
│   ├── errors/              Error pages (3 pages)
│   └── public/              Public pages (3 pages)
│
├── theme/
│   └── tokens.ts            Light + dark theme color definitions
│
└── utils/             ← Pure utility functions (no React, no state)
    ├── jwt.utils.ts         Parse/validate JWT tokens
    ├── format.utils.ts      Date, name, file size formatters
    ├── storage.utils.ts     localStorage read/write helpers
    └── file.utils.ts        File type/size validators
```

---

# Part 5: State Management

## This Project Does NOT Use Redux

Many React tutorials mention Redux. **This project uses React's built-in tools instead:**

| Pattern | What It Does | Where Used |
|---------|-------------|------------|
| **React Context** | Share data across many components without prop drilling | `AuthContext`, `ThemeContext`, `ToastProvider` |
| **useState** | Local component state | Every page and component |
| **useRef** | Hold mutable values that don't trigger re-renders | Video elements, timers, recorders |
| **Props** | Pass data from parent to child | Every component |

### Why No Redux?

Redux is for complex apps with lots of shared, frequently-changing state. This app has:
- Auth state → `AuthContext` (changes rarely — login/logout)
- Theme state → `ThemeContext` (changes rarely — light/dark toggle)
- Page-specific state → `useState` in each page (doesn't need sharing)

This is simpler and sufficient.

## How Context Works (The "Global Store" Pattern)

```
Step 1: CREATE the context
┌────────────────────────────────────────────┐
│ AuthContext.tsx                              │
│                                             │
│ const AuthContext = createContext(undefined) │
│                                             │
│ function AuthProvider({ children }) {       │
│   const [user, setUser] = useState(null)    │
│   const [roles, setRoles] = useState([])    │
│                                             │
│   return (                                  │
│     <AuthContext.Provider value={{           │
│       user, roles, login, logout            │
│     }}>                                     │
│       {children} ← All child components     │
│     </AuthContext.Provider>                  │
│   )                                         │
│ }                                           │
└────────────────────────────────────────────┘

Step 2: WRAP the app with the provider (main.tsx)
┌────────────────────────────────┐
│ <AuthProvider>                  │
│   <App />  ← Everything inside │
│            can access auth data │
│ </AuthProvider>                 │
└────────────────────────────────┘

Step 3: USE the context in any component
┌────────────────────────────────┐
│ function LoginPage() {          │
│   const { login } = useAuth()   │  ← useAuth() reads from AuthContext
│   // Now you have the login     │
│   // function without props!    │
│ }                               │
└────────────────────────────────┘
```

### Context vs Props — When to Use Which

```
Use PROPS when:                  Use CONTEXT when:
├── Data flows parent→child      ├── Many components need the same data
├── Only 1-2 levels deep         ├── Data would need to pass through 3+ levels
├── Data is specific to          ├── Data is "global" (auth, theme)
│   that component tree          │
└── Example: <Card title="Hi">   └── Example: useAuth() in any page
```

---

# Part 6: Data Flow — Complete Traces

## Trace 1: Login Flow (End-to-End)

Let's trace exactly what happens when a user types their email/password and clicks "Sign in":

```
USER: Types email="pavan@test.com", password="Test@123", clicks "Sign in"

FILE: src/pages/auth/LoginPage.tsx
├── react-hook-form validates input using loginSchema (from validation.ts)
├── onSubmit() is called with { email: "pavan@test.com", password: "Test@123" }
├── Calls: const { roles: loadedRoles } = await login({ email, password })
│
│   FILE: src/contexts/AuthContext.tsx → login()
│   ├── Calls: authService.login({ email, password })
│   │
│   │   FILE: src/services/auth.service.ts → login()
│   │   ├── Calls: api.post('/api/login', { email, password })
│   │   │
│   │   │   FILE: src/services/api.service.ts
│   │   │   ├── Axios sends POST http://localhost:8081/api/login
│   │   │   ├── Request interceptor checks: is this a public path? YES → no auth header
│   │   │   ├── Backend responds: { success: true, data: { accessToken: "eyJ...", user: {...} } }
│   │   │   └── Returns response to auth.service
│   │   │
│   │   └── Returns { data: { data: { accessToken, user } } }
│   │
│   ├── setAccessToken("eyJ...") → Saves token in memory (NOT localStorage)
│   │   └── BroadcastChannel sends { type: 'login' } to other tabs
│   ├── setUser({ email, firstName, lastName, ... }) → React state update
│   ├── Calls: loadMe()
│   │   ├── GET /api/me → { email, roles: ["ROLE_ADMIN"], permissions: ["USER_READ",...] }
│   │   ├── setRoles(["ADMIN"]) → Strips "ROLE_" prefix
│   │   └── setPermissions(["USER_READ",...])
│   ├── Returns { roles: ["ADMIN"] } to LoginPage
│   │
│   FILE: src/pages/auth/LoginPage.tsx (continued)
│   ├── loadedRoles = ["ADMIN"]
│   ├── loadedRoles.includes('ADMIN') → true
│   └── navigate('/admin/dashboard', { replace: true })
│
│   FILE: src/App.tsx
│   ├── URL is now /admin/dashboard
│   ├── Matches: <Route path="/admin" element={<ProtectedRoute allowedRoles={['ADMIN','SUPER_ADMIN']}><Layout /></ProtectedRoute>}>
│   │
│   │   FILE: src/components/auth/ProtectedRoute.tsx
│   │   ├── isAuthenticated? YES (user is set)
│   │   ├── hasAnyRole(['ADMIN','SUPER_ADMIN'])? YES
│   │   └── Renders <Layout />
│   │
│   │   FILE: src/components/layout/Layout.tsx
│   │   ├── Renders <Sidebar /> (left nav with admin items)
│   │   ├── Renders <Navbar /> (top bar with user name)
│   │   └── Renders <Outlet /> → AdminDashboardPage
│
USER SEES: Admin dashboard with sidebar, navbar showing "Pavan"
```

## Trace 2: Run Code in Coding Assessment (End-to-End)

```
USER: Writes Java code in Monaco editor, clicks "Run Code"

FILE: src/pages/candidate/CodingAssessmentPage.tsx
├── handleRunCode() is called
├── Gets current question: questions[currentIndex]
├── Builds request: {
│     language: "java",
│     script: "public class Main { ... }",  ← Monaco editor value
│     customInput: "5\n3",                   ← from question.sampleInput
│     assessmentId: 42,
│     questionId: 7,
│     userEmail: "pavan@test.com",
│     jobPrefix: "SDE-2024",
│     testCases: [...],
│     createdAt: "2026-02-14T..."
│   }
├── Calls: compilerService.runCode(request)
│
│   FILE: src/services/compiler.service.ts
│   ├── api.post('/api/compiler/run', request)
│   │
│   │   FILE: src/services/api.service.ts
│   │   ├── Request interceptor: adds Authorization: Bearer eyJ...
│   │   ├── Sends POST to http://localhost:8081/api/compiler/run
│   │   └── Backend compiles Java, runs it, returns:
│   │       { output: "8", status: "SUCCESS", executionTime: 45 }
│   │
│   └── Returns response
│
├── setOutput({ output: "8", status: "SUCCESS", executionTime: 45 })
├── Checks test cases: output.trim() === expectedOutput.trim()?
├── setTestResults([{ testCase: {...}, passed: true, actualOutput: "8" }])
│
└── React re-renders:
    ├── Output area shows "8" with green SUCCESS badge
    └── Test case shows ✓ "Test Case 1: Passed"
```

## Trace 3: AI Interview Question/Answer (End-to-End)

```
USER: Types answer in textarea, clicks Send

FILE: src/pages/candidate/InterviewPage.tsx
├── handleSubmitAnswer() is called
├── Validates: sessionId exists? currentAnswer not empty? YES
├── Stops speech synthesis (if interviewer was speaking)
├── Stops speech recognition (if listening)
├── Adds candidate entry to conversation state
├── Builds updatedConversation = [...conversation, candidateEntry]
├── Calls: aiService.answerQuestion({
│     interviewScheduleId: 42,
│     conversationHistory: JSON.stringify(updatedConversation),
│     finalAnswer: false,
│     jobPrefix: "SDE-2024"
│   })
│
│   FILE: src/services/ai.service.ts
│   ├── api.post('/api/interview/answer', null, { params: {...} })
│   │   ← Note: params are sent as QUERY PARAMS (?interviewScheduleId=42&...)
│   │     because backend uses @RequestParam, not @RequestBody
│   │
│   │   FILE: src/services/api.service.ts
│   │   ├── Attaches Bearer token
│   │   ├── POST http://localhost:8081/api/interview/answer?interviewScheduleId=42&...
│   │   └── Backend AI generates next question:
│   │       { nextQuestion: "Tell me about...", isComplete: false }
│   │
│   └── Returns response
│
├── Clears currentAnswer, resets transcript
├── isComplete = false → More questions
├── Adds interviewer entry to conversation
├── speak(nextQuestion) → Browser reads question aloud
├── Resets per-question timer to 5 minutes
│
└── React re-renders:
    ├── Chat shows candidate's answer (green bubble, right side)
    ├── Chat shows AI's next question (blue bubble, left side)
    └── Timer restarts at 05:00
```

---

# Part 7: Authentication & Security Flow

## Token Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    TOKEN STORAGE                                  │
│                                                                  │
│  Access Token:  In-memory variable only (JavaScript let)         │
│                 ├── NOT in localStorage (XSS protection)         │
│                 ├── Lost on page refresh (by design)             │
│                 └── Refreshed via HttpOnly cookie                │
│                                                                  │
│  Refresh Token: HttpOnly cookie (set by backend)                 │
│                 ├── NOT accessible via JavaScript                │
│                 ├── Survives page refresh                        │
│                 └── Sent automatically with every request        │
│                     (withCredentials: true in Axios)             │
└──────────────────────────────────────────────────────────────────┘
```

## Auto-Refresh on 401 (Token Expired)

```
API Call → 401 Unauthorized
    │
    ├── Is this a public path (login, register)? → YES → Reject error
    │
    ├── Already refreshing? → YES → Queue this request (wait)
    │
    └── NO → Start refresh
         │
         ├── POST /api/refresh (with HttpOnly cookie)
         │     │
         │     ├── Success → New access token
         │     │     ├── setAccessToken(newToken)
         │     │     ├── Retry original request with new token
         │     │     └── Process queued requests with new token
         │     │
         │     └── Failure → Session truly expired
         │           ├── clearTokens()
         │           ├── Dispatch 'auth:forceLogout' event
         │           └── AuthContext catches event → clears user → redirects to login
         │
         └── Queue: If multiple 401s happen simultaneously,
             only ONE refresh happens. Others wait in queue.
```

## Cross-Tab Synchronization

```
Tab A: User clicks "Logout"
    │
    ├── authService.logout() → POST /api/logout
    ├── clearTokens() → accessToken = null
    │     └── BroadcastChannel.postMessage({ type: 'logout' })
    │
    └── Tab A shows login page

Tab B: Listening on BroadcastChannel
    │
    ├── Receives { type: 'logout' }
    ├── setAccessToken(null) → clears in-memory token
    │     └── Guard: prev === null, so NO broadcast back (prevents ping-pong)
    ├── setUser(null), setRoles([]), setPermissions([])
    │
    └── Tab B also shows login page
```

## Role-Based Access Control (RBAC)

```
Three layers of protection:

Layer 1: ROUTE LEVEL (ProtectedRoute.tsx)
┌──────────────────────────────────────────────────┐
│ <ProtectedRoute allowedRoles={['ADMIN']}>        │
│   Is user authenticated? NO → redirect to /login │
│   Does user have ADMIN role? NO → redirect /403  │
│   YES → render children                         │
│ </ProtectedRoute>                                │
└──────────────────────────────────────────────────┘

Layer 2: COMPONENT LEVEL (RoleGate/PermissionGate)
┌──────────────────────────────────────────────────┐
│ <RoleGate roles={['ADMIN']}>                     │
│   <button>Delete User</button>                   │
│ </RoleGate>                                      │
│ /* Button only visible to ADMIN */               │
└──────────────────────────────────────────────────┘

Layer 3: LOGIC LEVEL (useRbac hook)
┌──────────────────────────────────────────────────┐
│ const { hasRole, can } = useRbac();              │
│ if (can('USER_DELETE')) { /* show button */ }     │
│ if (hasRole('ADMIN'))  { /* admin logic */ }     │
└──────────────────────────────────────────────────┘
```

---

# Part 8: Routing & Page Navigation

## How React Router Works

React is a **Single Page Application (SPA)** — the browser loads ONE HTML page, and JavaScript changes what's shown based on the URL. No full page reloads.

```
Traditional Website:         SPA (React):
/login  → server sends HTML   /login  → React shows LoginPage component
/admin  → server sends HTML   /admin  → React shows AdminDashboard component
(full page reload each time)  (instant switch, no reload)
```

## Route Structure

```
URL Pattern                        Component                    Auth Required?
─────────────────────────────────────────────────────────────────────────────
/                                  HomePage                     No
/login                             LoginPage                    No (redirect if logged in)
/register                          RegisterPage                 No (redirect if logged in)
/forgot-password                   ForgotPasswordPage           No
/reset-password                    ResetPasswordPage            No
/about                             AboutPage                    No
/contact                           ContactPage                  No
│
/admin/                            Layout (sidebar+navbar)      ADMIN or SUPER_ADMIN
├── /admin/dashboard               AdminDashboardPage           ↑
├── /admin/jobs/create             JobPostFormPage               ↑
├── /admin/candidates              CandidateDetailsPage          ↑
├── /admin/users                   UserListPage                  ↑
├── /admin/ats                     AtsScreeningPage              ↑
├── /admin/ats/batch               AtsBatchPage                  ↑
├── /admin/assessments/assign      AssignAssessmentPage          ↑
├── /admin/assessments/upload      UploadQuestionPaperPage       ↑
├── /admin/assessments/results     ResultsPage                   ↑
├── /admin/interviews/schedule     InterviewSchedulerPage        ↑
├── /admin/interviews/results      InterviewResultsPage          ↑
├── /admin/prompts                 JobPromptPage                 ↑
├── /admin/profile                 ProfilePage                   ↑
└── /admin/change-password         ChangePasswordPage            ↑
│
/candidate/                        Layout (sidebar+navbar)      Any authenticated user
├── /candidate/dashboard           CandidateDashboardPage       ↑
├── /candidate/profile             ProfilePage                   ↑
├── /candidate/resume              ResumePage                    ↑
├── /candidate/events              EventsPage                    ↑
├── /candidate/apply               JobApplicationPage            ↑
├── /candidate/assessments         AssessmentListPage            ↑
├── /candidate/instructions        ExamInstructionsPage          ↑
├── /candidate/exam/aptitude       AptitudeAssessmentPage        ↑
├── /candidate/exam/coding         CodingAssessmentPage          ↑
├── /candidate/interviews          InterviewListPage             ↑
├── /candidate/interview           InterviewPage                 ↑
├── /candidate/interview/summary   InterviewSummaryPage          ↑
├── /candidate/results             ResultsListPage               ↑
└── /candidate/results/:id         ResultDetailPage              ↑
│
/unauthorized                      UnauthorizedPage             No
/forbidden                         ForbiddenPage                No
*                                  NotFoundPage (404)           No
```

## Navigation Methods

```tsx
// Method 1: <Link> component (for user-clickable links)
import { Link } from 'react-router-dom';
<Link to="/admin/dashboard">Go to Dashboard</Link>

// Method 2: useNavigate hook (for programmatic navigation)
const navigate = useNavigate();
navigate('/admin/dashboard');               // Normal navigation
navigate('/admin/dashboard', { replace: true }); // Replace history (no back button)

// Method 3: Pass data between pages via state
navigate('/candidate/interview', {
  state: { interview: interviewObject }
});
// Receiving page:
const interview = (location.state as { interview?: InterviewSchedule })?.interview;
```

---

# Part 9: Component Communication Patterns

## Pattern 1: Props (Parent → Child)

```
                    ┌──────────────┐
                    │  ParentPage  │
                    │              │
                    │ state: items │
                    └──────┬───────┘
                           │ passes items as prop
                    ┌──────▼───────┐
                    │  <DataTable  │
                    │   data={items}│
                    │   />         │
                    └──────────────┘
```

**Example:** `CodingAssessmentPage` passes `language` to `<Select>`:
```tsx
<Select options={APP_CONFIG.COMPILER_LANGUAGES} value={language} onChange={...} />
```

## Pattern 2: Callbacks (Child → Parent)

Child components send data UP by calling a function passed as a prop.

```
                    ┌──────────────┐
                    │  ParentPage  │
                    │              │
                    │ handleClick()│ ← called by child
                    └──────┬───────┘
                           │ passes function as prop
                    ┌──────▼───────┐
                    │  <Button     │
                    │   onClick={  │
                    │   handleClick│
                    │   }/>        │
                    └──────────────┘
```

**Example:** `<Select onChange={(e) => setLanguage(e.target.value)} />`
- `Select` is the child, it calls `onChange` when user picks a language
- `CodingAssessmentPage` (parent) receives the new value via `setLanguage`

## Pattern 3: Context (Any Component → Any Component)

```
    ┌───────────────────────────────────────┐
    │        AuthContext (Provider)          │
    │  ┌─────────────────────────────────┐  │
    │  │ user, roles, login(), logout()  │  │
    │  └─────────────────────────────────┘  │
    │       ▲           ▲           ▲       │
    │       │           │           │       │
    │  ┌────┴───┐ ┌─────┴────┐ ┌───┴────┐  │
    │  │Navbar  │ │LoginPage │ │Sidebar │  │
    │  │useAuth│ │useAuth() │ │useAuth│  │
    │  └────────┘ └──────────┘ └────────┘  │
    └───────────────────────────────────────┘
```

- `Navbar` reads `user.firstName` to show the name
- `LoginPage` calls `login()` to authenticate
- `Sidebar` calls `logout()` when user clicks logout
- None of these components pass props to each other — they all read from the shared Context

## Pattern 4: Location State (Page → Page)

```
Page A: navigate('/candidate/interview', { state: { interview: data } })
          │
          │ URL changes, React Router renders:
          ▼
Page B: const interview = location.state?.interview
```

**Used for:**
- Assessment list → Exam instructions → Exam page (passes assessment object)
- Interview list → Interview page (passes interview schedule object)
- Interview → Interview summary (passes conversation history)

## Pattern 5: Custom Hooks (Shared Logic)

Hooks share **logic** (not UI) across components.

```
┌──────────────────────┐     ┌──────────────────────┐
│ CodingAssessmentPage │     │ AptitudeAssessmentPage│
│                      │     │                       │
│ useTimer({           │     │ useTimer({            │
│   initialSeconds:120,│     │   initialSeconds:60,  │
│   onExpire: submit   │     │   onExpire: submit    │
│ })                   │     │ })                    │
└──────────────────────┘     └──────────────────────┘
              │                         │
              └──────────┬──────────────┘
                         ▼
              ┌────────────────────┐
              │  useTimer hook     │
              │                    │
              │ • manages interval │
              │ • tracks seconds   │
              │ • calls onExpire   │
              └────────────────────┘
```

Both pages use the same timer logic but with different configurations.

---

# Part 10: API Layer

## How a Request Travels

```
Component                Service              API Core             Backend
   │                        │                    │                    │
   │  compilerService       │                    │                    │
   │  .runCode(data) ──────▶│                    │                    │
   │                        │  api.post(         │                    │
   │                        │  '/api/compiler/   │                    │
   │                        │   run', data) ────▶│                    │
   │                        │                    │  Axios adds:       │
   │                        │                    │  - Bearer token    │
   │                        │                    │  - Content-Type    │
   │                        │                    │  - Base URL        │
   │                        │                    │                    │
   │                        │                    │  POST http://      │
   │                        │                    │  localhost:8081/   │
   │                        │                    │  api/compiler/run──▶
   │                        │                    │                    │
   │                        │                    │◀── JSON response ──│
   │                        │                    │                    │
   │                        │  If 401:           │                    │
   │                        │  auto-refresh ─────│──▶ POST /refresh   │
   │                        │  then retry ───────│──▶ Retry original  │
   │                        │                    │                    │
   │◀─── typed response ───│◀── response ──────│                    │
   │                        │                    │                    │
```

## Axios Instance Configuration

**File: `api.service.ts`**

```tsx
const api = axios.create({
  baseURL: 'http://localhost:8081',  // All requests go here
  withCredentials: true,              // Send HttpOnly cookies with every request
  timeout: 30000,                     // 30 second timeout
  headers: { 'Content-Type': 'application/json' },
});
```

## Request Interceptor

Runs BEFORE every request. Adds the auth token.

```
Every API call → Interceptor runs:
├── Is this a public path? (login, register, refresh, etc.)
│   ├── YES → Don't add token
│   └── NO → Add: Authorization: Bearer eyJ...
└── Send request
```

## Response Interceptor

Runs AFTER every response. Handles 401 errors.

```
Every API response → Interceptor runs:
├── Status 200-299? → Return response normally
├── Status 401?
│   ├── Is public path? → Reject (don't retry)
│   ├── Already retried? → Reject (prevent loops)
│   ├── Already refreshing? → Queue this request
│   └── Try refresh:
│       ├── Success → Retry original with new token
│       └── Failure → Force logout all tabs
└── Other error → Reject normally
```

## Service File Pattern

Every service file follows the same pattern:

```tsx
// 1. Import the Axios instance and endpoints
import api from './api.service';
import { ENDPOINTS } from '@/config/api.endpoints';

// 2. Export an object with methods for each API call
export const someService = {
  // GET request
  getAll() {
    return api.get<ResponseType>(ENDPOINTS.SOMETHING.GET_ALL);
  },

  // POST request with body
  create(data: RequestType) {
    return api.post<ResponseType>(ENDPOINTS.SOMETHING.CREATE, data);
  },

  // POST with query params (not body)
  search(data: SearchType) {
    return api.post<ResponseType>(ENDPOINTS.SOMETHING.SEARCH, null, {
      params: { key: data.value },
    });
  },

  // POST with file upload
  upload(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<ResponseType>(ENDPOINTS.SOMETHING.UPLOAD, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};
```

## Backend Endpoint Mapping

| Frontend Service | Method | Endpoint | Backend Controller |
|-----------------|--------|----------|--------------------|
| `authService.login()` | POST | `/api/login` | AuthController |
| `authService.me()` | GET | `/api/me` | AuthController |
| `authService.refresh()` | POST | `/api/refresh` | AuthController |
| `userService.getByEmail(e)` | GET | `/api/users/email/{e}` | UserController |
| `jobService.getAllJobs()` | GET | `/api/jobs/getPost` | JobController |
| `assessmentService.generateCodingQuestions(p)` | GET | `/api/generate-coding-questions?jobPrefix=p` | AssessmentController |
| `compilerService.runCode(d)` | POST | `/api/compiler/run` | CompilerController |
| `aiService.startInterview(d)` | POST | `/api/interview/start` | InterviewController |
| `aiService.answerQuestion(d)` | POST | `/api/interview/answer?params` | InterviewController |
| `resumeService.upload(p, f)` | POST | `/api/upload-resume?jobPrefix=p` | ResumeController |

---

# Part 11: Feature Flows (End-to-End)

## Flow 1: Candidate Takes Coding Exam

```
Step 1: Candidate navigates to Assessment List
FILE: AssessmentListPage.tsx
├── useEffect on mount: assessmentService.getCandidateAssessments(user.email)
├── Shows list of assigned assessments with status
└── Candidate clicks "Start Exam" on a CODING assessment

Step 2: Navigate to Instructions
FILE: ExamInstructionsPage.tsx
├── Receives assessment via location.state
├── Shows rules (no tab switching, face detection, timer)
└── Candidate clicks "Start" → navigates to CodingAssessmentPage

Step 3: Coding Assessment Page loads
FILE: CodingAssessmentPage.tsx
├── useEffect on mount (initExam):
│   ├── assessmentService.generateCodingQuestions(jobPrefix)
│   ├── enterFullscreen()
│   ├── loadModels() → loads face-api.js models
│   ├── getUserMedia({ video: true }) → starts camera
│   ├── startDetection() → face checking every 3 seconds
│   ├── markAttended({ assessmentId, email })
│   └── startTimer() → 120 minute countdown
│
├── Monaco Editor renders with Java syntax highlighting
├── Question tabs show Q1, Q2, Q3...
│
├── Tab switch detected (usePageVisibility):
│   ├── Warning count increases
│   ├── Toast: "Warning 1/3: Do not switch tabs!"
│   └── If 3 warnings → auto-submit exam
│
├── Face not detected (useFaceDetection):
│   ├── Warning count increases
│   ├── Amber "Face not detected" indicator
│   └── If 3 warnings → auto-submit exam
│
├── Candidate writes code, clicks "Run Code":
│   ├── handleRunCode() → compilerService.runCode({ script, customInput, ... })
│   ├── Backend compiles and runs → returns output
│   ├── Test cases checked locally against expected output
│   └── Shows results: ✓ Passed / ✗ Failed
│
├── Candidate switches questions:
│   ├── Current code saved to codePerQuestion[questionId]
│   ├── Next question's saved code loaded (or default template)
│   └── Monaco editor updates with new language/code
│
├── Timer expires OR candidate clicks "Submit":
│   ├── handleSubmitExam()
│   ├── Saves all code per question
│   ├── assessmentService.saveResult({ candidateEmail, resultsJson, ... })
│   └── Navigate to Results page

Step 4: Cleanup on unmount
├── stopDetection() → clears face detection interval
└── Camera stream tracks stopped
```

## Flow 2: Candidate Takes AI Interview

```
Step 1: InterviewListPage
├── interviewService.getActiveInterviews(email) → shows list
└── Candidate clicks "Start" → navigates to InterviewPage with interview data

Step 2: InterviewPage Pre-Start Screen
├── Shows instructions (camera, mic, time limits)
└── Candidate clicks "Start Interview"

Step 3: handleStartInterview()
├── aiService.startInterview({ email, jobPrefix })
├── Backend returns { sessionId, firstQuestion }
├── First question added to conversation (blue bubble)
├── speak(firstQuestion) → browser reads question aloud
├── startGlobalTimer() → 60 minute countdown
├── startQuestionTimer() → 5 minute per-question countdown
├── startRecording({ audio, video }) → useMediaRecorder
│   ├── getUserMedia({ audio: true, video: true })
│   ├── MediaRecorder starts recording in 15-second chunks
│   └── Each chunk → aiService.uploadVideo(formData)
└── recorderStream → videoRef.current.srcObject (preview)

Step 4: Candidate answers (voice or text)
├── Voice: toggleListening() → useSpeechRecognition
│   ├── Browser speech-to-text runs
│   ├── Transcript APPENDS to currentAnswer (doesn't replace typed text)
│   └── Shows in textarea
├── Text: Types directly in textarea
└── Clicks Send:
    ├── handleSubmitAnswer()
    ├── Adds candidate entry to conversation (green bubble)
    ├── aiService.answerQuestion({ interviewScheduleId, conversationHistory, ... })
    ├── Backend AI processes → returns { nextQuestion, isComplete }
    │
    ├── If NOT complete:
    │   ├── Add interviewer question to conversation
    │   ├── speak(nextQuestion)
    │   └── Reset 5-min timer
    │
    └── If COMPLETE:
        ├── setInterviewComplete(true)
        ├── stopRecording()
        ├── Show "Interview Complete" badge
        └── After 3 seconds → navigate to InterviewSummaryPage

Step 5: Cleanup on unmount
├── stopRecording() → MediaRecorder stops, stream tracks stopped
├── stopSpeaking() → cancels speech synthesis
├── stopListening() → stops speech recognition
└── videoRef stream tracks stopped
```

## Flow 3: Admin Assigns Assessment to Candidates

```
Step 1: Admin goes to /admin/assessments/assign
FILE: AssignAssessmentPage.tsx
├── jobService.getAllJobs() → populate job dropdown
├── jobApplicationService.filterByPrefix(selectedJob) → get candidates
├── Admin selects: job, assessment type (APTITUDE/CODING), candidates, deadline
└── Clicks "Assign"

Step 2: Assignment
├── assessmentService.assign({
│     jobPrefix: "SDE-2024",
│     candidateEmails: ["a@test.com", "b@test.com"],
│     assessmentType: "CODING",
│     startTime: "...",
│     deadline: "..."
│   })
├── Backend creates assessment records
├── Sends email notifications to candidates
└── Toast: "Assessment assigned successfully"
```

## Flow 4: Candidate Applies for a Job

```
Step 1: Candidate views available jobs on EventsPage
FILE: src/pages/candidate/EventsPage.tsx
├── jobService.getAllJobs() → fetches all job posts
├── jobApplicationService.getByEmail(userEmail) → fetches user's existing applications
├── Builds Set<appliedJobPrefixes> from existing applications
├── Each job card shows:
│   ├── Job title, prefix, location, experience, type, salary, skills
│   ├── "Applied" badge (green) if jobPrefix is in appliedJobPrefixes
│   ├── "Details" button → opens full job details popup modal
│   └── "Apply Now" button (or "View Application" if already applied, or "Deadline Passed")
└── Job Details Modal shows: all job fields (description, skills, education, openings, department, contact, etc.)

Step 2: Candidate fills the application form
FILE: src/pages/candidate/JobApplicationPage.tsx
├── Route: /candidate/apply/:jobPrefix
├── Receives job details via navigation state (location.state.job)
├── If editing: receives existingApplication via navigation state
├── Form fields: firstName, lastName, email (read-only), mobileNumber, experience, address
├── Resume upload: file input (PDF/DOC/DOCX)
│   ├── If editing and resume exists → shows green banner: "Resume already uploaded: <filename>"
│   └── User can optionally upload a new resume to replace
├── Submit → FormData with all fields + file
│   ├── New application: jobApplicationService.apply(formData)
│   │   └── Backend sets status = "APPLIED" (for non-REF-000 jobs)
│   └── Edit application: jobApplicationService.update(formData)
└── On success → navigates to /candidate/my-applications

Step 3: Candidate views applied jobs
FILE: src/pages/candidate/MyApplicationsPage.tsx
├── Route: /candidate/my-applications
├── jobApplicationService.getByEmail(userEmail) → fetches all user applications
├── Table displays: Job Role, Job Prefix, Status (color-coded badge), Actions
├── "View" button → opens detail modal showing:
│   ├── Personal Info: name, email, phone, experience, address
│   ├── Application Status: status badge, match percentage (if screened)
│   ├── Pipeline Progress: confirmation, acknowledgement, exam link, written test, interview
│   └── Resume: filename display
└── "Edit" button → navigates to JobApplicationPage with existingApplication in state
```

### Backend Processing (Apply)

```
POST /api/job-applications/apply (multipart/form-data)
FILE: JobApplicationForCandidateController.java → JobApplicationForCandidateServiceImpl.java

applyForJob(dto):
├── Finds user by email
├── Finds job post by prefix
├── Creates JobApplicationForCandidate entity
├── Sets status:
│   ├── "REF-000" prefix → "SHORTLISTED" (general pool)
│   └── Other prefixes → "APPLIED"
├── Handles resume upload:
│   ├── Saves file to S3: exam/<email>/resume/<filename>
│   └── Stores resumeFileName and contentType in entity
├── Saves entity to database
└── Returns success response

convertToDTO(entity) → JobApplicationForCandidateDTO:
├── Maps all fields including email, userEmail, mobileNumber
├── Maps jobRole, jobPrefix from related JobPost entity
├── Maps matchPercent, all status fields (confirmation, acknowledgement, etc.)
└── Maps resumeFileName, contentType
```

## Flow 5: ATS Screening (Applicant Tracking System)

```
Step 1: Admin navigates to ATS Screening page
FILE: src/pages/admin/AtsScreeningPage.tsx
├── Route: /admin/ats-screening
├── jobService.getAllJobs() → populates job dropdown
└── Admin selects a job from dropdown

Step 2: Job skills are displayed
├── Selected job's keySkills are parsed and displayed as skill tags
├── Shows job details: role, experience required, education, location
└── "Screen All Candidates" button becomes available

Step 3: Admin clicks "Screen All Candidates"
├── jobApplicationService.filterByPrefix(jobPrefix) → calls backend ATS engine
├── Loading state with spinner while backend processes
└── Backend returns array of candidates with matchPercent and updated status

Step 4: Results displayed
├── Statistics Cards:
│   ├── Total Candidates (count)
│   ├── Shortlisted (count, green)
│   ├── Rejected (count, red)
│   ├── Average Score (percentage)
│   └── Top Score (percentage)
├── Filter Tabs: All | Shortlisted | Rejected
├── Search bar: filter by name, email, role
├── Sortable columns: Name, Experience, ATS Score
├── Results Table per candidate:
│   ├── Rank (#)
│   ├── Name (first + last)
│   ├── Email
│   ├── Experience
│   ├── Role
│   ├── Resume filename
│   ├── ATS Score: visual progress bar (green ≥60%, red <60%)
│   ├── Status: SHORTLISTED (green badge) or REJECTED (red badge)
│   └── Actions: "View Details" button → opens candidate modal
└── Candidate Detail Modal:
    ├── Personal info, job details, experience, address
    ├── ATS Score with interpretation (Excellent/Good/Fair/Poor)
    └── Resume filename
```

### Backend ATS Engine

```
GET /api/job-applications/filterByPrefix/{jobPrefix}
FILE: JobApplicationForCandidateServiceImpl.java

filterCandidatesByPrefix(jobPrefix):
├── Fetches all applications for the job
├── Fetches the JobPost to get required skills
├── For each candidate:
│   ├── Downloads resume from S3
│   ├── Extracts text from resume (PDF/DOCX parser)
│   └── Calculates match score using multi-factor algorithm:
│       ├── Skill Keyword Matching (40% weight)
│       │   ├── Direct keyword match in resume text
│       │   ├── Synonym expansion via SynonymLoader
│       │   └── Case-insensitive matching
│       ├── TF-IDF Cosine Similarity (20% weight)
│       │   ├── Term frequency calculation
│       │   ├── Inverse document frequency
│       │   └── Cosine similarity between job skills and resume
│       ├── Experience Matching (20% weight)
│       │   ├── Extracts years from resume (regex patterns)
│       │   └── Compares with job's required experience
│       └── Education Matching (20% weight)
│           ├── Checks for degree keywords (B.Tech, M.Tech, MBA, etc.)
│           └── Matches against job's education requirements
├── Applies threshold (configurable via ats.screening.threshold property):
│   ├── matchPercent >= threshold → status = "SHORTLISTED"
│   └── matchPercent < threshold → status = "REJECTED"
├── Updates each candidate's status and matchPercent in database
└── Returns list of DTOs with updated scores and statuses

Configuration:
├── application-dev.properties: ats.screening.threshold=60.0
├── application-prod.properties: ats.screening.threshold=60.0
└── Injected via @Value("${ats.screening.threshold:60.0}")
```

## Flow 6: Admin Candidate Pipeline Management

```
Step 1: Admin views candidates for a job
FILE: src/pages/admin/CandidateDetailsPage.tsx
├── Route: /admin/candidates
├── jobService.getAllJobs() → job dropdown
├── Admin selects a job → jobApplicationService.getByPrefix(jobPrefix)
└── Candidates table with columns: Name, Email, Phone, Experience, Role, Status, Actions

Step 2: Pipeline stage stepper
├── Stages: APPLIED → SHORTLISTED → WRITTEN TEST → INTERVIEW → SELECTED
├── Each stage highlighted based on candidate's current status
└── Visual progress indicator per candidate row

Step 3: Admin actions per candidate
├── "View" button → opens candidate detail modal:
│   ├── Full personal details (name, email, phone, experience, address)
│   ├── Application details (role, prefix, resume)
│   ├── Current status with color-coded badge
│   └── Match percentage (if ATS screened)
├── Email actions (from table): Send acknowledgement, rejection, exam link, etc.
└── Status progression through pipeline stages

Field Mapping (Backend DTO ↔ Frontend):
├── email / userEmail → getAppEmail() helper handles both
├── jobRole (not "role") → maps to job position
├── resumeFileName (not "resumeUrl") → S3 stored filename
├── matchPercent → ATS screening score
└── All status fields: confirmationStatus, acknowledgedStatus, reconfirmationStatus,
    examLinkStatus, examCompletedStatus, rejectionStatus, writtenTestStatus, interview
```

---

# Part 12: Styling System

## Tailwind CSS — Utility-First Approach

Instead of writing CSS files with class names, you write utility classes directly in JSX:

```tsx
// Traditional CSS:
// .card { background: white; padding: 16px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
// <div class="card">

// Tailwind CSS:
<div className="bg-white p-4 rounded-lg shadow-md">
```

**Common Tailwind classes used in this project:**

| Class | CSS | Purpose |
|-------|-----|---------|
| `flex` | `display: flex` | Flexbox container |
| `items-center` | `align-items: center` | Vertical centering |
| `justify-between` | `justify-content: space-between` | Spread items |
| `gap-4` | `gap: 1rem` | Space between flex items |
| `p-4` | `padding: 1rem` | Padding all sides |
| `px-4 py-2` | `padding: 0.5rem 1rem` | Horizontal/vertical padding |
| `mt-4` | `margin-top: 1rem` | Top margin |
| `text-sm` | `font-size: 0.875rem` | Small text |
| `font-bold` | `font-weight: 700` | Bold text |
| `rounded-lg` | `border-radius: 0.5rem` | Rounded corners |
| `border` | `border: 1px solid` | Border |
| `w-full` | `width: 100%` | Full width |
| `min-h-screen` | `min-height: 100vh` | Full viewport height |
| `hidden md:flex` | Hidden on mobile, flex on desktop | Responsive |

## CSS Variables — Theme System

Colors are NOT hardcoded. They use CSS variables that change based on light/dark mode.

```tsx
// Instead of:
<div className="bg-white text-black">      // ← Hardcoded, won't work in dark mode

// We use:
<div className="bg-[var(--background)] text-[var(--text)]">  // ← Changes with theme
```

**How it works:**

```
ThemeContext.tsx
├── Determines isDark (based on user preference or system)
├── Selects lightTheme or darkTheme from tokens.ts
└── Sets CSS variables on <html> element:
    document.documentElement.style.setProperty('--background', '#ffffff')  // light
    document.documentElement.style.setProperty('--background', '#0f172a')  // dark
```

**Key CSS variables (defined in `theme/tokens.ts`):**

| Variable | Light Value | Dark Value | Used For |
|----------|------------|------------|----------|
| `--background` | `#ffffff` | `#0f172a` | Page background |
| `--text` | `#0f172a` | `#f1f5f9` | Primary text |
| `--textSecondary` | `#475569` | `#cbd5e1` | Secondary text |
| `--primary` | `#2563eb` | `#3b82f6` | Buttons, links, accents |
| `--cardBg` | `#ffffff` | `#1e293b` | Card backgrounds |
| `--border` | `#e2e8f0` | `#334155` | Borders |
| `--surface1` | `#f8fafc` | `#1e293b` | Subtle backgrounds |
| `--inputBg` | `#ffffff` | `#1e293b` | Input fields |
| `--error` | `#ef4444` | `#ef4444` | Error states |
| `--success` | `#10b981` | `#10b981` | Success states |

---

# Part 13: File Reference — Every File Explained

## Config Files (`src/config/`)

| File | Purpose | Key Exports |
|------|---------|-------------|
| `api.endpoints.ts` | All backend API URL paths | `ENDPOINTS` object with nested paths |
| `app.config.ts` | App-wide constants | Timer durations, file limits, compiler languages |
| `env.ts` | Environment variables | `ENV.API_BASE_URL`, `ENV.WS_URL` |
| `error-messages.ts` | Error code → user message | `getErrorMessage(code)` function |
| `permissions.ts` | Permission constants | `PERMISSIONS` object, `PermissionName` type |
| `roles.ts` | Role constants | `ROLES` object, `RoleName` type |
| `routes.ts` | Frontend URL constants | `ROUTES.PUBLIC.LOGIN`, `ROUTES.ADMIN.DASHBOARD`, etc. |
| `validation.ts` | Zod form validation schemas | `loginSchema`, `registerSchema`, `jobPostSchema`, etc. |

## Context Files (`src/contexts/`)

| File | State It Manages | Functions It Provides |
|------|-----------------|----------------------|
| `AuthContext.tsx` | `user`, `roles`, `permissions`, `isLoading` | `login()`, `register()`, `logout()`, `isAuthenticated` |
| `ThemeContext.tsx` | `theme`, `mode` (light/dark/system) | `setMode()`, `isDark` |

## Hook Files (`src/hooks/`)

| Hook | What It Does | Used By |
|------|-------------|---------|
| `useRbac.ts` | `hasRole()`, `hasPermission()`, `can()` checks | ProtectedRoute, RoleGate, Sidebar, Navbar |
| `useTimer.ts` | Countdown timer with pause/reset/expire | CodingAssessment, AptitudeAssessment, Interview |
| `useFullscreen.ts` | Enter/exit browser fullscreen | CodingAssessment, AptitudeAssessment |
| `usePageVisibility.ts` | Detect tab switches + count | CodingAssessment, AptitudeAssessment |
| `useFaceDetection.ts` | Face detection via camera with warnings | CodingAssessment, AptitudeAssessment |
| `useMediaRecorder.ts` | Record video/audio in chunks | InterviewPage |
| `useSpeechSynthesis.ts` | Text-to-speech (read questions aloud) | InterviewPage |
| `useSpeechRecognition.ts` | Speech-to-text (voice answers) | InterviewPage |
| `useDebounce.ts` | Delay rapid value changes | Search inputs |
| `useLocalStorage.ts` | Persist state in localStorage | General use |
| `useWebSocket.ts` | Real-time WebSocket connection | Notifications |

## Service Files (`src/services/`)

| Service | Backend It Talks To | Methods |
|---------|-------------------|---------|
| `api.service.ts` | Core Axios setup | `getAccessToken()`, `setAccessToken()`, `clearTokens()`, `extractApiError()` |
| `auth.service.ts` | Auth endpoints | `login()`, `register()`, `refresh()`, `logout()`, `me()`, OTP/password methods |
| `user.service.ts` | User endpoints | `getAll()`, `getByEmail()`, `update()`, `activate()`, `deactivate()`, profile image |
| `job.service.ts` | Job endpoints | `getAllJobs()`, `createJob()` |
| `job-application.service.ts` | Application endpoints | `apply()`, `update()`, `getByPrefix()`, 6 email methods |
| `assessment.service.ts` | Assessment endpoints | `upload()`, `assign()`, `submit()`, `saveResult()`, `generateQuestions()`, `generateCodingQuestions()` |
| `compiler.service.ts` | Compiler endpoint | `runCode()`, `saveUnattempted()` |
| `ai.service.ts` | AI interview endpoints | `startInterview()`, `answerQuestion()`, `voiceToText()`, `uploadVideo()` |
| `interview.service.ts` | Interview schedule endpoints | `assignInterview()`, `getActiveInterviews()`, `getResults()` |
| `resume.service.ts` | Resume endpoints | `upload()`, `update()`, `view()`, `viewAll()`, `uploadMultiple()` |
| `websocket.service.ts` | WebSocket server | `connect()`, `disconnect()`, `on()`, `send()` |

## Type Files (`src/types/`)

| File | What It Defines |
|------|----------------|
| `api.types.ts` | `ApiResponse<T>`, `ApiError`, `ApiErrorEnvelope`, `PaginatedResponse<T>` |
| `auth.types.ts` | `LoginRequest`, `UserInfo`, `LoginData`, `MeResponse`, `RegisterRequest`, OTP/password types |
| `user.types.ts` | `UsersDto`, `UserProfile` |
| `job.types.ts` | `JobPostDTO`, `JobApplicationDTO`, `JobApplicationStatus` |
| `assessment.types.ts` | `Assessment`, `Question`, `CodingQuestion`, `TestCase`, `AssessmentResult` |
| `compiler.types.ts` | `CodeSubmissionRequest`, `CodeSubmissionResponse`, `TestCaseDTO`, `TestCaseResult` |
| `interview.types.ts` | `InterviewSchedule`, `StartInterviewRequest`, `AnswerQuestionRequest`, `ConversationEntry` |
| `result.types.ts` | `Result`, `ResultDetail` |

## Component Files (`src/components/`)

| Component | Purpose | Used By |
|-----------|---------|---------|
| `ErrorBoundary.tsx` | Catches JavaScript errors, shows error UI | main.tsx (wraps entire app) |
| `auth/ProtectedRoute.tsx` | Route guard: redirects if not authenticated/authorized | App.tsx route definitions |
| `auth/RoleGate.tsx` | Conditionally renders children based on role | Admin pages |
| `auth/PermissionGate.tsx` | Conditionally renders children based on permission | Admin pages |
| `layout/Layout.tsx` | Page frame: sidebar + navbar + content outlet | All authenticated routes |
| `layout/Navbar.tsx` | Top bar: search, theme toggle, notifications, profile | Layout.tsx |
| `layout/Sidebar.tsx` | Left nav: different items for admin vs candidate | Layout.tsx |
| `ui/*` (28 files) | Reusable UI primitives (Button, Card, Modal, etc.) | All pages |

## Page Files (`src/pages/`)

### Auth Pages
| Page | Route | Purpose |
|------|-------|---------|
| `LoginPage.tsx` | `/login` | Email/password login with role-based redirect |
| `RegisterPage.tsx` | `/register` | New user registration |
| `ForgotPasswordPage.tsx` | `/forgot-password` | OTP generation via email/mobile |
| `ResetPasswordPage.tsx` | `/reset-password` | Set new password after OTP verification |
| `ChangePasswordPage.tsx` | `/*/change-password` | Change password (requires current password) |

### Admin Pages
| Page | Route | Purpose |
|------|-------|---------|
| `AdminDashboardPage.tsx` | `/admin/dashboard` | Stats overview |
| `JobPostFormPage.tsx` | `/admin/jobs/create` | Create job postings |
| `CandidateDetailsPage.tsx` | `/admin/candidates` | View/manage candidates per job |
| `AtsScreeningPage.tsx` | `/admin/ats` | ATS resume screening |
| `AtsBatchPage.tsx` | `/admin/ats/batch` | Batch ATS screening |
| `AssignAssessmentPage.tsx` | `/admin/assessments/assign` | Assign exams to candidates |
| `UploadQuestionPaperPage.tsx` | `/admin/assessments/upload` | Upload question papers |
| `ResultsPage.tsx` | `/admin/assessments/results` | View assessment results |
| `InterviewSchedulerPage.tsx` | `/admin/interviews/schedule` | Schedule AI interviews |
| `InterviewResultsPage.tsx` | `/admin/interviews/results` | View interview results |
| `JobPromptPage.tsx` | `/admin/prompts` | Manage AI prompts per job |

### Candidate Pages
| Page | Route | Purpose |
|------|-------|---------|
| `CandidateDashboardPage.tsx` | `/candidate/dashboard` | Candidate overview |
| `ProfilePage.tsx` | `/candidate/profile` | Edit profile + profile image |
| `ResumePage.tsx` | `/candidate/resume` | Upload/view resume |
| `EventsPage.tsx` | `/candidate/events` | View job events |
| `JobApplicationPage.tsx` | `/candidate/apply` | Apply for jobs |
| `AssessmentListPage.tsx` | `/candidate/assessments` | View assigned assessments |
| `ExamInstructionsPage.tsx` | `/candidate/instructions` | Pre-exam instructions |
| `AptitudeAssessmentPage.tsx` | `/candidate/exam/aptitude` | Take MCQ exam (with proctoring) |
| `CodingAssessmentPage.tsx` | `/candidate/exam/coding` | Take coding exam (Monaco editor + proctoring) |
| `InterviewListPage.tsx` | `/candidate/interviews` | View scheduled interviews |
| `InterviewPage.tsx` | `/candidate/interview` | Take AI interview (voice + video) |
| `InterviewSummaryPage.tsx` | `/candidate/interview/summary` | View interview summary |
| `ResultsListPage.tsx` | `/candidate/results` | View all exam results |
| `ResultDetailPage.tsx` | `/candidate/results/:id` | Detailed result with answers |

## Utility Files (`src/utils/`)

| File | Functions | Purpose |
|------|-----------|---------|
| `jwt.utils.ts` | `parseJwtPayload()`, `isJwtExpired()`, `getJwtSubject()` | JWT token parsing without a library |
| `format.utils.ts` | `formatDate()`, `formatName()`, `getInitials()`, `formatTimer()`, `formatFileSize()` | Display formatting |
| `storage.utils.ts` | `getItem()`, `setItem()`, `removeItem()`, `clearAll()` | localStorage wrapper with prefix |
| `file.utils.ts` | `validateResumeFile()`, `validateImageFile()` | File type/size validation |

---

# Part 14: How to Debug & Fix Bugs

## Step 1: Identify Which Layer Has the Bug

```
Symptom                              Likely Layer              Start Looking At
────────────────────────────────────────────────────────────────────────────────
Page doesn't render / blank screen   Component/JSX             Page .tsx file, check for crashes
Data doesn't load                    Service/API               Network tab, service file
Wrong data displayed                 Types/mapping             Check type interfaces, field names
Button doesn't work                  Event handler             Check onClick function
Style looks wrong                    CSS/Tailwind              Check className, CSS variables
Login/redirect fails                 Auth flow                 AuthContext, LoginPage, ProtectedRoute
Permission error                     RBAC                      useRbac, ProtectedRoute, backend roles
API returns error                    Backend or endpoints      Check api.endpoints.ts matches backend
Form validation fails                Zod schema                Check validation.ts
```

## Step 2: Use Browser Developer Tools

```
F12 → Open DevTools

Console Tab:
├── Red errors → JavaScript crashes
├── Network failures → API issues
└── Console.log → Debug output

Network Tab:
├── Filter by "Fetch/XHR" to see API calls
├── Click any request to see:
│   ├── Request URL → Does it match api.endpoints.ts?
│   ├── Request Headers → Is Authorization present?
│   ├── Request Body → Does it match the TypeScript type?
│   ├── Response Status → 200? 401? 500?
│   └── Response Body → Does it match the expected type?
│
└── Common issues:
    ├── 401 → Token expired or missing
    ├── 403 → Wrong role/permission
    ├── 404 → Wrong endpoint path
    └── 500 → Backend error (check backend logs)

React DevTools (browser extension):
├── Components tab → See component tree and current props/state
├── Click a component → See its useState values
└── Profiler → Find performance bottlenecks
```

## Step 3: Trace the Data Flow

When something is wrong, trace from the user action to the screen:

```
1. Find the page file (check routes in App.tsx)
2. Find the event handler (onClick, onSubmit, useEffect)
3. Find the service call (grep for the service name)
4. Check the endpoint (in api.endpoints.ts)
5. Check the types (does frontend type match backend DTO?)
6. Check the response handling (how is res.data used?)
7. Check the state update (what does setState do?)
8. Check the JSX (how is state rendered?)
```

## Common Bug Patterns We've Fixed

### Bug: Field name mismatch
```
SYMPTOM: API call succeeds but backend ignores some fields
CAUSE: Frontend sends { code, input } but backend expects { script, customInput }
FIX: Update TypeScript type to match backend DTO, update all callers
FILE: compiler.types.ts, CodingAssessmentPage.tsx
```

### Bug: Wrong endpoint path
```
SYMPTOM: 404 Not Found from API
CAUSE: Frontend uses /api/ai/start-interview but backend has /api/interview/start
FIX: Update api.endpoints.ts to match backend routes
FILE: api.endpoints.ts
```

### Bug: State race condition
```
SYMPTOM: Login always redirects to candidate dashboard, even for admins
CAUSE: roles state is [] from previous render, setState hasn't updated yet
FIX: Return roles from login() function, use returned value directly
FILE: AuthContext.tsx, LoginPage.tsx
```

### Bug: CSS variable doesn't exist
```
SYMPTOM: Element has no background color
CAUSE: Using var(--bg) but the actual variable is var(--background)
FIX: Check theme/tokens.ts for actual variable names
FILE: CodingAssessmentPage.tsx, InterviewPage.tsx, AptitudeAssessmentPage.tsx
```

### Bug: Double camera stream
```
SYMPTOM: Camera indicator blinks, browser shows "camera in use" twice
CAUSE: useMediaRecorder calls getUserMedia, then component calls it again
FIX: Reuse the stream from useMediaRecorder instead of creating a second one
FILE: InterviewPage.tsx
```

### Bug: Speech overwrites typed text
```
SYMPTOM: When user types in textarea, speech recognition replaces all typed text
CAUSE: useEffect sets currentAnswer = transcript (replacement, not append)
FIX: Use setCurrentAnswer(prev => prev + ' ' + transcript)
FILE: InterviewPage.tsx
```

---

## Quick Reference: How to Add a New Feature

### Adding a New Page

1. **Create the page component:** `src/pages/candidate/NewPage.tsx`
2. **Add the route constant:** in `src/config/routes.ts`
3. **Add the route:** in `src/App.tsx` under the appropriate section
4. **Add sidebar link (if needed):** in `src/components/layout/Sidebar.tsx`

### Adding a New API Call

1. **Add the endpoint:** in `src/config/api.endpoints.ts`
2. **Add the types:** in `src/types/something.types.ts`
3. **Add the service method:** in `src/services/something.service.ts`
4. **Call it from your page:** `const res = await someService.newMethod(data)`

### Adding a New Form

1. **Add the Zod schema:** in `src/config/validation.ts`
2. **Use react-hook-form in your page:**
```tsx
const { register, handleSubmit, formState: { errors } } = useForm({
  resolver: zodResolver(yourSchema),
});
```
3. **Use `<Input>` components with `{...register('fieldName')}`**

---

## Glossary

| Term | Meaning |
|------|---------|
| **Component** | A function that returns JSX (UI). Building block of React. |
| **Props** | Data passed from parent component to child component. |
| **State** | Data owned by a component that triggers re-render when changed. |
| **Hook** | A function starting with `use` that adds React features to components. |
| **Context** | React's built-in way to share state across many components. |
| **Provider** | A component that supplies Context data to all its children. |
| **JSX** | HTML-like syntax written inside JavaScript/TypeScript. |
| **Re-render** | When React recalculates and updates a component's UI. |
| **Mount** | When a component is first added to the screen. |
| **Unmount** | When a component is removed from the screen. |
| **SPA** | Single Page Application — one HTML page, JS handles navigation. |
| **Route** | A URL pattern mapped to a component (e.g., `/login` → LoginPage). |
| **Interceptor** | Middleware that runs before/after every HTTP request. |
| **DTO** | Data Transfer Object — the shape of data sent to/from the backend. |
| **JWT** | JSON Web Token — encoded token containing user identity. |
| **RBAC** | Role-Based Access Control — restrict features by user role. |
| **Tailwind** | Utility-first CSS framework — styles via class names. |
| **Vite** | Build tool that compiles TypeScript/JSX and serves the dev server. |
| **Axios** | HTTP client library for making API calls. |
| **Zod** | Schema validation library used with react-hook-form. |

---

# Part 15: Compiler API & Coding Assessment — Complete Reference

## 15.1 Backend Compiler Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/compiler/run` | POST | Execute code (with optional test cases or custom input) |
| `/api/compiler/save-unattempted` | POST | Save empty/unattempted submissions |
| `/api/compiler/results/code` | GET | Get latest saved code by email, jobPrefix, questionId |
| `/api/compiler/results/{email}/{language}` | GET | Get submissions by user and language |
| `/api/compiler/results/{email}/question/{qId}` | GET | Get submissions for a specific question |

## 15.2 Request Format — `CodeSubmissionRequestDTO`

```
POST /api/compiler/run
{
  "language": "java",              // java | python | c | cpp | javascript
  "script": "public class ...",    // source code
  "testCases": [                   // optional — if provided, runs against test cases
    { "input": "5", "expectedOutput": "120" }
  ],
  "customInput": "5\n3",           // optional — if no testCases, used as stdin
  "userEmail": "user@example.com",
  "questionId": "1",               // String on BE
  "assessmentId": "42",            // String on BE
  "jobPrefix": "JP_001",
  "createdAt": "2025-02-26T10:30:00"
}
```

**Execution logic:**
- If `testCases` is provided → runs code against each test case, compares expected vs actual output
- If only `customInput` is provided → runs code once with that input, no comparison
- Otherwise → runs with empty input

## 15.3 Response Format — `CodeSubmissionResponseDTO`

```
{
  "id": 123,
  "language": "java",
  "script": "public class ...",
  "userEmail": "user@example.com",
  "questionId": "1",
  "createdAt": "2025-02-26T10:30:00",
  "passed": true,                  // null if custom input run, true/false if test cases
  "testResults": [                 // always an array (even for custom input — 1 entry)
    {
      "input": "5",
      "expectedOutput": "120",     // null for custom input runs
      "actualOutput": "120",       // actual program output (or "Runtime Error: ...")
      "passed": true,
      "questionId": "1",
      "errorInfo": null            // or CodeErrorInfo object if error
    }
  ]
}
```

## 15.4 Error Info — `CodeErrorInfo`

When code fails to compile or throws a runtime error, each test result includes:

```
{
  "type": "CompilationError",      // CompilationError | SyntaxError | RuntimeError | TimeoutError
  "line": 5,                       // line number where error occurred (nullable)
  "message": "';' expected",       // short, human-readable error message
  "fullTrace": "Main.java:5: ..."  // complete raw compiler/runtime output
}
```

**How errors are detected on the BE:**
1. Code is compiled/executed using `ProcessBuilder`
2. Non-zero exit code → `CompilerException` is thrown
3. Error output is passed to `parseErrorInfo(rawError, language)` which uses regex patterns per language to extract type, line number, and message
4. If `actualOutput` starts with `"Runtime Error:"`, the test case is marked as failed with error info

## 15.5 Language Support & Compilation

| Language | Compile Command | Run Command | Error Pattern Example |
|----------|----------------|-------------|----------------------|
| Java | `javac ClassName.java` | `java -cp . ClassName` | `Main.java:5: error: ';' expected` |
| Python | *(interpreted)* | `python script.py` | `SyntaxError: invalid syntax (script.py, line 3)` |
| C | `gcc source.c -o executable` | `./executable` | `source.c:10:5: error: expected ';'` |
| C++ | `g++ source.cpp -o executable` | `./executable` | `source.cpp:10:5: error: expected ';'` |
| JavaScript | *(Node.js)* | `node script.js` | `SyntaxError: Unexpected token` |

## 15.6 Frontend Type Mapping

### FE types (`compiler.types.ts`) → BE DTOs:

| FE Type | BE DTO | Notes |
|---------|--------|-------|
| `CodeSubmissionRequest` | `CodeSubmissionRequestDTO` | `questionId` is number on FE, String on BE (auto-converted) |
| `CodeSubmissionResponse` | `CodeSubmissionResponseDTO` | `testResults` array always present |
| `TestCaseResultDTO` | `TestCaseDTO` (response shape) | Includes `errorInfo` field |
| `CodeErrorInfo` | `CodeErrorInfo` | Identical structure |

### FE types (`assessment.types.ts`) → BE DTOs:

| FE Type | BE DTO | Notes |
|---------|--------|-------|
| `RawQuestion` | `Question.java` | `options` is `Map<String,String>` (e.g., `{"A":"text"}`) |
| `Question` | *(normalised FE-only)* | `options` is `{key,text}[]` after normalisation |
| `RawCodingQuestion` | `CodingQuestion.java` | `question` field (not `questionText`) |
| `CodingQuestion` | *(normalised FE-only)* | `description` populated from `question` or `description` |

## 15.7 Coding Assessment Page — Architecture

### Per-question workflow:
1. **Run** → calls `/api/compiler/run` with `customInput`, no test cases. Shows raw output.
2. **Test** → calls `/api/compiler/run` with `testCases`. Shows pass/fail per test case.
3. **Save** → calls `/api/compiler/run` (persists to DB), marks question as "saved" (draft).
4. **Submit Q{n}** → calls `/api/compiler/run` with test cases (persists + evaluates), marks as "submitted", locks editor.
5. **Submit Exam** → calls `assessmentService.saveResult()` with all questions' code/status as JSON.

### Question status lifecycle:
```
not_started → in_progress → saved → submitted (locked)
```

### Monaco editor error markers:
- On compilation/syntax error: red squiggly underline at the error line
- On runtime error: orange/warning squiggly at the error line (if line number available)
- Editor scrolls to the error line automatically
- Markers are cleared before each new run

### Key state:
- `codePerQuestion` — `Record<questionId, code>` — persists code when switching questions
- `langPerQuestion` — `Record<questionId, language>` — persists language choice per question
- `questionStatus` — `Record<questionId, QuestionStatus>` — tracks lifecycle per question
- `compilerResponse` — full BE response for current run
- `currentError` — extracted `CodeErrorInfo` for current run (if any)

## 15.8 Assessment Assignment Flow (Admin → Candidate)

### How questions are stored:
1. Admin generates questions via AI (`/api/generate-questions`) or uploads a JSON file
2. Admin clicks "Assign Assessment" → FE sends `POST /api/assign` as multipart form data
3. BE uploads question paper file to **S3** (`storageService.uploadFile()`)
4. Assessment record saved with `containerName` + `fileName` (S3 path), `questionPaper` column is NULL
5. Status transition: `RECONFIRMED → EXAM_SENT` (via `StatusTransitionValidator`)

### How questions are fetched (candidate exam):
1. Candidate opens exam → FE calls `GET /api/fetchAssessment/{id}`
2. BE calls `resolveQuestionPaperFromStorage()` — downloads from S3 if `questionPaper` is null
3. Returns `{ assessmentType, questions: "<JSON string>", jobPrefix }`
4. FE parses the JSON string and normalises into typed Question/CodingQuestion arrays

### Backward compatibility:
- Old assessments with `questionPaper` in DB column → returned directly (S3 fallback skipped)
- New assessments with S3 storage → downloaded transparently, candidate sees no difference

## 15.9 Aptitude Question Data Shape

**From BE (raw):**
```json
{
  "id": 1,
  "question": "What is the time complexity of binary search?",
  "options": {
    "A": "O(1)",
    "B": "O(log n)",
    "C": "O(n)",
    "D": "O(n log n)"
  },
  "correctAnswer": "B",
  "category": "Data Structures",
  "Difficulty": "Medium"
}
```

**Normalised on FE:**
```json
{
  "id": 1,
  "questionText": "What is the time complexity of binary search?",
  "options": [
    { "key": "A", "text": "O(1)" },
    { "key": "B", "text": "O(log n)" },
    { "key": "C", "text": "O(n)" },
    { "key": "D", "text": "O(n log n)" }
  ],
  "correctAnswer": "B"
}
```

**Important:** The `normalizeQuestions()` function in `AptitudeAssessmentPage.tsx` handles both Map and legacy array formats for `options`.

## 15.10 Status Transition Rules

```
APPLIED → SHORTLISTED | REJECTED
SHORTLISTED → ACKNOWLEDGED | REJECTED
ACKNOWLEDGED → ACKNOWLEDGED_BACK
ACKNOWLEDGED_BACK → RECONFIRMED | REJECTED
RECONFIRMED → EXAM_SENT | REJECTED
EXAM_SENT → EXAM_COMPLETED
EXAM_COMPLETED → INTERVIEW_SCHEDULED | REJECTED
INTERVIEW_SCHEDULED → INTERVIEW_COMPLETED
INTERVIEW_COMPLETED → SELECTED | REJECTED
```

Enforced by `StatusTransitionValidator.validate(currentStatus, targetStatus)` — throws `IllegalStateException` on invalid transitions. REJECTED and SELECTED are terminal states.
