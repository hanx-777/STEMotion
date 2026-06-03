# STEMotion 代码审计与清理报告

## 审计范围

- 前端路由：`src/app/`
- RAG 功能：`src/features/rag/`、`src/lib/rag/`
- 学科 Skill：`skills/*`
- 可视化系统：`src/lib/rag/visualization/`、`src/components/visualization/`、`src/components/deep-interaction/renderers/`
- deep-interaction：`src/features/deep-interaction/`、`src/lib/deep-interaction/`、`src/components/deep-interaction/`
- API routes：`src/app/api/`、`src/app/api/v1/`
- Zustand stores：`src/lib/stores/`、`src/features/rag/state/`
- 测试：`tests/`
- 文档：`README.md`、`docs/`、`competition_submission/`
- 配置文件：`package.json`、`tsconfig.json`、`eslint.config.mjs`、`next.config.ts`、`AGENTS.md`

## 执行摘要

- 本次审计在 `codex/rag-quality-rewrite` 分支上继续执行，没有触碰既有用户改动 `.claude/settings.local.json`。
- 未发现 P0 级构建、类型或测试阻断问题。
- 修复 1 个 P1 安全稳定性问题：函数图渲染层移除 `new Function`，改为白名单数学表达式解析器。
- 补充 1 组确定性测试：安全表达式 evaluator 支持常用数学表达式并拒绝可执行 JavaScript 字符串。
- 同步 README 与主要 docs 的当前路由叙事：主入口为 `/student`、`/teacher`、`/visualization`，`/rag` 为兼容重定向入口。
- 未进行大规模产品重构，未删除核心路由、知识库数据、Skill 配置、deep-interaction pipeline 或测试。

## 当前发现的问题

### P0：会导致运行失败、构建失败、安全风险

- 未发现 P0。最终 `lint`、`typecheck`、`test`、`build`、`check` 均通过。

### P1：影响稳定性、类型安全、用户体验

- 已修复：`src/components/visualization/FunctionGraphRenderer.tsx` 曾使用 `new Function` 执行函数图 `evaluator` 字符串。虽然 `quality_checker` 会拦截危险 evaluator，但渲染层仍存在 defense-in-depth 缺口。本次改为白名单数学表达式解析器。
- 已修复：`src/lib/rag/visualization/quality_checker.ts` 现在复用同一安全表达式编译逻辑，避免“检查层与渲染层规则不一致”。
- 已处理：PowerShell `Get-Content` 在默认编码下会把部分 UTF-8 中文显示成 mojibake。用 Node 按 UTF-8 读取确认源文件正常；只将 `AppShell` 语言按钮文案从 `中 / EN` 润色为 `中文 / EN`。
- 未修复但记录：`src/features/rag/ui/SubjectRagConsole.tsx` 约 1553 行，承担问题输入、任务切换、答案渲染、引用联动、会话历史、进度、可视化等多项职责。当前功能可运行，但维护风险偏高，后续建议单独做低风险纯 UI 拆分。
- 未修复但记录：`src/lib/deep-interaction/agentWidgetPipeline.ts` 约 1260 行，是 deep-interaction 核心 pipeline。本轮按约束不重写，只记录为后续可拆分对象。

### P2：代码重复、命名不一致、文档过时

- 已处理：`docs/feature_architecture.md`、`docs/rag_subject_switching.md`、`docs/system_architecture.md`、`docs/demo_stability.md`、`docs/demo_script_3min.md`、`docs/xh202620_mapping.md`、`docs/evaluation/results/README.md` 中的旧 `/rag` 主入口叙事已同步为当前三入口结构。
- 已记录：当前同时存在 `/api/v1/*` 与旧 `/api/*` routes。检查结果表明 v1 为主，旧 route 多为 thin adapter 或兼容入口；本轮不删除。
- 已记录：`src/components/rag/SubjectRagConsole.tsx` 是指向 `src/features/rag/ui/SubjectRagConsole.tsx` 的兼容 re-export，暂不删除。
- 已记录：`features/*` 已建立模块化入口，但底层实现仍有不少位于 `src/lib/*` 和 `src/components/*`。这是可接受的迁移中状态，文档已明确。

### P3：可优化但不紧急

- `tmp/export-spike/` 包含 PPTX/HTML/截图等 spike 产物，是否保留需团队确认。本轮不删除。
- `docs/superpowers/plans/*` 是历史过程文档，部分内容可能与当前路由状态不一致。保留为过程档案，但不作为当前产品事实入口。
- `src/features/rag/ui/SubjectRagConsole.tsx` 中 KaTeX 渲染仍使用 `dangerouslySetInnerHTML` 注入 KaTeX 生成的 HTML。`renderLatexToString` 使用 KaTeX 且 `trust: false`，测试覆盖公式渲染与失败 fallback；残余风险低，暂不替换为自建 MathML/React renderer。
- `src/lib/generation/mockExperimentGenerator.ts` 约 884 行，可能包含旧实验生成 mock 逻辑。仍可能被 `/generate` 或实验组件引用，本轮不删除。

## 修改计划与结果

| 阶段 | 计划 | 结果 |
| --- | --- | --- |
| Phase 0 | 建立审计报告 | 已新增并最终补齐本报告。 |
| Phase 1 | 扫描项目结构 | 已记录 routes、features、lib、components、skills、docs、tests 状态。 |
| Phase 2 | 运行基础检查 | 已运行并记录最终命令。 |
| Phase 3 | 扫描未使用和冗余代码 | 已扫描危险 API、API Key、旧路由叙事、兼容 re-export；不确定项仅记录不删除。 |
| Phase 4 | 评估超大组件 | 已记录 `SubjectRagConsole.tsx` 与 `agentWidgetPipeline.ts`，本轮不拆。 |
| Phase 5 | 类型系统清理 | 未发现阻断型重复类型或 strict 问题；新增 safe expression 类型未使用 `any`。 |
| Phase 6 | RAG 管线检查 | 已确认 v1/legacy adapter、citation、quality report、markdown fallback 可运行；RAG query 触发 `markdown_fallback` 并通过复核。 |
| Phase 7 | 可视化管线检查 | 已修复函数图 evaluator 执行风险，quality checker 复用安全解析。 |
| Phase 8 | deep-interaction 检查 | 未重写 pipeline；记录大文件与 HTML safety 边界。 |
| Phase 9 | 状态管理检查 | 未发现 API Key 被 RAG session/research log 持久化；RAG session 仍限制 30 条。 |
| Phase 10 | 安全与隐私扫描 | 未发现真实 API Key；修复 `new Function` 风险；记录 KaTeX 低残余风险。 |
| Phase 11 | 性能扫描 | 记录大组件、artifact 大文本和 spike 产物后续优化项；本轮不做架构级性能重写。 |
| Phase 12 | 测试补强 | 新增 `tests/test_visualization_safe_expression.ts`。 |
| Phase 13 | 文档同步 | README 与主要 docs 已同步当前路由和模块边界。 |
| Phase 14 | 最终检查 | 已运行最终命令；未执行浏览器人工验收。 |
| Phase 15 | 最终输出 | 见本报告与最终回复。 |

## 项目结构扫描

### `src/app/`

- 页面路由包含 `/`、`/student`、`/teacher`、`/visualization`、`/interactions`、`/settings`、`/rag`、`/deep-interaction`、`/experiments`、`/generate`、`/player`。
- `/rag` 当前为兼容入口，重定向到 `/student`。
- `/experiments` 当前为兼容入口，重定向到 `/interactions`。
- API routes 同时存在旧 `/api/*` 与 `/api/v1/*`。当前设计为 v1 主入口，旧 API 保留兼容周期。

### `src/features/`

- 当前包含 `rag`、`deep-interaction`、`settings`、`subjects`。
- `features/rag` 已具备 `application`、`client`、`state`、`ui` 和 `contracts.ts`。
- `features/settings` 与 `features/subjects` 已有 application service。
- `features/deep-interaction` 当前主要作为 facade/workbench 包装，底层实现仍在 `src/lib/deep-interaction` 与 `src/components/deep-interaction`。

### `src/lib/`

- RAG 已覆盖 query planner、hybrid retriever、evidence assembler、answer protocol、quality review、multi-agent、visualization、session store 等模块。
- deep-interaction 逻辑仍集中在 `agentWidgetPipeline.ts` 及 agents/renderers/types 中。
- `src/lib/stores/` 包含多个 Zustand store；本轮未发现敏感 Key 误持久化。

### `src/components/`

- 最大 UI 文件为 `src/features/rag/ui/SubjectRagConsole.tsx`。
- `src/components/settings/ModelSettingsConsole.tsx` 约 508 行，接近后续可拆分阈值。
- deep-interaction shell 暂低于 600 行，但职责较多。
- visualization renderer 已按类型拆分为函数图、力图、算法轨迹和统一 renderer。

### `skills/`

- 当前存在 `physics_mechanics`、`advanced_math`、`chemistry`、`computer_science`。
- 各学科均保留 `skill.yaml`、`system_prompt.md`、`answer_template.md`、`knowledge_base` 目录结构。
- `physics_mechanics` ingest 最终成功：17 documents，20 chunks。

### `docs/`

- XH202620 参赛文档、系统架构、知识来源、评估模板、demo 稳定性和提交清单均存在。
- 本轮已同步主要入口叙事，避免继续把 `/rag` 写成唯一主页面。

### `tests/`

- 当前测试覆盖 RAG pipeline、hybrid retrieval、answer protocol、multi-agent、quality review、presentation review、math render、markdown lite、citation、model profiles、subject manager、visualization quality、web search、architecture boundaries 等。
- 本轮新增安全表达式 evaluator 测试，最终测试数为 100。

## 已修复问题列表

- 移除函数图渲染层 `new Function`，改用 `compileSafeFunctionExpression`。
- 新增 `src/lib/rag/visualization/safe_expression.ts`，只允许数字、`x`、括号、基础运算符、`Math.sin/cos/tan/exp/log/pow/sqrt/abs`、`Math.PI`、`Math.E`。
- `quality_checker` 复用安全表达式解析，保证检查层和渲染层规则一致。
- 新增 `tests/test_visualization_safe_expression.ts`，覆盖合法数学表达式、幂运算、允许的 `Math.*` 函数、危险 JavaScript 字符串拒绝、未知标识符拒绝。
- `AppShell` 语言切换按钮文案改为 `中文 / EN`。
- README 与主要 docs 更新当前入口：`/student`、`/teacher`、`/visualization` 为主，`/rag` 为兼容入口。

## 未修复但记录的问题

- `SubjectRagConsole.tsx` 仍是 1500+ 行大组件，建议后续拆为 `QuestionInputPanel`、`AnswerLecture`、`EvidenceLedger`、`QualityReviewPanel`、`RagSessionPanel` 等。
- `agentWidgetPipeline.ts` 仍是 1200+ 行核心 pipeline，建议后续按 planning、template、generation、review、finalize 阶段逐步拆分。
- `tmp/export-spike/` 是否保留待团队确认。
- `docs/superpowers/plans/*` 保留为历史过程档案，可能不代表当前真实产品状态。
- KaTeX `dangerouslySetInnerHTML` 仍存在，但限定为 KaTeX `trust: false` 产物，风险较低。

## 文件清单

### 新增文件

- `docs/code_audit_report.md`
- `src/lib/rag/visualization/safe_expression.ts`
- `tests/test_visualization_safe_expression.ts`

### 修改文件

- `README.md`
- `docs/demo_script_3min.md`
- `docs/demo_stability.md`
- `docs/evaluation/results/README.md`
- `docs/feature_architecture.md`
- `docs/rag_subject_switching.md`
- `docs/system_architecture.md`
- `docs/xh202620_mapping.md`
- `src/components/layout/AppShell.tsx`
- `src/components/visualization/FunctionGraphRenderer.tsx`
- `src/lib/rag/visualization/quality_checker.ts`

### 删除文件

- 无。

### 未触碰的既有脏文件

- `.claude/settings.local.json`：审计开始前已修改，本轮未主动修改或回滚。

## 类型系统改进摘要

- 新增 safe expression parser 使用明确的 discriminated union token 类型。
- 没有引入新的 `any`。
- `quality_checker` 与 renderer 共享同一编译函数，减少重复规则与类型漂移。

## RAG 管线改进摘要

- 本轮未修改 RAG 请求/响应 schema。
- 确认 `/api/v1/rag/ask` 为主入口，旧 `/api/rag/ask` 作为 legacy adapter 保留。
- 最终 RAG query 命令成功返回：1 条本地 citation、`quality_report.decision: accept`。
- 模型实际输出未按 JSON answer envelope 返回，触发 `answer_protocol: markdown_fallback`。这是当前兜底路径，不是静默失败；日志中有 `parseJson exhausted all strategies`，报告中保留该事实。

## 可视化管线改进摘要

- 函数图 renderer 不再执行任意 JavaScript 字符串。
- RAG lightweight visualization 与 `/visualization` deep-interaction 完整交互实验仍保持边界不变。
- 渲染失败路径保持安全降级，不影响主回答。

## deep-interaction 改进摘要

- 本轮没有重写 deep-interaction。
- 保留 `/deep-interaction` 旧入口和 `/visualization` 使用的完整交互生成能力。
- 记录 `agentWidgetPipeline.ts` 大文件风险和 HTML safety 继续有效。

## 状态管理改进摘要

- RAG session store 已有最多 30 条限制。
- research log store 会过滤 `prompt`、`fullPrompt`、`html`、`guidedPlan`、`plan`、`apiKey`、`modelProfiles` 等敏感字段。
- 未发现 API Key 被错误写入 RAG session 或 research log。
- artifact/session store 保存生成 artifact 属于交互库核心能力，本轮不删除。

## 安全隐私检查结果

- 未发现真实 API Key 泄露；命中的 `sk-*` 主要为测试假 Key、README 示例或服务端请求逻辑。
- `GET /api/v1/model-profiles` 仍通过 public summary 返回 `hasApiKey` 和 `apiKeyPreview`，不返回完整 API Key。
- 已修复函数图 `new Function` 风险。
- 剩余 `dangerouslySetInnerHTML` 仅用于 KaTeX 渲染结果，且 KaTeX 配置使用 `trust: false`。
- 未发现将 mock web search 宣传为真实联网检索的新增问题。

## 性能优化摘要

- 未做大规模性能重构。
- 已记录潜在热点：RAG 大组件重复渲染、deep-interaction 大 pipeline、artifact 大文本持久化、交互库列表摘要化、spike 产物目录。
- 本轮安全表达式 parser 在渲染时编译 evaluator，避免使用动态代码执行；函数图仍按 200 步采样，保持现有渲染成本。

## 测试新增或修改摘要

- 新增 `tests/test_visualization_safe_expression.ts`。
- 最终 `npm.cmd test` 结果：100 tests，100 pass，0 fail，0 skipped。
- 没有删除或跳过现有测试。

## 文档同步摘要

- README：主入口改为 `/student`，保留 `/rag` 兼容说明。
- `docs/feature_architecture.md`：重写为当前学生助学、教师助教、可视化演示、交互库、设置页架构。
- `docs/rag_subject_switching.md`：同步 v1 API 与 legacy adapter 说明。
- `docs/system_architecture.md`：同步当前三入口与 RAG/deep-interaction 边界。
- `docs/demo_stability.md`：修正 demo fallback 实现位置。
- `docs/demo_script_3min.md`、`docs/xh202620_mapping.md`、`docs/evaluation/results/README.md`：同步当前入口与评审材料路径。

## 命令记录

| 命令 | 结果 | 摘要 |
| --- | --- | --- |
| `npm.cmd run lint` | 成功 | ESLint 通过。 |
| `npm.cmd run typecheck` | 成功 | `tsc --noEmit` 通过。 |
| `npm.cmd test` | 成功 | 100 tests，100 pass，0 fail。 |
| `npm.cmd run build` | 成功 | Next.js 16.2.6 production build 通过，生成 25 个 app route 页面。 |
| `npm.cmd run check` | 成功 | 依次完成 lint、typecheck、build。 |
| `npm.cmd run rag:ingest -- --subject physics_mechanics` | 成功 | `physics_mechanics: 17 documents, 20 chunks`，写入 `.stemotion/vector-store/physics_mechanics.json` 与 manifest。 |
| `npm.cmd run rag:query -- --subject physics_mechanics --question "非零初始高度斜抛运动如何求落地时间和射程？"` | 成功 | 模型请求返回 200；结果包含 1 条本地 citation、`answer_protocol: markdown_fallback`、`quality_report.decision: accept`。日志记录 JSON envelope 解析失败并走 Markdown fallback。 |

### 环境备注

- 在 PowerShell 中直接运行 `npm run ...` 会触发 `npm.ps1` 执行策略限制；后续均使用 `npm.cmd ...`。这是本机 shell 策略问题，不是项目代码失败。
- 未执行浏览器人工验收；本报告仅记录命令级验证结果。

## 后续建议的 10 个优化项

1. 将 `SubjectRagConsole.tsx` 按纯展示边界逐步拆分，不移动核心状态逻辑。
2. 为 RAG UI 增加 Playwright 级别 smoke test，覆盖 `/student` 默认问题、citation chip、公式渲染和移动端布局。
3. 将 `agentWidgetPipeline.ts` 按阶段拆分为 planning、template、generation、review、finalize。
4. 为 deep-interaction SSE event 增加 contract 测试，避免前后端事件名漂移。
5. 将 RAG no-evidence、web-unavailable、citation normalize 文案集中到单一模块。
6. 为 `tmp/export-spike/` 制定保留、归档或删除策略。
7. 将 artifact 列表持久化改为摘要优先，详情懒加载，降低 localStorage 压力。
8. 为 KaTeX rendering 增加更明确的安全注释和单测，持续约束 `trust: false`。
9. 将旧 `/api/*` adapter 的兼容周期写入 README 或迁移文档，后续再决定是否移除。
10. 补充浏览器人工验收脚本或自动化 smoke test，覆盖 `/student`、`/teacher`、`/visualization`、`/interactions`、`/settings`、`/deep-interaction`、`/rag`。
