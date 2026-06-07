# STEMotion Round 006 Static Smoke Test

## Goal

- Add one automated static smoke test for the refactor milestone from rounds 002-005.
- Convert the round 005 manual route smoke into a repeatable test that does not start a browser, a long-lived server, or any backend generation flow.
- Keep the test focused on source and build artifacts only.

## Static Route Contract Coverage

The new test file is `tests/test_static_route_contract.ts`.

It verifies:

- Core page files exist for `/learn`, `/teach`, `/lab`, `/assets`, `/knowledge`, `/settings`, and `/deep-interaction`.
- Legacy routes statically redirect to the new routes:
  - `/student -> /learn`
  - `/teacher -> /teach`
  - `/visualization -> /lab`
  - `/interactions -> /assets`
  - `/rag -> /learn`
- `src/components/layout/AppShell.tsx` still links to `/learn`, `/teach`, `/lab`, `/assets`, `/knowledge`, and `/settings`.
- The RAG-to-Lab bridge still uses local front-end prefill state:
  - `RAG_TO_LAB_PREFILL_KEY`
  - `/lab?from=rag-bridge`
  - `sessionStorage.setItem`
  - `sessionStorage.getItem`
  - `sessionStorage.removeItem`
  - the Lab confirmation notice containing `请确认后再生成 Guided Plan`
- The Lab prefill branch does not auto-call `onGenerate` or the Deep Interaction generation API within the checked local prefill branch.

## Why No Browser Or Backend API

This round is intended to lock down the routing and bridge contract without expanding the product surface. Browser startup, real RAG queries, knowledge ingest, Deep Interaction planning/generate/follow-up calls, deploys, uploads, and external publishing were outside scope and were not triggered.

## Build Artifact Check

`npm run build --if-present` completed successfully with Next.js 16.2.6 and Turbopack.

After the build, `.next/app-path-routes-manifest.json` and `.next/server/app-paths-manifest.json` were present. The new static smoke test reads `.next/app-path-routes-manifest.json` first and confirms that the build artifact includes the core milestone routes and legacy redirect route entries. If neither stable manifest exists in a future Next artifact shape, the artifact portion gracefully skips with a message instead of failing on a brittle path assumption.

## Commands And Results

| Command | Result |
| --- | --- |
| `npm run build --if-present` | Passed; route table included `/learn`, `/teach`, `/lab`, `/assets`, `/knowledge`, `/settings`, `/deep-interaction`, and the legacy compatibility routes |
| `./node_modules/.bin/tsx --test tests/test_static_route_contract.ts` | Passed: 5 tests; build artifact check enabled, 0 skipped |
| `./node_modules/.bin/tsx --test tests/test_route_compatibility.ts` | Passed: 4 tests |
| `./node_modules/.bin/tsx --test tests/test_knowledge_health.ts` | Passed: 3 tests |
| `./node_modules/.bin/tsx --test tests/test_rag_lab_bridge.ts` | Passed: 3 tests |
| `npm run lint --if-present` | Passed |
| `npm run typecheck --if-present` | Passed |
| `npm run check --if-present` | Passed; repeated lint, typecheck, and build |
| `npm test --if-present` | Passed: 160 tests |

## Protected Boundary Check

Final boundary commands:

- `git status --short`: only expected round 002-006 route, navigation, bridge, test, and docs changes remained.
- `git diff --name-status`: tracked changes were limited to prior route redirect, navigation, and RAG-to-Lab bridge files; new round docs/tests are untracked as expected.
- `git diff -- package.json package-lock.json src/app/api src/features/deep-interaction/application src/lib/deep-interaction src/lib/rag skills .stemotion model-profiles.json model-profiles.example.json scripts`: no output after restoring validation side effects.
- `git diff --check`: no output.

Validation produced transient changes in `next-env.d.ts` and `.stemotion/vector-store/*` timestamps/EOF shape. These were identified as build/test side effects and restored before the final boundary check.

No package dependencies, RAG API files, Deep Interaction pipeline files, knowledge raw data, scripts, model config, secrets, or environment files were modified.

## Next Recommendation

Add one minimal CI-friendly command or documented checklist entry that runs the existing static smoke test after `npm run build`, without changing product behavior.
