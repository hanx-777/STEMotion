# STEMotion Round 007 CI Static Smoke Entry

## Goal

- Provide a minimal CI-friendly entry for the static route contract introduced in round 006.
- Keep the entry fully automated and limited to build artifacts plus the static smoke test.
- Avoid any product behavior change, dependency change, browser startup, long-running server, RAG query, knowledge ingest, or Deep Interaction generation.

## Entry

The package script `test:static-smoke` was added to `package.json`:

```bash
npm run test:static-smoke
```

The command expands to:

```bash
npm run build --if-present && tsx --test tests/test_static_route_contract.ts
```

This keeps the route artifact check meaningful by running `next build` first, then executing the focused static smoke test.

## Covered Contract

`test:static-smoke` covers:

- Core route page files for `/learn`, `/teach`, `/lab`, `/assets`, `/knowledge`, `/settings`, and `/deep-interaction`.
- Legacy redirect files for `/student`, `/teacher`, `/visualization`, `/interactions`, and `/rag`.
- `AppShell` navigation targets for `/learn`, `/teach`, `/lab`, `/assets`, `/knowledge`, and `/settings`.
- RAG-to-Lab local prefill handoff through `sessionStorage` and `/lab?from=rag-bridge`.
- Lab confirmation before `Guided Plan` generation.
- Next build route artifacts when `.next/app-path-routes-manifest.json` or `.next/server/app-paths-manifest.json` is available.

## Non-Goals And Protected Behavior

The command does not:

- Start a browser or download browser binaries.
- Start a long-lived development or production server.
- Run `npm install`.
- Call real RAG query, knowledge ingest, or Deep Interaction planning/generate/follow-up APIs.
- Deploy, upload, publish, delete, or send external messages.

No dependencies, devDependencies, lockfile, RAG API files, Deep Interaction pipeline files, knowledge raw data, scripts directory files, model config, secrets, or environment files were modified.

## CI Usage

In CI, run:

```bash
npm ci
npm run test:static-smoke
```

This assumes dependencies are already installed by CI. The smoke command itself does not install packages and exits automatically.

## Commands And Results

| Command | Result |
| --- | --- |
| `npm run test:static-smoke` | Passed; ran build and 5 static smoke tests |
| `npm run build --if-present` | Passed with Next.js 16.2.6 / Turbopack |
| `./node_modules/.bin/tsx --test tests/test_static_route_contract.ts` | Passed: 5 tests, 0 skipped |
| `./node_modules/.bin/tsx --test tests/test_route_compatibility.ts` | Passed: 4 tests |
| `./node_modules/.bin/tsx --test tests/test_knowledge_health.ts` | Passed: 3 tests |
| `./node_modules/.bin/tsx --test tests/test_rag_lab_bridge.ts` | Passed: 3 tests |
| `npm run lint --if-present` | Passed |
| `npm run typecheck --if-present` | Passed |
| `npm run check --if-present` | Passed; repeated lint, typecheck, and build |
| `npm test --if-present` | Passed: 160 tests |

## Boundary Check

Final boundary checks verify that:

- `package.json` diff is limited to the scripts-field addition for `test:static-smoke`.
- `package-lock.json`, API routes, RAG pipeline files, Deep Interaction pipeline files, skills, `.stemotion`, scripts directory, model config, secrets, and environment files have no diff.
- `git diff --check` has no output.

Build and test commands can regenerate `next-env.d.ts` and `.stemotion/vector-store/*` timestamp/EOF details. These were treated as validation side effects and restored before the final boundary check.

## Next Recommendation

Add one short README validation pointer to `npm run test:static-smoke` if the project wants this command visible outside the restructuring docs.
