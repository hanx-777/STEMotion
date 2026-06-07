# STEMotion Round 008 README Validation Pointer

## Goal

- Make the round 007 CI-friendly static smoke command visible from `README.md`.
- Keep the README update short and limited to validation guidance.
- Avoid product behavior changes, dependency changes, package script changes, browser startup, real RAG queries, knowledge ingest, or Deep Interaction generation.

## README Update

The README now exposes `npm run test:static-smoke` in two places:

- `常用脚本`: adds the command and its purpose.
- `测试与验收`: includes the command in the recommended pre-submit checks and explains its boundaries.

The README note states that `npm run test:static-smoke` first runs a build, then executes `tests/test_static_route_contract.ts`. It also records that the command does not start a browser, call real RAG queries, or trigger Deep Interaction generation.

## Command Semantics

`npm run test:static-smoke` expands to:

```bash
npm run build --if-present && tsx --test tests/test_static_route_contract.ts
```

The static route contract checks core refactor milestone routes, legacy redirects, AppShell navigation targets, the RAG-to-Lab local prefill handoff, Lab confirmation behavior, and Next build route artifacts when available.

## Validation Results

| Command | Result |
| --- | --- |
| `npm run test:static-smoke` | Passed; ran Next build and 5 static route contract tests, 0 skipped |
| `npm run lint --if-present` | Passed |
| `npm run typecheck --if-present` | Passed |

The optional direct command `./node_modules/.bin/tsx --test tests/test_static_route_contract.ts` was not repeated because `npm run test:static-smoke` already runs that exact test after build.

## Non-Goals And Protected Behavior

This round did not:

- Modify product pages, route handlers, RAG APIs, Deep Interaction pipeline files, knowledge raw data, model profiles, scripts, or package dependencies.
- Modify `package.json` or `package-lock.json`.
- Start a browser, download browser binaries, start a long-lived server, run `npm install`, call real RAG queries, run knowledge ingest, or trigger Deep Interaction planning/generate/follow-up.
- Deploy, upload, publish, delete, or send external messages.

## Boundary Check

Expected round 008 changes are limited to:

- `README.md`
- `docs/restructure_round008_readme_validation_pointer.md`

Build and test commands can regenerate `next-env.d.ts` and `.stemotion/vector-store/*` timestamp/EOF details. If these appear after validation, they should be treated as validation side effects and restored before final reporting.

## Next Recommendation

After these restructuring checkpoints are reviewed, consider consolidating the round-by-round docs into a short migration summary so maintainers do not need to read every packet report to understand the new route and validation contract.
