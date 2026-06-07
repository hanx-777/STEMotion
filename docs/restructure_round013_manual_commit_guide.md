# STEMotion Round 013 Manual Commit Guide

## Goal

This round only creates a manual commit guide. Codex did not run `git add`, `git commit`, or `git push`, and did not modify business code. The commands below are written only for a user to run manually after reviewing the working tree.

## Current Git Status Summary

At the time this guide was created, `git diff --cached --name-status` was empty, so there were no staged files.

Tracked modified files:

| File | Why it belongs in the refactor commit |
| --- | --- |
| `README.md` | Reviewer quick entry, migration summary link, and validation command guidance. |
| `package.json` | Adds the static smoke script entry; no dependency, engine, package manager, or lockfile change. |
| `src/app/interactions/page.tsx` | Legacy `/interactions` compatibility redirect to `/assets`. |
| `src/app/rag/page.tsx` | Legacy `/rag` compatibility redirect to `/learn`. |
| `src/app/student/page.tsx` | Legacy `/student` compatibility redirect to `/learn`. |
| `src/app/teacher/page.tsx` | Legacy `/teacher` compatibility redirect to `/teach`. |
| `src/app/visualization/page.tsx` | Legacy `/visualization` compatibility redirect to `/lab`. |
| `src/components/deep-interaction/DeepInteractionRightPanel.tsx` | Lab-side local RAG prefill consumption with user confirmation before generation. |
| `src/components/layout/AppShell.tsx` | Refactored module navigation and route title mapping. |
| `src/features/rag/ui/SubjectRagConsole.tsx` | RAG-side local handoff into Lab through `sessionStorage`. |

Untracked files currently expected from the refactor rounds:

- `docs/restructure_audit_round001.md`
- `docs/restructure_round002_routes.md`
- `docs/restructure_round003_knowledge.md`
- `docs/restructure_round004_rag_to_lab_bridge.md`
- `docs/restructure_round005_smoke_validation.md`
- `docs/restructure_round006_static_smoke_test.md`
- `docs/restructure_round007_ci_smoke_entry.md`
- `docs/restructure_round008_readme_validation_pointer.md`
- `docs/restructure_migration_summary.md`
- `docs/restructure_round010_readme_migration_link.md`
- `docs/restructure_round011_commit_readiness.md`
- `docs/restructure_round012_commit_plan_dry_run.md`
- `docs/restructure_round013_manual_commit_guide.md`
- `src/app/assets/page.tsx`
- `src/app/knowledge/page.tsx`
- `src/app/lab/page.tsx`
- `src/app/learn/page.tsx`
- `src/app/teach/page.tsx`
- `src/features/assets/ui/AssetsWorkbench.tsx`
- `src/features/deep-interaction/ui/LabSurfacePage.tsx`
- `src/features/knowledge/knowledgeHealth.ts`
- `src/features/rag-lab-bridge/buildLabPrompt.ts`
- `src/features/rag/ui/RagSurfacePage.tsx`
- `tests/test_knowledge_health.ts`
- `tests/test_rag_lab_bridge.ts`
- `tests/test_route_compatibility.ts`
- `tests/test_static_route_contract.ts`

## Recommended Commit Message

```text
refactor: align STEMotion course workflow routes and validation
```

## Recommended Commit Scope

The recommended scope remains the round 011 refactor milestone:

- New product routes: `/learn`, `/teach`, `/lab`, `/assets`, and `/knowledge`.
- Legacy route redirects: `/student`, `/teacher`, `/visualization`, `/interactions`, and `/rag`.
- Shared surfaces for learning, teaching, Lab, assets, RAG, and knowledge health.
- RAG -> Lab local prefill bridge through `sessionStorage`.
- Navigation and README validation/migration pointers.
- Static route, route compatibility, knowledge health, and RAG -> Lab tests.
- Restructure documentation through whichever documentation cutoff the user chooses below.

## Option A: Include Round 012 And Round 013 Docs

Use this option if the final commit should include the dry-run review and this manual guide as part of the audit trail.

These commands are examples for the user to run manually. Codex did not execute them in this round.

```bash
# no-push boundary: this block stages and commits locally only; do not run git push here.
git add README.md package.json \
  docs/restructure_audit_round001.md \
  docs/restructure_round002_routes.md \
  docs/restructure_round003_knowledge.md \
  docs/restructure_round004_rag_to_lab_bridge.md \
  docs/restructure_round005_smoke_validation.md \
  docs/restructure_round006_static_smoke_test.md \
  docs/restructure_round007_ci_smoke_entry.md \
  docs/restructure_round008_readme_validation_pointer.md \
  docs/restructure_migration_summary.md \
  docs/restructure_round010_readme_migration_link.md \
  docs/restructure_round011_commit_readiness.md \
  docs/restructure_round012_commit_plan_dry_run.md \
  docs/restructure_round013_manual_commit_guide.md \
  src/app/assets/page.tsx \
  src/app/knowledge/page.tsx \
  src/app/lab/page.tsx \
  src/app/learn/page.tsx \
  src/app/teach/page.tsx \
  src/app/interactions/page.tsx \
  src/app/rag/page.tsx \
  src/app/student/page.tsx \
  src/app/teacher/page.tsx \
  src/app/visualization/page.tsx \
  src/components/layout/AppShell.tsx \
  src/components/deep-interaction/DeepInteractionRightPanel.tsx \
  src/features/assets/ui/AssetsWorkbench.tsx \
  src/features/deep-interaction/ui/LabSurfacePage.tsx \
  src/features/knowledge/knowledgeHealth.ts \
  src/features/rag-lab-bridge/buildLabPrompt.ts \
  src/features/rag/ui/RagSurfacePage.tsx \
  src/features/rag/ui/SubjectRagConsole.tsx \
  tests/test_knowledge_health.ts \
  tests/test_rag_lab_bridge.ts \
  tests/test_route_compatibility.ts \
  tests/test_static_route_contract.ts

git commit -m "refactor: align STEMotion course workflow routes and validation"
```

## Option B: Exclude Round 012 And Round 013 Docs

Use this option if the final commit should stop at the round 011 commit-readiness record and leave the planning-only round 012/013 documents out of the refactor commit. If the user wants to stop at round 010 instead, also remove `docs/restructure_round011_commit_readiness.md` from this command before running it.

These commands are examples for the user to run manually. Codex did not execute them in this round.

```bash
# no-push boundary: this block stages and commits locally only; do not run git push here.
git add README.md package.json \
  docs/restructure_audit_round001.md \
  docs/restructure_round002_routes.md \
  docs/restructure_round003_knowledge.md \
  docs/restructure_round004_rag_to_lab_bridge.md \
  docs/restructure_round005_smoke_validation.md \
  docs/restructure_round006_static_smoke_test.md \
  docs/restructure_round007_ci_smoke_entry.md \
  docs/restructure_round008_readme_validation_pointer.md \
  docs/restructure_migration_summary.md \
  docs/restructure_round010_readme_migration_link.md \
  docs/restructure_round011_commit_readiness.md \
  src/app/assets/page.tsx \
  src/app/knowledge/page.tsx \
  src/app/lab/page.tsx \
  src/app/learn/page.tsx \
  src/app/teach/page.tsx \
  src/app/interactions/page.tsx \
  src/app/rag/page.tsx \
  src/app/student/page.tsx \
  src/app/teacher/page.tsx \
  src/app/visualization/page.tsx \
  src/components/layout/AppShell.tsx \
  src/components/deep-interaction/DeepInteractionRightPanel.tsx \
  src/features/assets/ui/AssetsWorkbench.tsx \
  src/features/deep-interaction/ui/LabSurfacePage.tsx \
  src/features/knowledge/knowledgeHealth.ts \
  src/features/rag-lab-bridge/buildLabPrompt.ts \
  src/features/rag/ui/RagSurfacePage.tsx \
  src/features/rag/ui/SubjectRagConsole.tsx \
  tests/test_knowledge_health.ts \
  tests/test_rag_lab_bridge.ts \
  tests/test_route_compatibility.ts \
  tests/test_static_route_contract.ts

git commit -m "refactor: align STEMotion course workflow routes and validation"
```

## Final Pre-Commit Checklist

Before running either option, manually confirm:

1. `git diff --cached --name-status` is empty unless the user intentionally staged files before this guide.
2. `git status --short --untracked-files=all` contains only expected refactor files and chosen docs.
3. `git diff -- package.json` is still limited to the `test:static-smoke` script entry.
4. `git diff -- package-lock.json` is empty.
5. `git diff -- package-lock.json src/app/api src/features/deep-interaction/application src/lib/deep-interaction src/lib/rag skills .stemotion model-profiles.json model-profiles.example.json scripts` is empty.
6. `git diff --name-only -- .env .env.local .env.* 2>/dev/null || true` is empty.
7. `git diff --check` has no output.
8. The validation commands below have passed after any final edits.
9. No `git push` is run without a separate explicit instruction.

## Protected Paths To Exclude

Do not stage these paths for this refactor commit unless a later task explicitly authorizes a new scope:

- `.stemotion`
- `next-env.d.ts`
- `package-lock.json`
- `src/app/api`
- `src/features/deep-interaction/application`
- `src/lib/deep-interaction`
- `src/lib/rag`
- `skills`
- `model-profiles.json`
- `model-profiles.example.json`
- `scripts`
- `.env*`, secrets, tokens, cookies

## Validation Results

| Command | Result |
| --- | --- |
| `npm run test` | Passed; 160 tests passed, 0 failed. |
| `npm run lint --if-present` | Passed. |
| `npm run typecheck --if-present` | Passed. |

`npm run test` refreshed `.stemotion/vector-store/physics_mechanics.json` and `.stemotion/vector-store/physics_mechanics.manifest.json` timestamps during validation. Codex identified this as a protected validation side effect and restored both files, including their original no-newline EOF state, before final checks.

## Actions Not Taken

- Did not run `git add`.
- Did not run `git commit`.
- Did not run `git push`.
- Did not start a browser, download a browser, or start a long-lived dev server.
- Did not run real RAG queries, knowledge ingest, Deep Interaction generation, deployment, upload, publish, delete, or external send operations.

## Next Recommendation

Only one minimal next task is recommended: ask the user whether they authorize a local-only staging and commit round, and which documentation option they want included.
