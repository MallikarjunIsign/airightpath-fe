# RightPath — Technical Documentation

The engineering reference for the RightPath hiring platform: the React client
(`airightpath-fe`) and the Spring Boot API (`airightpath-be`), documented as one
system because almost every feature spans both.

The product is described in two levels, and the docs follow that split:

| Level | Covers | Ends at |
| --- | --- | --- |
| **L1** | Job posting, application, ATS screening, shortlisting, exam assignment, aptitude exam, coding exam, proctoring, results | The aptitude and coding **exam result** |
| **L2** | Interview scheduling, the AI voice interview, proctoring during the interview, evaluation, interview results | Interview outcome / hiring decision |

## Start here

| Document | Format | Use it for |
| --- | --- | --- |
| **[AIRightpath-Technical-Reference.md](AIRightpath-Technical-Reference.md)** | Markdown, single file | The whole system in one document — handover, review, or reading end to end |
| **[airightpath-technical-reference.html](airightpath-technical-reference.html)** | Designed web page | The same content, published as a navigable artifact for sharing |
| **[AIRightpath-Data-Flow.md](AIRightpath-Data-Flow.md)** | Markdown + Mermaid | Eight block diagrams, including a login-to-result walkthrough from both the recruiter's and candidate's side |
| **[AIRightpath-Data-Flow.doc](AIRightpath-Data-Flow.doc)** | Word (~1.5 MB) | The data-flow diagrams alone, as one file to attach and send — cover page, all eight diagrams rendered as images |
| **[AIRightpath-Technical-Documentation.doc](AIRightpath-Technical-Documentation.doc)** | Word (~1.6 MB) | Everything above in one file to attach and send — cover page, both parts, all eight diagrams rendered as images |

The modular set below is the same material split by topic. Edit whichever suits
the change, then mirror it into the other two — see *Keeping these docs current*.

> Both `.doc` files are **generated**, not hand-edited. They are built from
> `AIRightpath-Technical-Reference.md` and `AIRightpath-Data-Flow.md`, with the
> Mermaid diagrams rendered to images through a headless browser. Edit the
> markdown and ask for a rebuild; edits made inside Word are lost on the next
> one.

## Index

| # | Document | Read it for |
| --- | --- | --- |
| 00 | [Overview](00-overview.md) | What the product is, who uses it, the end-to-end candidate lifecycle, L1/L2 boundary |
| 01 | [System Architecture](01-architecture.md) | Stack, repositories, runtime topology, how FE and BE talk |
| 02 | [Backend Architecture](02-backend-architecture.md) | Spring Boot layering, packages, services, async, scheduled jobs |
| 03 | [Frontend Architecture](03-frontend-architecture.md) | React app structure, routing, state, service layer, design system |
| 04 | [L1 — Assessment Flow](04-l1-assessment-flow.md) | Apply → ATS → shortlist → assign → exam → result, front and back |
| 05 | [L2 — Interview Flow](05-l2-interview-flow.md) | Schedule → AI voice interview → evaluation → results |
| 06 | [API Reference](06-api-reference.md) | Every REST endpoint and WebSocket destination, with the permission it needs |
| 07 | [Data Model](07-data-model.md) | Entities, columns, relationships, enums |
| 08 | [Security & RBAC](08-security-rbac.md) | JWT access + rotating refresh, roles, permission matrix |
| 09 | [Environments & Deployment](09-environments-deployment.md) | Profiles, env vars, Docker, nginx, build and run |
| 10 | [Project Status](10-project-status.md) | What is complete, what is partial, what is not built |

### Existing deep-dives (kept, still current)

| Document | Scope |
| --- | --- |
| [AI-Interview-Process-Overview.md](AI-Interview-Process-Overview.md) | L2 in plain language, step by step |
| [AI-Interview-Technical-Flow.md](AI-Interview-Technical-Flow.md) | L2 internals: threads, OpenAI calls, recovery |
| [interview-flow.md](interview-flow.md) | L2 condensed walkthrough |
| [backend-requirements-exam-capture.md](backend-requirements-exam-capture.md) | L1 proctoring-capture API contract |
| [../VOICE_INTERVIEW_ARCHITECTURE.md](../VOICE_INTERVIEW_ARCHITECTURE.md) | L2 architecture, sequence diagrams |
| [../KNOWLEDGE_BASE.md](../KNOWLEDGE_BASE.md) | React onboarding + frontend walkthrough for new joiners |
| [../DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md) | Tokens, components, visual rules |

## Keeping these docs current

Each document owns one subject, so a change usually touches exactly one file.
Use this table to decide where an update goes.

| If you changed… | Update |
| --- | --- |
| How data moves between components or stores | [AIRightpath-Data-Flow.md](AIRightpath-Data-Flow.md) |
| A REST endpoint or WS destination | [06-api-reference.md](06-api-reference.md) — and `src/config/api.endpoints.ts` on the client |
| An entity, column or enum | [07-data-model.md](07-data-model.md) |
| A permission, role or auth rule | [08-security-rbac.md](08-security-rbac.md) |
| Exam, proctoring or grading behaviour | [04-l1-assessment-flow.md](04-l1-assessment-flow.md) |
| Interview behaviour, prompts or evaluation | [05-l2-interview-flow.md](05-l2-interview-flow.md) |
| A config key, profile or env var | [09-environments-deployment.md](09-environments-deployment.md) |
| A feature shipped, or a known gap closed | [10-project-status.md](10-project-status.md) |
| Backend package or service layout | [02-backend-architecture.md](02-backend-architecture.md) |
| Frontend folders, routes or contexts | [03-frontend-architecture.md](03-frontend-architecture.md) |

Conventions used throughout:

- Backend paths are written relative to the backend repo root (`src/main/java/...`).
- Frontend paths are relative to this repo root (`src/...`) and are clickable links.
- Anything asserted here was read out of the code; when a doc describes intent
  rather than shipped behaviour it says so explicitly.
- Config values quoted are the `dev` profile defaults unless stated otherwise.

**Repositories**

```
AI-Rightpath/
├── Frontend/airightpath-fe    React 18 + Vite + TypeScript   (this repo)
└── Backend/airightpath-be     Spring Boot 3.4 + Java 21 + MySQL
```
