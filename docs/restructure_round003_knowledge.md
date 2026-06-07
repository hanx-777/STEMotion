# STEMotion Round 003 Knowledge Health Report

## Scope

- Added a read-only `/knowledge` surface for local knowledge-base health.
- Added a filesystem-only helper at `src/features/knowledge/knowledgeHealth.ts`.
- Added `知识库` to the main AppShell navigation at `/knowledge`.
- Added focused structure/data tests in `tests/test_knowledge_health.ts`.

## Files Changed

- `src/features/knowledge/knowledgeHealth.ts`
- `src/app/knowledge/page.tsx`
- `src/components/layout/AppShell.tsx`
- `tests/test_knowledge_health.ts`
- `docs/restructure_round003_knowledge.md`

## Knowledge Data Read

The helper reads only local project metadata:

- `skills/*/skill.yaml`
- `skills/*/knowledge_base/sources/`
- `skills/*/knowledge_base/processed/manifest.json`
- `skills/*/knowledge_base/index/`
- `.stemotion/vector-store/*.manifest.json`
- `package.json` scripts for a text-only ingest command example

No ingest, query, build, deploy, dev-server, or external web action was executed.

## Subject Health Snapshot

| Subject | Display Name | Sources | Processed Chunks | Runtime Chunks | Status |
| --- | --- | ---: | ---: | ---: | --- |
| `physics_mechanics` | 大学物理力学 | 17 | 18 | 20 | healthy |
| `advanced_math` | 高等数学 | 9 | 9 | 0 | partial |
| `chemistry` | 大学化学 | 9 | 9 | 0 | partial |
| `computer_science` | 程序设计与数据结构 | 9 | 9 | 0 | partial |

Summary:

- Total subjects: 4
- Total source files: 44
- Total processed chunks: 45
- Total runtime chunks: 20
- Runtime-ready subjects: 1

The partial subjects have static processed manifests and keyword/vector index files, but no `.stemotion/vector-store/<subject>.manifest.json` runtime manifest.

## Validation

Passed:

- `./node_modules/.bin/tsx --test tests/test_knowledge_health.ts`
- `npm run lint --if-present`
- `npm run typecheck --if-present`
- `./node_modules/.bin/tsx --test tests/test_route_compatibility.ts`

Boundary check:

- `git diff -- package.json package-lock.json src/app/api src/features/deep-interaction/application src/lib/deep-interaction src/lib/rag skills .stemotion model-profiles.json model-profiles.example.json scripts`
- Result: no diff output.

## Boundaries Preserved

- No `package.json` or lockfile changes.
- No API route changes.
- No RAG pipeline, retriever, ingest, query, or build script changes.
- No Deep Interaction pipeline changes.
- No knowledge-base source, processed, index, or vector-store data changes.
- No model profile or secret/config reads beyond allowed project metadata.
