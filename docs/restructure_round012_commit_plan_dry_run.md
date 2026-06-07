# STEMotion Round 012 Commit Plan Dry Run

## Goal

This round only reviews the proposed commit plan. It does not run `git add`, `git commit`, or `git push`, and it does not change business code. The purpose is to make the recommended commit scope, exclusions, and human confirmation points explicit before any staging action.

## Round 011 Commit Message

Recommended commit message from `docs/restructure_round011_commit_readiness.md`:

```text
refactor: align STEMotion course workflow routes and validation
```

## Current Git Status Summary

Before this dry-run document was added, current repo changes matched the round 011 audit:

| State | Count | Summary |
| --- | ---: | --- |
| Tracked modified files | 10 | `README.md`, `package.json`, legacy route pages, `AppShell`, RAG UI bridge consumers |
| Untracked docs | 11 | Round 001-011 restructure records and migration summary |
| Untracked app/feature/test files | 19 | New module routes, knowledge health, RAG -> Lab bridge helpers, tests |
| Staged files | 0 | `git diff --cached --name-status` was empty |

After this round, the only additional expected file is `docs/restructure_round012_commit_plan_dry_run.md`.

## Dry-Run File Comparison

| File | Round 011 recommended | Currently present | Dry-run recommendation | Notes |
| --- | --- | --- | --- | --- |
| `README.md` | Yes | Modified | Include | Reviewer migration link and validation commands. |
| `package.json` | Yes | Modified | Include | Diff is limited to `scripts.test:static-smoke`. |
| `docs/restructure_audit_round001.md` | Yes | Untracked | Include | Initial repo audit record. |
| `docs/restructure_round002_routes.md` | Yes | Untracked | Include | Route compatibility record. |
| `docs/restructure_round003_knowledge.md` | Yes | Untracked | Include | Knowledge health record. |
| `docs/restructure_round004_rag_to_lab_bridge.md` | Yes | Untracked | Include | RAG -> Lab bridge record. |
| `docs/restructure_round005_smoke_validation.md` | Yes | Untracked | Include | Local smoke validation record. |
| `docs/restructure_round006_static_smoke_test.md` | Yes | Untracked | Include | Static smoke contract record. |
| `docs/restructure_round007_ci_smoke_entry.md` | Yes | Untracked | Include | Test script entry record. |
| `docs/restructure_round008_readme_validation_pointer.md` | Yes | Untracked | Include | README validation pointer record. |
| `docs/restructure_migration_summary.md` | Yes | Untracked | Include | Reviewer-facing migration summary. |
| `docs/restructure_round010_readme_migration_link.md` | Yes | Untracked | Include | README migration link record. |
| `docs/restructure_round011_commit_readiness.md` | Yes | Untracked | Include | Commit readiness audit. |
| `docs/restructure_round012_commit_plan_dry_run.md` | No, created this round | Untracked after this round | Include only if user wants the final dry-run record in the same commit | This is the only file not listed in round 011 because it did not exist yet. |
| `src/app/assets/page.tsx` | Yes | Untracked | Include | New Assets route. |
| `src/app/knowledge/page.tsx` | Yes | Untracked | Include | Read-only knowledge health route. |
| `src/app/lab/page.tsx` | Yes | Untracked | Include | New Lab route. |
| `src/app/learn/page.tsx` | Yes | Untracked | Include | New student learning route. |
| `src/app/teach/page.tsx` | Yes | Untracked | Include | New teacher teaching route. |
| `src/app/interactions/page.tsx` | Yes | Modified | Include | Legacy redirect to `/assets`. |
| `src/app/rag/page.tsx` | Yes | Modified | Include | Legacy redirect to `/learn`. |
| `src/app/student/page.tsx` | Yes | Modified | Include | Legacy redirect to `/learn`. |
| `src/app/teacher/page.tsx` | Yes | Modified | Include | Legacy redirect to `/teach`. |
| `src/app/visualization/page.tsx` | Yes | Modified | Include | Legacy redirect to `/lab`. |
| `src/components/layout/AppShell.tsx` | Yes | Modified | Include | Refactored navigation. |
| `src/components/deep-interaction/DeepInteractionRightPanel.tsx` | Yes | Modified | Include | Lab-side RAG prefill consumption. |
| `src/features/assets/ui/AssetsWorkbench.tsx` | Yes | Untracked | Include | Assets workbench surface. |
| `src/features/deep-interaction/ui/LabSurfacePage.tsx` | Yes | Untracked | Include | Lab wrapper surface. |
| `src/features/knowledge/knowledgeHealth.ts` | Yes | Untracked | Include | Knowledge health reader. |
| `src/features/rag-lab-bridge/buildLabPrompt.ts` | Yes | Untracked | Include | Local RAG -> Lab prompt builder. |
| `src/features/rag/ui/RagSurfacePage.tsx` | Yes | Untracked | Include | RAG wrapper surface. |
| `src/features/rag/ui/SubjectRagConsole.tsx` | Yes | Modified | Include | RAG-side local prefill handoff. |
| `tests/test_knowledge_health.ts` | Yes | Untracked | Include | Knowledge health contract. |
| `tests/test_rag_lab_bridge.ts` | Yes | Untracked | Include | RAG -> Lab bridge contract. |
| `tests/test_route_compatibility.ts` | Yes | Untracked | Include | New and legacy route contract. |
| `tests/test_static_route_contract.ts` | Yes | Untracked | Include | Static route smoke contract. |

No round 011 recommended file was missing or unchanged in the current status snapshot.

## Not Recommended Or Needs Confirmation

| File or Scope | Decision | Reason |
| --- | --- | --- |
| `docs/restructure_round012_commit_plan_dry_run.md` | Needs user confirmation | It is useful as the final dry-run record, but it was created after the round 011 recommended list. |
| `next-env.d.ts` | Do not include | `next build` temporarily changed it from `.next/dev/types/routes.d.ts` to `.next/types/routes.d.ts`; this verification side effect was restored. |
| `.stemotion/*` | Do not include | Protected runtime/vector-store area; final protected diff is empty. |
| `package-lock.json` | Do not include | No dependency or lockfile change is expected. |
| `src/app/api` | Do not include | API route changes are outside this refactor commit. |
| `src/features/deep-interaction/application` | Do not include | Deep Interaction pipeline changes are outside scope. |
| `src/lib/deep-interaction` | Do not include | Core Deep Interaction library changes are outside scope. |
| `src/lib/rag` | Do not include | RAG pipeline changes are outside scope. |
| `skills` | Do not include | Knowledge source and skill content changes are outside scope. |
| `model-profiles.json`, `model-profiles.example.json` | Do not include | Model configuration changes are outside scope. |
| `scripts` | Do not include | Ingest/build script changes are outside scope. |
| `.env*`, secrets, tokens, cookies | Do not include | Sensitive or environment-local data must not be committed. |

## Protected Boundary Recheck

| Check | Result |
| --- | --- |
| `git diff -- package-lock.json src/app/api src/features/deep-interaction/application src/lib/deep-interaction src/lib/rag skills .stemotion model-profiles.json model-profiles.example.json scripts` | Empty |
| `git diff --name-only -- .env .env.local .env.* 2>/dev/null || true` | Empty |
| `git diff --check` | Passed with no output |
| `git diff -- next-env.d.ts .stemotion` after restoring build side effect | Empty |
| `git diff --cached --name-status` | Empty; no staged files |

## Package And README Recheck

`package.json` diff is still limited to this script entry:

```json
"test:static-smoke": "npm run build --if-present && tsx --test tests/test_static_route_contract.ts"
```

There are no `dependencies`, `devDependencies`, `packageManager`, `engines`, or `package-lock.json` changes.

README contains:

| Evidence | Location |
| --- | --- |
| `docs/restructure_migration_summary.md` | Top reviewer quick entry |
| `npm run test:static-smoke` | Common scripts and validation sections |
| `npm test` | Test and acceptance section |

README also states that static smoke does not start a browser, call real RAG queries, or trigger Deep Interaction generation.

## Validation Results

| Command | Result |
| --- | --- |
| `npm run test:static-smoke` | Passed; `next build` completed and 5 static route contract tests passed |
| `npm run lint --if-present` | Passed |
| `npm run typecheck --if-present` | Passed |
| `npm test` | Not run this round; round 011 already ran the full suite with 160 passed, 0 failed, and round 012 intentionally used the lighter smoke/lint/typecheck path requested by the task |

`npm run test:static-smoke` caused a temporary `next-env.d.ts` route type import change. That was identified as a generated verification side effect and restored before final checks.

## Human Confirmation Checklist

Before authorizing any staging or commit, the user should confirm:

1. Include the full recommended route/navigation/RAG bridge/knowledge/test/doc scope listed above.
2. Include `docs/restructure_round012_commit_plan_dry_run.md` as the final dry-run record, or leave it for a later documentation commit.
3. Use the commit message `refactor: align STEMotion course workflow routes and validation`.
4. Keep all protected boundaries excluded: `.stemotion`, `next-env.d.ts`, API routes, RAG pipeline, Deep Interaction pipeline, skills, model configs, scripts, lockfile, and `.env*`.
5. Proceed only with local staging/commit if explicitly authorized; no `git push` without a separate instruction.

## Actions Not Taken

- Did not run `git add`.
- Did not run `git commit`.
- Did not run `git push`.
- Did not start a browser or long-lived dev server.
- Did not run real RAG queries, knowledge ingest, Deep Interaction generation, deployment, upload, publish, delete, or external send operations.

## Next Recommendation

Only one minimal next task is recommended: ask the user whether to authorize a local-only staging and commit round, with `git push` still explicitly out of scope.
