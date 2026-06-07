# STEMotion Round 004: RAG to Lab Bridge

## Scope

This round adds a minimal front-end bridge from the `/learn` and `/teach` RAG answer surfaces to `/lab`.

The bridge only transfers a generated prompt string through `sessionStorage`. It does not transfer the raw RAG result object, call planning or generation APIs, change RAG retrieval, change Deep Interaction generation, modify knowledge data, or alter model configuration.

## User Flow

1. A learner or teacher completes a valid RAG answer on `/learn` or `/teach`.
2. The answer panel shows a `生成交互实验` action.
3. Clicking the action builds a Chinese Lab prompt from:
   - current question
   - answer summary
   - subject and mode
   - provided citations and retrieved chunks when present
4. The prompt is saved under `stemotion.ragLabBridge.prefillPrompt`.
5. The app navigates to `/lab?from=rag-bridge`.
6. The Lab prompt panel reads the prefill once, removes it from `sessionStorage`, fills the prompt input, and shows:
   `已从 RAG 回答带入实验 prompt，请确认后再生成 Guided Plan`
7. The user must explicitly submit the prompt before Guided Planning or generation starts.

## Implementation

- Added `src/features/rag-lab-bridge/buildLabPrompt.ts`
  - Exports `RAG_TO_LAB_PREFILL_KEY`.
  - Exports `RAG_TO_LAB_ROUTE`.
  - Exports `buildLabPromptFromRagResult(input)`.
  - Handles student and teacher wording separately.
  - Uses a no-source notice when no citations or chunks are provided.
- Updated `src/features/rag/ui/SubjectRagConsole.tsx`
  - Adds the completed-answer bridge action.
  - Writes only the generated prompt string to local browser state.
  - Navigates with App Router `useRouter` and the fixed bridge route.
- Updated `src/components/deep-interaction/DeepInteractionRightPanel.tsx`
  - Reads the prefill prompt once from `sessionStorage`.
  - Shows a lightweight notice.
  - Does not call planning, generate, or follow-up APIs from the prefill effect.
- Added `tests/test_rag_lab_bridge.ts`
  - Covers student and teacher prompt wording.
  - Verifies no fake source references are created when no sources are supplied.
  - Statically checks the RAG and Lab UI bridge wiring.

## Boundary Notes

Protected areas were not modified:

- `src/app/api`
- `src/features/deep-interaction/application`
- `src/lib/deep-interaction`
- `src/lib/rag`
- `skills`
- `.stemotion`
- `model-profiles.json`
- `model-profiles.example.json`
- `scripts`
- dependency manifests

## Validation

Required validation commands for this round:

- `./node_modules/.bin/tsx --test tests/test_rag_lab_bridge.ts`
- `./node_modules/.bin/tsx --test tests/test_route_compatibility.ts`
- `./node_modules/.bin/tsx --test tests/test_knowledge_health.ts`
- `npm run lint --if-present`
- `npm run typecheck --if-present`
- `git status --short`
- `git diff --name-status`
- boundary diff check against protected paths
