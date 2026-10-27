# 08 — Security & RBAC

## Authentication model

Short-lived JWT access token + opaque, rotating refresh token. The design
decision is recorded in the backend ADR
`docs/adr/0001-v2-auth-access-jwt-rotating-refresh.md`; this file describes what
is actually running.

### Access token

- Signed JWT, subject = the user's email.
- TTL `rightpath.security.v2.jwt.access-ttl-minutes` = **10 minutes**.
- Validated for issuer (`arightpath.com`), audience (`rightpath-web`) and time
  claims with `clock-skew-seconds` = 60.
- If `rightpath.security.v2.jwt.secret` is empty the implementation falls back to
  the legacy `jwt.token` secret.
- Carried as `Authorization: Bearer <token>`; verified by
  `ApiJwtAuthenticationFilter`, which builds the `Authentication` with the
  user's role and permission authorities.

### Refresh token

- **Opaque random value, not a JWT.** Only its SHA-256 hash is stored
  (`RefreshToken.tokenHash`, unique) — the raw value exists solely in the
  cookie.
- TTL `rightpath.security.v2.refresh.ttl-days` = **14 days**.
- Delivered as an httpOnly cookie: name `refresh_token`, path `/api`,
  `SameSite=Lax`, `Secure` per profile (`false` in dev/stage/uat/prod configs as
  shipped — see the note below).
- **Rotated on every use.** `RefreshTokenService.rotate` revokes the presented
  token, issues a successor, and links them through `replacedByTokenId`.
- **Reuse is treated as theft.** Presenting an already-rotated token throws
  `RefreshTokenReuseException` and calls `revokeSession(sessionId)` — the entire
  session chain dies, not just that token.

### What that forces on the client

Reuse detection is strict, so the client must never spend the cookie twice.
[`api.service.ts`](../src/services/api.service.ts) does three things about it:

1. **Persists the access token in `localStorage`.** Memory-only meant every page
   load started with nothing and had to spend a rotation; two reloads in quick
   succession presented the same refresh token twice and killed the session — the
   user was logged out for pressing F5. Persisting it means a reload reuses the
   token the tab already had. Sharing it across tabs (`localStorage`, not
   `sessionStorage`) means opening a second tab does not spend a rotation either.
   *Trade-off, stated plainly: the short-lived access token is readable by script
   on this origin. The refresh cookie stays httpOnly.*
2. **Single-flight refresh per tab.** One `refreshPromise`; every caller awaits
   it. Without this the startup bootstrap and the 401-retry path each ran their
   own refresh — and under React StrictMode the bootstrap ran twice by itself.
3. **A Web Locks lock (`rightpath_auth_refresh`) across tabs.** Locks are
   origin-wide, so two tabs waking together serialise instead of both spending
   the cookie. On browsers without Web Locks the per-tab guard still applies.

`setAccessToken` deliberately does **not** broadcast. Silent rotation must not
signal other tabs, or the receiving tab's bootstrap → refresh → set path would
re-broadcast and loop. Genuine session transitions call
`broadcastAuthChange('login' | 'logout')` over a `BroadcastChannel`.

`isJwtExpired` ([`jwt.utils.ts`](../src/utils/jwt.utils.ts)) with
`TOKEN_EXPIRY_SKEW_SECONDS` = 30 lets the client avoid a refresh it does not
need.

### Other credentials

- Passwords: BCrypt (`BCryptPasswordEncoder`), rules in `PasswordValidator`
  (`password.minsize` 8, `password.maxsize` 20).
- Password reset: OTP by email (`EmailType.OTP`), validated at
  `/api/validate-otp`, then `/api/update-password`. OTPs expire and are purged
  every 5 minutes.

## The security filter chain

`ApiSecurityConfig` registers one chain, `@Order(1)`, matching `/api/**`:

- CORS from `CorsConfig`, CSRF disabled, sessions `STATELESS`.
- `OPTIONS /**` permitted so browser preflight passes.
- Public allowlist:
  `/api/login`, `/api/register`, `/api/refresh`, `/api/logout`,
  `/api/compile/**`, `/api/job-applications/**`, `/api/mobile/**`,
  `/api/generate-otp`, `/api/validate-otp`, `/api/update-password`.
- Everything else `authenticated()`.
- `ApiJwtAuthenticationFilter` runs before `UsernamePasswordAuthenticationFilter`.

> **Note the breadth of `/api/job-applications/**`.** That whole prefix is in the
> allowlist, so chain-level authentication does not apply to it. Its endpoints
> are protected only by their `@PreAuthorize` annotations — which they do all
> carry (`JOB_APPLY` or `JOB_APPLICATION_READ_ALL`). It works, but the safety net
> is one layer thinner there than everywhere else; worth narrowing to just the
> genuinely public paths (`/apply`, `/acknowledge`).

## Authorization model

Roles and permissions live in the database and are enforced as Spring Security
authorities:

- Roles are exposed as `ROLE_<NAME>` (e.g. `ROLE_ADMIN`).
- Permissions are exposed as plain strings (e.g. `JOB_POST_CREATE`).
- Method security uses **permissions**, never roles:
  `@PreAuthorize("hasAuthority('JOB_POST_CREATE')")`.

`RbacAuthorityService.resolveAuthorities(email)` loads active rows from
`user_roles`, adds `ROLE_<NAME>` for each, and adds every permission attached to
those roles.

Tables: `roles`, `permissions`, `role_permissions`, `user_roles` (with an
`active` flag so a role can be switched off without deletion).

### Roles

| Role | Meaning |
| --- | --- |
| `SUPER_ADMIN` | Every permission |
| `ADMIN` | Everything except `USER_LIST`, `USER_ACTIVATE`, `USER_DEACTIVATE` |
| `USER` | Candidate — the limited set below |

### Permission matrix

Seeded by `RbacSeedConfig` on every boot (idempotent).

| Permission | SUPER_ADMIN | ADMIN | USER |
| --- | :---: | :---: | :---: |
| `USER_READ` | Y | Y | Y |
| `USER_UPDATE` | Y | Y | Y |
| `USER_LIST` | Y | – | – |
| `USER_ACTIVATE` | Y | – | – |
| `USER_DEACTIVATE` | Y | – | – |
| `RESUME_UPLOAD` | Y | Y | Y |
| `RESUME_UPDATE` | Y | Y | Y |
| `RESUME_VIEW` | Y | Y | Y |
| `RESUME_VIEW_ALL` | Y | Y | – |
| `ATS_UPLOAD_SINGLE` | Y | Y | – |
| `ATS_UPLOAD_MULTI` | Y | Y | – |
| `ATS_READ` | Y | Y | – |
| `ASSESSMENT_UPLOAD` | Y | Y | – |
| `ASSESSMENT_ASSIGN` | Y | Y | – |
| `ASSESSMENT_READ` | Y | Y | – |
| `ASSESSMENT_SUBMIT` | Y | Y | Y |
| `ASSESSMENT_RESULT_SUBMIT` | Y | Y | Y |
| `QUESTION_GENERATE` | Y | Y | – |
| `CODING_QUESTION_GENERATE` | Y | Y | – |
| `QUESTION_WRITE` | Y | Y | – |
| `JOB_POST_CREATE` | Y | Y | – |
| `JOB_POST_UPDATE` | Y | Y | – |
| `JOB_POST_DELETE` | Y | Y | – |
| `JOB_POST_READ` | Y | Y | Y |
| `JOB_WRITE` | Y | Y | – |
| `JOB_APPLY` | Y | Y | Y |
| `JOB_APPLICATION_READ_ALL` | Y | Y | – |
| `INTERVIEW_ASSIGN` | Y | Y | – |
| `INTERVIEW_WRITE` | Y | Y | – |
| `INTERVIEW_START` | Y | Y | Y |
| `INTERVIEW_ANSWER` | Y | Y | Y |
| `COMPILER_RUN` | Y | Y | Y |
| `COMPILER_RESULTS_READ` | Y | Y | Y |

`SUPER_ADMIN` is only refreshed if the row already exists. Some deployments have
a `roles.name` column too small to hold the string, and creating it would fail
startup — the seeder deliberately avoids that.

Roles are managed at runtime through `/api/admin/rbac/{assign-role, remove-role}`
(`USER_UPDATE`).

### Frontend RBAC

- [`ProtectedRoute`](../src/components/auth/ProtectedRoute.tsx) guards route
  trees by role.
- [`RoleGate`](../src/components/auth/RoleGate.tsx) and
  [`PermissionGate`](../src/components/auth/PermissionGate.tsx) hide UI.
- [`useRbac()`](../src/hooks/useRbac.ts) exposes `hasRole`, `hasAnyRole`,
  `hasPermission`, `hasAnyPermission`, `can`.

Roles and permissions come from the access token / `/api/me` and are held in
`AuthContext`. **Client checks are UX only** — every one is re-enforced by
`@PreAuthorize` on the server.

> **Known drift:** [`src/config/permissions.ts`](../src/config/permissions.ts)
> is not the backend enum. It invents `USER_WRITE`, `USER_DELETE`,
> `ASSESSMENT_WRITE`, `JOB_READ`, `ATS_WRITE`, `INTERVIEW_READ`,
> `QUESTION_READ`, `RESULT_READ`, `RESULT_WRITE`, `PROMPT_READ`, `PROMPT_WRITE`,
> none of which exist server-side, and omits most of the real ones
> (`JOB_POST_CREATE`, `ASSESSMENT_ASSIGN`, `INTERVIEW_ASSIGN`, `COMPILER_RUN`…).
> A `PermissionGate` keyed to an invented name can never open. Tracked in
> [10-project-status.md](10-project-status.md).

## Exam and interview integrity

Assessment security is behavioural as much as it is authorization —
see [04-l1-assessment-flow.md](04-l1-assessment-flow.md) for the full list:
lockdown layouts with no navigation, fullscreen enforcement, tab-switch
counting, face detection, devtools detection, noise checks, identity photo,
optional room scan, and auto-submit on limits.

WebSocket sessions are authenticated at handshake by `WebSocketAuthInterceptor`,
and every `@MessageMapping` re-verifies that the `scheduleId` in the destination
belongs to the authenticated email before acting. Audio chunks are capped at
200 KB and answers deduplicated by transcript hash for 60 s.

## Operational notes

- `cookie-secure: false` in all four shipped profiles. For any HTTPS deployment
  this should be `true`, set through `APP_*` env overrides.
- Secrets (DB password, JWT secret, OpenAI key, AWS keys, Twilio token, mail
  password) are committed as defaults in the profile YAMLs with `${ENV_VAR:...}`
  fallbacks. Always supply the environment variables in real deployments and
  treat the committed values as compromised. See
  [09-environments-deployment.md](09-environments-deployment.md).
- `ddl-auto=update` in production means Hibernate can alter the live schema.
- Actuator exposes only `health` and `info`.
