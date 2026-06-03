# STEMotion Engineering Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade STEMotion into a Next.js modular monolith with versioned REST APIs, feature-level application services, and enforceable import boundaries.

**Architecture:** Keep a single Next.js app. Move public behavior behind `src/features/*/application` services, keep `src/app` as routing/composition only, and isolate platform concerns under `src/platform`. Existing `src/lib/*` modules remain as compatibility infrastructure during this migration so the dirty worktree is preserved and route behavior does not regress.

**Tech Stack:** Next.js 16 App Router, TypeScript, React 19, native Route Handlers, Node test runner, ESLint, local JSON/Skill files.

---

### Task 1: Baseline Architecture Contracts

**Files:**
- Create: `tests/test_architecture_boundaries.ts`
- Create: `tests/test_api_v1_contracts.ts`
- Create: `src/platform/errors.ts`
- Create: `src/platform/api/http.ts`

- [x] **Step 1: Write failing architecture boundary tests**
- [x] **Step 2: Run targeted tests and confirm missing v1 routes/contracts fail**
- [x] **Step 3: Add platform error and JSON response helpers**
- [x] **Step 4: Re-run targeted tests**

### Task 2: RAG Feature Facade and v1 API

**Files:**
- Create: `src/features/rag/contracts.ts`
- Create: `src/features/rag/application/ragAskService.ts`
- Create: `src/features/rag/client/ragClient.ts`
- Create: `src/features/rag/ui/RagWorkbench.tsx`
- Create: `src/app/api/v1/rag/ask/route.ts`
- Modify: `src/app/api/rag/ask/route.ts`
- Modify: `src/app/rag/page.tsx`

- [x] **Step 1: Implement v1 request/response mapping around existing RAG pipeline**
- [x] **Step 2: Route `/api/v1/rag/ask` through `RagAskService`**
- [x] **Step 3: Keep `/api/rag/ask` as a legacy adapter**
- [x] **Step 4: Point `/rag` at the feature workbench and v1 client**

### Task 3: Subjects, Settings, and Deep Interaction Facades

**Files:**
- Create: `src/features/subjects/application/subjectService.ts`
- Create: `src/features/settings/application/modelProfileService.ts`
- Create: `src/features/deep-interaction/application/deepInteractionService.ts`
- Create: `src/app/api/v1/subjects/route.ts`
- Create: `src/app/api/v1/subjects/default/route.ts`
- Create: `src/app/api/v1/model-profiles/route.ts`
- Create: `src/app/api/v1/model-profiles/[id]/route.ts`
- Create: `src/app/api/v1/model-profiles/models/route.ts`
- Create: `src/app/api/v1/deep-interaction/generate/route.ts`
- Create: `src/app/api/v1/deep-interaction/planning/route.ts`
- Create: `src/app/api/v1/deep-interaction/follow-up/route.ts`

- [x] **Step 1: Wrap current subject/model/deep-interaction logic in application services**
- [x] **Step 2: Add v1 route handlers that only call feature services**
- [x] **Step 3: Keep old routes as compatibility adapters**
- [x] **Step 4: Move frontend fetches to `/api/v1/*`**

### Task 4: Engineering Governance

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `docs/system_architecture.md`
- Modify: `package.json`

- [x] **Step 1: Add architecture test to `npm test` by keeping it under `tests/*.ts`**
- [x] **Step 2: Add CI workflow with install, test, lint, typecheck, build**
- [x] **Step 3: Document modular monolith structure and v1 API**
- [x] **Step 4: Run full verification**
