# STEMotion Round 006 Upgrade Acceptance

This document is the maintainer-facing handoff for the `stemotion-full-upgrade`
Round 001-006 work. It consolidates the current architecture, LLM request
policy, artifact generation design contract, reviewer quality checks, frontend
layout regression coverage, legacy API classification, validation commands, and
known maintenance risks.

It intentionally does not contain private model profiles, API keys, tokens,
cookies, environment values, browser credentials, or copied external design
system prompt text. The design guidance here is written as STEMotion's own
engineering standard.

## Root And Scope

- Project root: `/Users/lxw/Documents/STEMotion/stemotion-mvp`
- Framework: Next.js `16.2.6` App Router with React `19.2.4`.
- Local instruction files read for this round: `AGENTS.md`, `CLAUDE.md`, and
  local Next docs under `node_modules/next/dist/docs/`.
- Round 006 allowed file scope: documentation, README entry, and low-risk
  `package.json` scripts only.
- Round 006 excluded scope: core API behavior, prompt runtime behavior,
  reviewer runtime behavior, UI structure, CI config, screenshot baselines,
  binary artifacts, private config, and real external LLM calls.

## Architecture Summary

STEMotion is currently a modular Next.js application:

- `src/app`: App Router pages and route handlers.
- `src/features`: user-facing product modules and application services.
- `src/components`: shared UI, layout shell, deep-interaction renderers, and
  visualization renderers.
- `src/lib/generation`: model profiles, centralized LLM request construction,
  prompt templates, and shared artifact design contract.
- `src/lib/deep-interaction`: guided planning, artifact generation, follow-up,
  evaluator, judge, repair, and widget prompt runtime support.
- `src/lib/rag`: subject RAG pipeline, reviewers, evidence handling, and
  visualization generation/audit pipeline.
- `src/platform` and `src/shared`: platform and cross-feature helpers.
- `skills/*`: subject skill configs, system prompts, answer templates, and
  knowledge-base inputs.
- `tests`: Node test runner suites for API contracts, prompt contracts,
  reviewer behavior, RAG visualization, layout viewports, route compatibility,
  and static smoke checks.

The product-facing routes are `/learn`, `/teach`, `/lab`, `/assets`,
`/knowledge`, and `/settings`. `/deep-interaction` remains a concrete advanced
entry. Legacy product routes redirect to the new surfaces.

## LLM Flow Summary

Current generation should follow one internal request path:

`caller -> generateWithConfiguredModel -> resolveLlmRequestConfig / LLM_REQUEST_PRESETS -> provider request builder -> provider client -> safe logging`

Important implementation points:

- `src/lib/generation/llmRequestBuilder.ts` owns the internal `maxTokens`,
  `stream`, `thinking`, and `thinkingBudgetTokens` presets.
- Internal callers use `maxTokens`; provider adapters convert to provider-native
  `max_tokens` in one place.
- OpenAI-compatible Chat Completions requests are centrally downgraded to
  `stream=false` and no `thinking` field because that client path does not
  currently stream.
- Anthropic Messages requests keep `stream` and `thinking` when supported.
  Fallback retries are marked with `stream_fallback` or `thinking_fallback`.
- Safe log payloads record normalized and provider field names without printing
  secrets.
- The prior `maxTokens=8192` issue has no current source in the inspected code
  path; likely causes are stale builds, different branches, gateway rewriting,
  or private runtime configuration that should not be inspected.

Targeted coverage:

- `tests/test_llm_request_builder.ts`
- `docs/llm_request_parameters_round002.md`

## Artifact Generation Summary

STEMotion uses a shared artifact design contract instead of copying an external
design prompt into product code. The shared contract lives in
`src/lib/generation/artifactDesignContract.ts` and requires:

- output-shape awareness for the actual educational artifact;
- first-screen usability at `1366x768`, `1440x900`, and `1920x1080`;
- main-stage-first desktop layout around `65%-75%` main area and `25%-35%`
  supporting area;
- mobile fallback near `375px` without overlap or horizontal scrolling;
- controlled scrolling, preferably one secondary scroll panel;
- compact controls with readable labels and practical hit targets;
- stable visual hierarchy and no generic hero/filler content;
- reuse of subject, variables, formulas, widget config, and stable selectors.

The contract is reused by:

- legacy widget prompt templates;
- deep-interaction widget pipeline;
- RAG lightweight HTML generation;
- RAG audited widget generation;
- follow-up refinement prompts.

Targeted coverage:

- `tests/test_prompt_contracts.ts`
- `tests/test_visualization_html_generator.ts`
- `tests/test_rag_visualization_audit_pipeline.ts`

## Reviewer Quality Summary

STEMotion separates answer-quality review from artifact UI review:

- RAG answer reviewers cover evidence, citation grounding, formula
  renderability, physics reasoning, pedagogy, numerical checks, and safety.
- Artifact UI reviewers cover visual quality, interaction quality, layout
  quality, accessibility basics, first-screen usability, main-stage/sidebar
  ratio, responsive behavior, nested scrolling, hit targets, and anti-filler.

The shared design-review rubric lives in
`src/lib/deep-interaction/agents/designReviewRubric.ts`. It classifies serious
UI layout failures as blockers and asks repair agents for concrete HTML/CSS/JS
fixes rather than vague feedback.

Targeted coverage:

- `tests/test_deep_interaction_design_review.ts`
- `tests/test_prompt_contracts.ts`
- `tests/test_rag_visualization_audit_pipeline.ts`

## Frontend Layout Summary

Round 005 converted layout concerns into regression checks:

- Deep Interaction `/lab` keeps the artifact stage dominant on desktop.
- Deep Interaction right panel is constrained and mobile generator content
  collapses when an artifact exists.
- HTML widget and RAG visualization stages have stable first-screen heights.
- RAG visualization is promoted above the answer grid in `/learn` when a saved
  visualization exists.
- RAG explanation/support panels are kept secondary, stack below on mobile, and
  avoid adding another vertical scroller.

The Edge viewport test covers:

- `1366x768`
- `1440x900`
- `1920x1080`
- `375x812`

It checks first-screen visibility, main-stage/right-panel ratios, mobile
obstruction, nested-scroll discipline, console/page errors, and failed network
responses for seeded `/lab` and `/learn` sessions.

Targeted coverage:

- `tests/test_layout_viewports.ts`
- `tests/test_rag_visualization_layout.ts`

## Legacy API And Route Summary

Main API paths:

- `/api/v1/rag/ask`
- `/api/v1/deep-interaction/generate`
- `/api/v1/rag/visualization/generate`

Compatibility paths:

- `/api/rag/ask`
- `/api/deep-interaction/generate`

Older experiment path:

- `/api/generate`

Route compatibility:

- `/student` -> `/learn`
- `/teacher` -> `/teach`
- `/visualization` -> `/lab`
- `/interactions` -> `/assets`
- `/rag` -> `/learn`

The compatibility paths are documented and tested, not removed in this upgrade.
Future removal should be a separate decision because it changes public behavior.

Targeted coverage:

- `tests/test_api_v1_contracts.ts`
- `tests/test_route_compatibility.ts`
- `tests/test_static_route_contract.ts`

## Validation Matrix

| Area | Command | Coverage | Prerequisites | Notes |
| --- | --- | --- | --- | --- |
| LLM request builder | `npx tsx --test tests/test_llm_request_builder.ts` | Presets, provider conversion, fallback log payloads, `8192` guard | Node deps installed | Does not call external LLM |
| Prompt contracts | `npx tsx --test tests/test_prompt_contracts.ts` | Artifact design contract reuse and no forbidden source/tool text | Node deps installed | Static/source-level |
| Visualization generator | `npx tsx --test tests/test_visualization_html_generator.ts` | RAG HTML generation contract and max token behavior | Node deps installed | Mocked/local only |
| Reviewer design quality | `npx tsx --test tests/test_deep_interaction_design_review.ts` | Design blocker detection and repair instruction quality | Node deps installed | Static/unit-level |
| RAG visualization audit | `npx tsx --test tests/test_rag_visualization_audit_pipeline.ts` | RAG widget audit and design-quality review chain | Node deps installed | Mocked/local only |
| RAG visualization layout | `npx tsx --test tests/test_rag_visualization_layout.ts` | Static renderer layout contract and 74/26 split | Node deps installed | No browser required |
| API/route contracts | `npx tsx --test tests/test_api_v1_contracts.ts tests/test_route_compatibility.ts tests/test_static_route_contract.ts` | v1 API mapping, route redirects, static route contract | Node deps installed; build artifact optional for the final static route subtest | Static route test skips build artifact check if no manifest exists |
| Contract bundle | `npm run test:contracts` | Round 002-004 contracts plus route/static layout contracts | Node deps installed | No external LLM; no browser viewport run |
| Edge viewport layout | `npm run test:layout` | Round 005 `/lab` and `/learn` first-screen, ratio, scroll, mobile, and error checks | Microsoft Edge installed and Playwright can launch `msedge`; local Next dev server can bind a free port | Starts/stops a local dev server |
| TypeScript | `npm run typecheck` | Type correctness | Node deps installed | May update local TS build cache depending on config |
| Lint | `npm run lint` | ESLint and Next lint rules | Node deps installed | Uses project ESLint config |
| Build | `npm run build` | Production Next build and route compilation | Node deps installed; build environment can write `.next` | Report failures honestly; do not treat environment failures as passed |
| Core aggregate | `npm run check:core` | `test:contracts`, typecheck, lint | Node deps installed | No Edge viewport requirement |
| Full local aggregate | `npm run check:all` | `check:core`, `test:layout`, build | Node deps installed, Edge/Playwright available, build environment healthy | Useful before commit or release |

## Round 006 Local Validation Snapshot

These commands were run locally during Round 006 on 2026-06-07:

| Command | Result | Notes |
| --- | --- | --- |
| `npm run test:contracts` | pass | 41 Node test-runner tests passed; no external LLM call |
| `npm run test:layout` | pass | Edge viewport test passed for `/lab` and `/learn` across four viewport sizes |
| `npm run typecheck` | pass | `tsc --noEmit` completed |
| `npm run lint` | pass | ESLint completed |
| `npm run build` | pass | Next production build completed and listed current static/dynamic routes |
| `npm run check:all` | pass | Aggregate `test:contracts`, typecheck, lint, Edge layout test, and build completed |

An earlier aggregate run hit a transient saved-session wait timeout inside
`test:layout`. A standalone rerun and the final full aggregate rerun both
passed without changing product runtime code. Treat future layout timeouts as a
test-environment or hydration-timing issue to triage, not as an automatic pass.

## Round 001-006 Summary

- Round 001/001R: audited the actual root, mapped LLM request chains, prompt
  generation, reviewers, frontend layout risks, and upgrade roadmap.
- Round 002: centralized LLM request presets and provider request building;
  documented stream/thinking/maxTokens policy and legacy API classification.
- Round 003: moved design principles into STEMotion's artifact prompt system
  through a shared contract and prompt tests.
- Round 004: upgraded reviewer and repair logic so UI design quality can block
  acceptance and generate concrete fixes.
- Round 005: improved `/lab` and `/learn` layout behavior and added Edge
  viewport regression coverage.
- Round 006: consolidates documentation, validation commands, and final
  acceptance guidance without changing product runtime behavior.

## Claude Design Final Audit

| Standard | Current status | Evidence |
| --- | --- | --- |
| Design context reuse | pass | Shared contract requires subject, variables, formulas, widget config, and stable selectors to be reused |
| First-screen usability | pass for tested surfaces, partial for untested future generated artifacts | Round 005 viewport tests cover `/lab` and `/learn`; future generated HTML remains model-dependent |
| Main-stage ratio | pass for tested surfaces | Static RAG renderer test and Edge layout test enforce dominant stage width |
| Right panel balance | pass for tested surfaces | Deep Interaction and RAG support panels are constrained in code and tests |
| Responsive mobile | pass for tested surfaces | `375x812` viewport test checks stacking and obstruction |
| Scroll discipline | pass for tested surfaces | Viewport tests check panel overflow and avoid nested stage scrolling |
| Control density and hit targets | partial | Prompt/reviewer contracts include hit-target requirements; generated model output still needs ongoing review |
| Anti-filler | pass in contracts, partial in arbitrary generated output | Prompt contract and reviewer tests reject generic hero/filler patterns |
| Reviewer design quality | pass | Design rubric and judge tests classify serious UI issues as blockers |
| Screenshot or viewport regression | pass for viewport assertions, partial for saved screenshot baselines | `test:layout` asserts browser geometry but does not save screenshot baselines |
| Documentation and maintenance | pass after this document and README entry | This document and package scripts provide the maintainer entry point |

## Verdict Guidance

Do not describe the project as perfect. A fair final verdict should be
`mostly_passed_with_remaining_issues` unless all local validation passes and a
human visual review finds no meaningful remaining usability issues.

Known remaining issues:

- The repository has a large pre-existing dirty worktree from prior rounds.
- Future generated artifacts can still fail design quality despite improved
  prompts and reviewers.
- `test:layout` and `check:all` depend on a local Edge/Playwright environment.
- Full build can fail for environment or Next/cache reasons; failures must be
  triaged rather than reported as passing.
- Compatibility APIs and routes remain intentionally present.

Maintenance recommendations:

- Keep `src/lib/generation/llmRequestBuilder.ts` as the single source for LLM
  request parameters.
- Add prompt/reviewer tests whenever the artifact contract changes.
- Run `npm run check:core` for fast local confidence before smaller commits.
- Run `npm run check:all` before releases or broad review when Edge and build
  prerequisites are available.
- Keep compatibility route/API removal as a separate, explicit migration task.
- Before committing, review the dirty worktree by scope and avoid mixing
  unrelated generated/runtime artifacts with source changes.
