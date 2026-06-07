# STEMotion 重构审计 Round 001

## 审计范围

- 任务包：`STEMotion-refactor-XH202620` / round `001`
- 校验位：`N7q4Zp9Lm2T8rKx`，文件开头与结尾一致
- 实际仓库路径：`/Users/lxw/Documents/STEMotion/stemotion-mvp`
- 任务包目标路径 `/workspace/STEMotion` 不存在；按任务包规则，当前工作目录可唯一定位为 STEMotion 仓库根目录
- 本轮只做读取、验证与文档审计；未修改功能代码，未修改 `package.json`，未安装依赖，未提交 Git

## 项目基本信息

| 项目 | 当前状态 |
| --- | --- |
| 应用框架 | Next.js `16.2.6` App Router，React `19.2.4` |
| 主要源码目录 | `src/app`、`src/components`、`src/features`、`src/lib`、`src/platform`、`src/shared` |
| 本地运行态目录 | `.stemotion/`，当前含 `vector-store/physics_mechanics.*` |
| 学科 Skill 目录 | `skills/{physics_mechanics,advanced_math,chemistry,computer_science}` |
| 配置文件 | `next.config.ts`、`tsconfig.json`、`eslint.config.mjs`、`model-profiles.example.json` |
| 文档目录 | `docs/` 已存在多份架构、评测、演示与计划文档 |

## 当前路由表

### 页面路由

| 路由 | 文件 | 当前功能状态 |
| --- | --- | --- |
| `/` | `src/app/page.tsx` | 重定向到 `/student` |
| `/student` | `src/app/student/page.tsx` | 学生助学，挂载 `RagWorkbench mode="student"` |
| `/teacher` | `src/app/teacher/page.tsx` | 教师助教，挂载 `RagWorkbench mode="teacher"` |
| `/visualization` | `src/app/visualization/page.tsx` | 可视化演示，挂载 `DeepInteractionWorkbench` |
| `/deep-interaction` | `src/app/deep-interaction/page.tsx` | 深度交互底层入口，挂载 `DeepInteractionWorkbench` |
| `/interactions` | `src/app/interactions/page.tsx` | 本地交互库，读取/筛选/打开/删除本地 artifact |
| `/settings` | `src/app/settings/page.tsx` | 模型与 API 设置，挂载 `SettingsWorkbench` |
| `/rag` | `src/app/rag/page.tsx` | 旧链接兼容，重定向到 `/student` |
| `/generate` | `src/app/generate/page.tsx` | 旧链接兼容，重定向到 `/visualization` |
| `/player` | `src/app/player/page.tsx` | 旧链接兼容，重定向到 `/interactions` |
| `/experiments` | `src/app/experiments/page.tsx` | 旧链接兼容，重定向到 `/interactions` |

### API 路由

| 路由 | 文件 | 当前功能状态 |
| --- | --- | --- |
| `/api/v1/rag/ask` | `src/app/api/v1/rag/ask/route.ts` | v1 RAG 问答入口，调用 `askRagV1` |
| `/api/rag/ask` | `src/app/api/rag/ask/route.ts` | 旧 RAG API adapter，调用 `askRagLegacyAdapter` |
| `/api/v1/rag/visualization/generate` | `src/app/api/v1/rag/visualization/generate/route.ts` | RAG 到互动可视化 artifact 的 SSE 生成入口 |
| `/api/v1/deep-interaction/planning` | `src/app/api/v1/deep-interaction/planning/route.ts` | Guided Planning API |
| `/api/v1/deep-interaction/generate` | `src/app/api/v1/deep-interaction/generate/route.ts` | Deep Interaction SSE 生成 API |
| `/api/v1/deep-interaction/follow-up` | `src/app/api/v1/deep-interaction/follow-up/route.ts` | 已生成 HTML 的追问修改 API |
| `/api/deep-interaction/*` | `src/app/api/deep-interaction/*/route.ts` | 旧 deep-interaction API 入口仍保留 |
| `/api/v1/subjects` | `src/app/api/v1/subjects/route.ts` | 学科列表与知识库状态 |
| `/api/subjects` | `src/app/api/subjects/route.ts` | 旧 subjects API adapter |
| `/api/v1/subjects/default` | `src/app/api/v1/subjects/default/route.ts` | 默认学科读取/设置 |
| `/api/v1/model-profiles` | `src/app/api/v1/model-profiles/route.ts` | 模型 profile 读取、保存、切换 |
| `/api/v1/model-profiles/[id]` | `src/app/api/v1/model-profiles/[id]/route.ts` | 模型 profile 删除/单项操作 |
| `/api/v1/model-profiles/models` | `src/app/api/v1/model-profiles/models/route.ts` | 远程模型列表拉取 |
| `/api/model-profiles*` | `src/app/api/model-profiles*/route.ts` | 旧模型设置 API 入口仍保留 |
| `/api/generate` | `src/app/api/generate/route.ts` | 旧生成入口，仍存在 |

## 新旧路由差距表

| 目标新路由 | 当前状态 | 建议兼容关系 | 差距 |
| --- | --- | --- | --- |
| `/learn` | 未找到 | `/student -> /learn` | 当前主学习页仍是 `/student`，`/rag -> /student` 已有 |
| `/teach` | 未找到 | `/teacher -> /teach` | 当前教师页仍是 `/teacher` |
| `/lab` | 未找到 | `/visualization -> /lab` | 当前实验/可视化页仍是 `/visualization` |
| `/assets` | 未找到 | `/interactions -> /assets` | 当前资产库仍命名为 `/interactions` |
| `/knowledge` | 未找到 | 新增知识库健康度页 | 已有数据源，但没有页面路由 |
| `/settings` | 已实现 | 保持 | 可继续作为系统设置页 |
| `/about` | 未找到 | 新增关于页 | `AppShell` 中“关于”链接目前是 `href="#"` |
| `/deep-interaction` | 已实现 | 保留旧入口 | 已作为底层能力入口存在 |

## RAG 现状表

| 审计项 | 状态 | 依据 |
| --- | --- | --- |
| 学生/教师 RAG 页面 | 已实现 | `/student` 和 `/teacher` 均挂载 `RagWorkbench`，模式分别为 `student`、`teacher` |
| 浏览器端 RAG 调用 | 已实现 | `src/features/rag/client/ragClient.ts` 请求 `/api/v1/rag/ask` |
| v1 RAG API | 已实现 | `/api/v1/rag/ask` 调用 `askRagV1`，校验 `question` |
| 旧 RAG API 兼容 | 已实现 | `/api/rag/ask` 经 `askRagLegacyAdapter` 转到 v1 合约 |
| RAG Pipeline | 已实现 | `src/lib/rag/rag_pipeline.ts` 包含学科校验、检索、证据包、引用、回答生成、质量评审、多 Agent 修订、可视化判定 |
| 检索器 | 已实现 | `retriever.ts` 支持 runtime vector-store 与知识库 ingest fallback；`hybrid_retriever.ts` 支持 keyword/vector/hybrid |
| 学科配置 | 已实现 | `SubjectManager` 读取 `skills/*/skill.yaml`、system prompt、answer template、knowledge base |
| `physics_mechanics` | 已实现 | `skills/physics_mechanics/skill.yaml` 与知识库源文件存在；`.stemotion/vector-store/physics_mechanics.manifest.json` 标记 indexed |
| 引用/可追溯输出 | 已实现 | `buildCitations`、`summarizeSources`、`retrieved_chunks`、`evidence_pack`、`citation_refs` 类型与 UI 读取逻辑存在 |
| Web search | 部分实现 | `NoopWebSearchProvider` 默认返回空；`MockWebSearchProvider` 仅 mock；`CustomJsonWebSearchProvider` 需环境变量端点，不能宣传为真实联网 |
| RAG 到 Lab 桥接 | 部分实现 | RAG 页面可触发 `/api/v1/rag/visualization/generate`，并通过 `artifact_ready` 保存；但顶层 `/lab` 路由未实现 |

## Deep Interaction / Lab 现状表

| 审计项 | 状态 | 依据 |
| --- | --- | --- |
| Lab 页面载体 | 部分实现 | `/visualization` 和 `/deep-interaction` 都挂载 `DeepInteractionWorkbench`；目标 `/lab` 未实现 |
| Guided Planning | 已实现 | `runDeepInteractionPlanning` 调用 `runGuidedPlanningAgent`，API 为 `/api/v1/deep-interaction/planning` |
| Template 匹配/定制 | 已实现 | `agentWidgetPipeline.ts` 调用 `findMatchingVerifiedTemplate`、`runTemplateCustomizationAgent` |
| LearningBlueprint | 已实现 | `generateLearningBlueprint`、`validateBlueprintAgainstSchema`、`blueprint_generated` 事件存在 |
| Artifact 生成 | 已实现 | `runAgentWidgetPipeline` 构建 `InteractionArtifact` 并发出 `artifact_ready` |
| 多 Agent evaluator | 已实现 | pedagogy、UX、safety、runtime evaluator 与 judge loop 存在 |
| Repair | 已实现 | `repairArtifact` 与 HTML safety repair 均在 pipeline 中使用 |
| Runtime preview | 已实现 | `ArtifactRenderer` 根据 artifact schema 渲染 HTML widget、RAG visualization、simulation、mind map、3D、game |
| RAG 可视化 artifact | 已实现 | `runRagVisualizationAuditPipeline` 生成 `rag_visualization` artifact，并做 contract/safety/runtime 审计 |
| 保存逻辑 | 已实现 | Deep Interaction UI 在 `artifact_ready` 时写入 `artifactStore` 与 `interactionSessionStore`；RAG 可视化也可手动/自动保存 |

## 教学资产 / 交互库现状表

| 审计项 | 状态 | 依据 |
| --- | --- | --- |
| 本地资产库页面 | 已实现 | `/interactions` 展示、筛选、打开、删除本地 artifact |
| 存储机制 | 已实现 | Zustand persist + localStorage，keys 为 `stemotion-interaction-artifacts` 与 `stemotion-interaction-sessions` |
| 容量修复 | 已实现 | `trimArtifactsByCapacity`、`repairInteractionPersistence`、`persistWithSingleRetry` |
| Artifact 字段 | 部分兼容 | `InteractionArtifact` 已有 `id/sessionId/type/title/description/schema/status/version/createdAt/updatedAt/qualityReport/finalScore/blueprint/templateMetadata/planningMetadata` |
| 目标新增字段兼容 | 部分兼容 | `version/createdAt/updatedAt` 已有；`subject` 在 session 或 blueprint 中，不是 artifact 一等字段；`module/assetType/tags/source/qualityLevel` 未作为 artifact 一等字段 |
| 删除风险 | 可控但需谨慎 | `/interactions` 有删除按钮并调用 store 删除；后续改造需避免迁移时清空 localStorage |

## 知识库健康度可用数据源

| 数据源 | 可读状态 | 可提供的信息 |
| --- | --- | --- |
| `skills/*/skill.yaml` | 可读 | 学科列表、display name、description、检索参数、knowledge_base_path |
| `skills/*/knowledge_base/sources/*` | 可读 | 各学科源文件列表和文件数量 |
| `skills/*/knowledge_base/processed/manifest.json` | 可读 | `built_at`、`source_files`、`total_chunks`、`chunks_by_type`、chunk 配置 |
| `skills/*/knowledge_base/index/{keyword,vector}.json` | 可读 | 静态索引存在性 |
| `.stemotion/vector-store/*.manifest.json` | 部分可读 | runtime ingest 状态；当前只发现 `physics_mechanics.manifest.json` |
| `/api/v1/subjects` | 已实现 | 返回 `knowledge_status`，但当前读取 runtime manifest；没有 `.stemotion` manifest 的学科会显示未索引 |

当前观察到的关键状态：

| 学科 | sources 文件数 | processed manifest | runtime `.stemotion` manifest |
| --- | ---: | --- | --- |
| `physics_mechanics` | 17 | `source_files: 17`，`total_chunks: 18`，`built_at: 2026-05-29T09:27:57.764Z` | indexed，`file_count: 17`，`chunk_count: 20`，`manifest_updated_at: 2026-06-02T10:31:18.482Z` |
| `advanced_math` | 9 | `source_files: 9`，`total_chunks: 9` | 未发现 |
| `chemistry` | 9 | `source_files: 9`，`total_chunks: 9` | 未发现 |
| `computer_science` | 9 | `source_files: 9`，`total_chunks: 9` | 未发现 |

判断：下一轮若做知识库健康度页，适合先做静态+runtime 混合只读页面：静态读取 `skills/*/knowledge_base/processed/manifest.json` 与索引存在性，runtime 状态读取 `.stemotion/vector-store/*.manifest.json`。不要把缺少 runtime manifest 的学科误报为没有知识库。

## npm scripts 与验证结果

### scripts

| script | 命令 | 状态 |
| --- | --- | --- |
| `dev` | `next dev --port 3001` | 存在 |
| `build` | `next build` | 存在 |
| `start` | `next start` | 存在 |
| `lint` | `eslint` | 存在，本轮已运行 |
| `typecheck` | `tsc --noEmit` | 存在，本轮已运行 |
| `check` | `npm run lint && npm run typecheck && npm run build` | 存在，本轮未运行 build |
| `test` | `tsx --test tests/*.ts` | 存在，本轮任务未要求运行 |
| `rag:ingest` | `tsx scripts/ingest_knowledge.ts` | 存在，本轮未运行 |
| `rag:build` | `tsx scripts/build_knowledge.ts` | 存在，本轮未运行 |
| `rag:eval` | `tsx scripts/eval_rag.ts` | 存在，本轮未运行 |
| `rag:migrate` | `tsx scripts/migrate_knowledge_base.ts` | 存在，本轮未运行 |
| `rag:query` | `tsx scripts/test_rag_query.ts` | 存在，本轮未运行 |
| `spike:export-pptx` | `tsx scripts/spike-export-pptx.ts` | 存在，本轮未运行 |

### 本轮命令

| 命令 | 结果 |
| --- | --- |
| `pwd` | `/Users/lxw/Documents/STEMotion/stemotion-mvp` |
| `ls -la` | 仓库根目录可读，存在 `package.json`、`src/app`、`docs`、`skills`、`.stemotion` |
| `test -d /workspace/STEMotion` | `missing` |
| `rg --files ...` / `find ...` | 完成路由、源码、docs、scripts、skills、vector-store 读取 |
| `npm run lint --if-present` | 通过，exit code 0 |
| `npm run typecheck --if-present` | 通过，exit code 0 |
| `git status --short` | 运行前输出为空，工作树干净 |

## 风险与阻塞

- `/workspace/STEMotion` 不存在，但当前工作目录可唯一定位为实际仓库；不是阻塞。
- 新产品一级路由 `/learn`、`/teach`、`/lab`、`/assets`、`/knowledge`、`/about` 尚未建立，当前仍以旧路由为主。
- `AppShell` 的“关于”入口是 `href="#"`，没有真实 `/about` 页面。
- Web search 默认是 noop；mock provider 只应标记为 mock，不能宣传为真实联网。
- `.stemotion/vector-store` 目前只发现 `physics_mechanics` runtime manifest；其他学科虽然有 processed/index 文件，但 API health 若只读 runtime manifest 会显示未索引。
- 资产库 schema 对未来 `subject/module/assetType/tags/source/qualityLevel` 的兼容不完整，迁移时需避免破坏现有 localStorage 数据。
- `model-profiles.json` 和 `.env.local` 可能含密钥；本轮没有读取或输出其中内容。

## 下一轮建议

只推荐 1 个最小闭环任务：先做“新旧页面路由兼容层”。

建议内容：

1. 新增 `/learn`、`/teach`、`/lab`、`/assets` 页面，分别复用当前 `/student`、`/teacher`、`/visualization`、`/interactions` 的现有 workbench，不改 RAG API、不改 Deep Interaction pipeline。
2. 将旧页面 `/student`、`/teacher`、`/visualization`、`/interactions` 改为 redirect 到新路由，保留 `/rag`、`/generate`、`/player`、`/experiments` 的兼容跳转链。
3. 更新 `AppShell` 导航 href 到新路由，并保留 `/deep-interaction` 底层入口不进主导航。
4. 验证 `npm run lint --if-present`、`npm run typecheck --if-present`，并手动检查 route redirect 不循环。

这个任务最小、低风险、可验收，并能先让产品一级模块命名与重构方案对齐，为后续 `/knowledge` 健康度页和 `/about` 页留出清晰入口。
