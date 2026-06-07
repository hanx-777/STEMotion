# STEMotion Round 005 Smoke Validation

## Validation Target

- Validate the current refactor milestone at build and local page level.
- Covered routes: `/learn`, `/teach`, `/lab`, `/assets`, `/knowledge`, `/settings`, `/deep-interaction`.
- Covered redirects: `/student -> /learn`, `/teacher -> /teach`, `/visualization -> /lab`, `/interactions -> /assets`, `/rag -> /learn`.
- Confirmed RAG-to-Lab bridge remains front-end-only by relying on existing static tests and avoiding RAG/Lab backend generation.

## Commands And Results

| Command | Result |
| --- | --- |
| `./node_modules/.bin/tsx --test tests/test_route_compatibility.ts` | Passed: 4 tests |
| `./node_modules/.bin/tsx --test tests/test_knowledge_health.ts` | Passed: 3 tests |
| `./node_modules/.bin/tsx --test tests/test_rag_lab_bridge.ts` | Passed: 3 tests |
| `npm run lint --if-present` | Passed |
| `npm run typecheck --if-present` | Passed |
| `npm run build --if-present` | Passed |
| `npm run check --if-present` | Passed; repeated lint, typecheck, and build |
| `npm test --if-present` | Passed: 155 tests |

## Build Result

`npm run build --if-present` completed successfully with Next.js 16.2.6 and Turbopack. The route table included the refactor milestone routes:

- `/learn`
- `/teach`
- `/lab`
- `/assets`
- `/knowledge`
- `/settings`
- `/deep-interaction`
- legacy compatibility routes `/student`, `/teacher`, `/visualization`, `/interactions`, and `/rag`

## Local Page Smoke

Started a temporary production server with:

`npm run start -- --port 4175`

Local request results:

| Path | Status | Expected |
| --- | ---: | --- |
| `/learn` | 200 | Page renders |
| `/teach` | 200 | Page renders |
| `/lab` | 200 | Page renders |
| `/assets` | 200 | Page renders |
| `/knowledge` | 200 | Page renders |
| `/settings` | 200 | Page renders |
| `/deep-interaction` | 200 | Compatibility entry remains concrete |
| `/student` | 307, `Location: /learn` | Redirect |
| `/teacher` | 307, `Location: /teach` | Redirect |
| `/visualization` | 307, `Location: /lab` | Redirect |
| `/interactions` | 307, `Location: /assets` | Redirect |
| `/rag` | 307, `Location: /learn` | Redirect |

The temporary server was stopped with Ctrl-C after smoke verification. `lsof -nP -iTCP:4175 -sTCP:LISTEN` returned no listener afterward.

## Optional Browser Smoke

Skipped. `node_modules/.bin/playwright` exists, but the local Chromium binary path reported by Playwright was missing:

`/Users/lxw/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`

No browser download was attempted.

## Issues And Fixes

- No new issue related to rounds 002-004 was found.
- No code fix was required.
- Validation produced transient metadata drift in `next-env.d.ts` and `.stemotion/vector-store/*` timestamps; those validation side effects were restored before final boundary checks.
- No real RAG query, knowledge ingest, Deep Interaction planning/generate/follow-up request, deploy, upload, or external publish was triggered.

## Protected Boundary Check

Final boundary commands:

- `git status --short`: only expected round 002-005 route, navigation, bridge, test, and docs changes remained.
- `git diff --name-status`: only tracked round 002-004 implementation files were listed; new untracked round files are shown by `git status --short`.
- `git diff -- package.json package-lock.json src/app/api src/features/deep-interaction/application src/lib/deep-interaction src/lib/rag skills .stemotion model-profiles.json model-profiles.example.json scripts`: no output.
- `git diff --check`: no output.

Protected areas remained unchanged after restoring validation side effects.

## Next Recommendation

Add one focused automated smoke test that checks the static route and redirect contract after build, without starting a browser or calling backend generation APIs.
