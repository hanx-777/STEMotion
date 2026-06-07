# Round 002 LLM Request Parameters

This note records the current LLM request path and parameter policy after the
Round 002 audit. It is intentionally narrow: it does not change runtime behavior,
does not include private model profile values, and does not document secrets.

## Main Path

Current generation calls should flow through one internal path:

`caller -> generateWithConfiguredModel -> resolveLlmRequestConfig / LLM_REQUEST_PRESETS -> provider request builder -> provider client -> safe logging`

Primary callers include:

- v1 RAG ask: `/api/v1/rag/ask` -> `askRagV1` -> `askRag` -> `generateWithConfiguredModel`
- v1 Deep Interaction: `/api/v1/deep-interaction/generate` -> `createDeepInteractionGenerateResponse` -> `runAgentWidgetPipeline` -> `generateWithConfiguredModel`
- RAG visualization: `/api/v1/rag/visualization/generate` -> visualization planning / HTML generation / audit pipeline -> `generateWithConfiguredModel`

## Parameter Source

`src/lib/generation/llmRequestBuilder.ts` is the current source for request
presets:

- `default`, `answer`, `blueprint`, `revision`: `maxTokens=24000`, `stream=true`, `thinking=true`
- `planning`, `reviewer`, `teacherActions`: `maxTokens=16000`, `stream=true`, `thinking=true`
- `artifact`, `repair`: `maxTokens=32768`, `stream=true`, `thinking=true`

The internal field is `maxTokens`. Provider request bodies use provider-native
fields. Anthropic Messages receives `max_tokens`; OpenAI-compatible Chat
Completions receives `max_tokens`.

## Provider Downgrade And Fallback

OpenAI-compatible requests are adapted centrally in `buildOpenAIChatRequest`.
Because that path uses Chat Completions and the current client does not stream,
the provider body is sent with `stream=false` and no `thinking` field. The safe
log payload keeps the compatibility field `downgrade` and adds
`reason=provider_capability_downgrade`.

Anthropic requests keep `stream` and `thinking` when the selected preset enables
them. If the provider or proxy rejects streaming or thinking, fallback retries
are issued by `llmClient.ts` through the same centralized builder. The safe log
payload marks those retries with `requestStage=stream_fallback` or
`requestStage=thinking_fallback` and a matching `reason`.

## 8192 Investigation

Round 002 static search covered source, tests, docs, package metadata, and
`model-profiles.example.json`, excluding dependency/build outputs and private
runtime config. No current source for `maxTokens=8192` was found.

If logs still show `maxTokens=8192`, the most likely causes are:

- a stale dev server or old production build;
- a different branch or older working tree;
- an external proxy or gateway rewriting request metadata;
- a private runtime config not inspected in this round.

Do not inspect private config or API keys to debug this. Prefer reproducing with
a fresh build, current commit, and safe request logs.

## Legacy Classification

- Main API paths: `/api/v1/rag/ask`, `/api/v1/deep-interaction/generate`,
  `/api/v1/rag/visualization/generate`
- Compatibility paths: `/api/rag/ask`, `/api/deep-interaction/generate`
- Older experiment path: `/api/generate`

Round 002 does not delete or migrate those compatibility routes. A later round
can decide whether to document, deprecate, or remove them after UI and user-flow
impact is reviewed.
