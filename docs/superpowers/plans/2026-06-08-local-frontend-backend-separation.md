# Local Frontend/Backend Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把长生成流程从浏览器请求生命周期中解耦，先在本机拆成 Next.js 前端进程和独立 API/worker 进程，页面中断后生成任务继续运行。

**Architecture:** 保留现有 Next.js UI，新增本机 backend server，端口默认 `3101`。前端通过 Next BFF 访问 generation job API；backend 负责 RAG、多 Agent 可视化、deep interaction 生成、SSE 事件、取消和本地文件状态持久化。

**Tech Stack:** Next.js 16、React 19、TypeScript、Node `http`、Web Streams/SSE、现有 RAG/deep-interaction pipeline、`.stemotion/jobs` 文件存储。

---

## Tasks

- [x] Add a file-backed generation job domain with redacted snapshots and ordered JSONL events.
- [x] Add `GenerationJobManager` so browser SSE disconnects remove subscribers only, while explicit cancel aborts the job signal.
- [x] Add backend runners for `rag_ask_stream`, `rag_visualization`, and `deep_interaction`.
- [x] Add local Node `http` backend server with health, create, status, events replay, and cancel endpoints.
- [x] Add Next.js BFF proxy routes for `/api/v1/generation-jobs`.
- [x] Add browser generation job client and migrate long RAG/deep-interaction generation calls to jobs.
- [x] Add local dual-process dev scripts and README documentation.

## Public Interfaces

- Backend base URL: `http://127.0.0.1:3101`
- Env:
  - `STEMOTION_API_BASE_URL=http://127.0.0.1:3101`
  - `STEMOTION_API_PORT=3101`
  - `STEMOTION_JOBS_DIR=.stemotion/jobs`
- Job API:
  - `POST /api/v1/generation-jobs`
  - `GET /api/v1/generation-jobs/:jobId`
  - `GET /api/v1/generation-jobs/:jobId/events`
  - `POST /api/v1/generation-jobs/:jobId/cancel`
- Job types:
  - `rag_ask_stream`
  - `rag_visualization`
  - `deep_interaction`

## Validation

- `npx tsx --test tests/test_generation_job_store.ts tests/test_generation_job_manager.ts tests/test_generation_job_runners.ts tests/test_backend_http_contract.ts tests/test_generation_job_bff_proxy.ts tests/test_generation_job_client.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:contracts`

## Notes

- First-stage separation keeps one repository and two local processes.
- File-backed jobs survive page refresh and browser reconnect, but a backend process restart marks in-flight jobs failed because the in-memory LLM request cannot resume.
- Existing legacy routes remain compatible during migration.
