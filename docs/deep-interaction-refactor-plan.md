# STEMotion Deep Interaction Refactor Plan

## Current Problems Found

- Deep interaction is not a separate product mode yet. The current app is centered on one `ExperimentConfig` loaded into the main laboratory page.
- Generation is mostly one-shot: `/api/generate` returns a complete result after waiting, so students cannot see planning, outline, schema, validation, or artifact creation progress.
- There is no session/artifact/version model for follow-up learning. A later prompt cannot reliably modify the current generated object while preserving previous versions.
- Coding/online programming still appears in existing widget type definitions and must not be part of STEMotion deep interaction.
- Some Chinese UI text is corrupted and needs to be rewritten with normal Chinese copy.

## OpenMAIC Patterns To Adapt

- Use a staged generation experience with visible progress, outline previews, and action previews.
- Keep generation artifacts separate from transient UI state.
- Use modular Zustand stores for session, progress, artifact, and UI/playback state.
- Use a unified action executor and a small playback state machine.
- Keep follow-up conversation grounded in the current artifact instead of treating every request as a new blank generation.

## Files To Modify

- Add `src/app/deep-interaction/page.tsx` and `src/app/api/deep-interaction/generate/route.ts`.
- Add `src/components/deep-interaction/**` for shell, panels, cards, renderers, and playback controls.
- Add `src/lib/deep-interaction/**` for types, schemas, events, classifier, mock pipeline, validators, renderer registry, follow-up handling, actions, and playback.
- Add stores under `src/lib/stores/interactionSessionStore.ts`, `generationProgressStore.ts`, `artifactStore.ts`, and `deepInteractionUIStore.ts`.
- Update `src/components/layout/AppShell.tsx`, `src/lib/schema/experiment.ts`, selected existing Chinese UI copy, and `README.md`.

## Migration Steps

1. Introduce the four allowed deep interaction types and validators that reject programming modes.
2. Implement the deterministic streaming mock pipeline before any real LLM integration.
3. Add session, progress, artifact, and UI/playback stores.
4. Build the `/deep-interaction` page with visible generation progress and artifact rendering.
5. Implement follow-up versioning and action playback.
6. Remove coding mode from deep interaction surfaces and fix corrupted Chinese text.
7. Run build and lint.

## Risks

- Existing standard experiment widget code still contains legacy iframe capabilities; it should remain isolated from the new deep interaction mode.
- The first version uses client-side state only, so generated sessions are not durable after refresh.
- Mock follow-up behavior is deterministic and limited; real LLM repair/version planning should be added later.
