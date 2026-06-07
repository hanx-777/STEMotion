# STEMotion 迁移总览

## 一句话结论

第 001-008 轮已完成本次重构里程碑的最小闭环：新产品路由可用，旧路由保持兼容跳转，知识库健康度页只读上线，RAG 回答可预填 Lab prompt，`npm run test:static-smoke` 已作为静态路由契约验证入口加入项目。

## 路由与模块

| 新路由 | 旧路由 | 兼容方式 | 说明 |
| --- | --- | --- | --- |
| `/learn` | `/student`, `/rag` | server redirect | 学生学习 RAG |
| `/teach` | `/teacher` | server redirect | 教师教学 RAG |
| `/lab` | `/visualization` | server redirect | 可视化实验 / Lab |
| `/assets` | `/interactions` | server redirect | 本地教学资产库 |
| `/knowledge` | 无 | 新增只读页 | 知识库健康度 |
| `/settings` | 保持 | 直接访问 | 模型与 API 设置 |
| `/deep-interaction` | 保持 | 不重定向 | 底层 Deep Interaction 入口 |

当前一级模块为：学生学习、教师教学、可视化实验、知识库、教学资产、设置。`AppShell` 主导航包含前五项，设置在底部导航；`/deep-interaction` 保留为底层能力入口，不放入主导航。

## 知识库健康度

`/knowledge` 只读取本地元数据，不触发 ingest、build、query 或检索。数据来源包括 `skills/*/skill.yaml`、`skills/*/knowledge_base/sources/`、`processed/manifest.json`、`index/` 和 `.stemotion/vector-store/*.manifest.json`。

第 003 轮快照：4 个目标学科，44 个 source 文件，45 个 processed chunks，20 个 runtime chunks。`physics_mechanics` 为 healthy；`advanced_math`、`chemistry`、`computer_science` 为 partial。partial 表示静态知识库与索引存在，但缺少 runtime vector-store manifest，不等于没有知识库。

## RAG -> Lab 桥接

桥接是前端本地预填，不是后端生成。`/learn` 与 `/teach` 的 RAG 回答完成后，用户点击生成交互实验，系统把生成的 prompt 字符串写入 `sessionStorage` key：`stemotion.ragLabBridge.prefillPrompt`，再跳转 `/lab?from=rag-bridge`。

Lab 面板只读取并移除该预填 prompt，显示“已从 RAG 回答带入实验 prompt，请确认后再生成 Guided Plan”。预填分支不会自动调用 planning、generate、follow-up、真实 RAG 查询或可视化生成 API，必须由用户确认后再继续。

## 验证入口

| 命令 | 用途 |
| --- | --- |
| `npm run test:static-smoke` | 先 build，再检查新路由、旧 redirect、导航、RAG->Lab 预填与构建路由产物 |
| `npm run lint --if-present` | ESLint |
| `npm run typecheck --if-present` | TypeScript |
| `npm run build --if-present` | 生产构建 |
| `npm test --if-present` | 更广的仓库测试套件 |

第 005-008 轮记录显示：route compatibility、knowledge health、RAG->Lab bridge、build、lint、typecheck、`npm test --if-present`、`npm run check --if-present` 与 `npm run test:static-smoke` 均曾通过。第 005 轮本地 curl smoke 验证核心页面 200、旧路由 307 redirect。浏览器 smoke 因本地 Playwright Chromium 缺失而跳过，未下载浏览器。

## 工程边界

这些轮次未修改 RAG API、RAG pipeline、Deep Interaction planning/generate/follow-up pipeline、知识库原始数据、ingest/build 脚本、模型配置、secrets、环境变量、依赖版本或 lockfile。验证命令可能临时改动 `next-env.d.ts` 或 `.stemotion` 时间戳/尾部格式；这类内容按验证副作用恢复后再汇报。

## 关键文件索引

| 范围 | 文件 |
| --- | --- |
| 导航 | `src/components/layout/AppShell.tsx` |
| 新路由 | `src/app/learn/page.tsx`, `src/app/teach/page.tsx`, `src/app/lab/page.tsx`, `src/app/assets/page.tsx`, `src/app/knowledge/page.tsx` |
| 旧路由 | `src/app/student/page.tsx`, `src/app/teacher/page.tsx`, `src/app/visualization/page.tsx`, `src/app/interactions/page.tsx`, `src/app/rag/page.tsx` |
| 知识库 | `src/features/knowledge/knowledgeHealth.ts` |
| 桥接 | `src/features/rag-lab-bridge/buildLabPrompt.ts`, `src/features/rag/ui/SubjectRagConsole.tsx`, `src/components/deep-interaction/DeepInteractionRightPanel.tsx` |
| 测试 | `tests/test_route_compatibility.ts`, `tests/test_knowledge_health.ts`, `tests/test_rag_lab_bridge.ts`, `tests/test_static_route_contract.ts` |

## 下一步

只建议一个最小任务：在 `README.md` 增加一个指向本文档的短链接，让维护者和评审能直接找到重构总览。
