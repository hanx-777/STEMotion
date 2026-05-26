# STEMotion MVP

STEMotion 是一个面向 K-12 STEM 教育的 AI 交互实验生成系统。它把教师或学生的一句自然语言需求，转化为可运行、可检查、可保存、可追问修改的交互式学习 artifact。

当前项目定位不是普通 AI HTML 生成器，而是一个 **teacher-AI co-authoring system**：系统先把教师意图外化为教师可读的计划和 `LearningBlueprint`，再结合学科约束、可信模板、多 Agent 评审和本地研究记录，帮助教师检查、协商、修改和复用 AI 生成的 STEM 交互实验。

核心生成范式：

```text
Clarification
-> Teacher Plan
-> Approval
-> LearningBlueprint
-> Subject Schema
-> Verified Template / Free Generation
-> Multi-Agent Quality Review
-> Explainable QualityReport
-> Follow-up Refinement
```

## 当前能力

- 标准实验室模式 `/`：加载传统 `ExperimentConfig`，用于快速展示单个结构化实验。
- 深度交互模式 `/deep-interaction`：通过 Guided Planning 和 Agent pipeline 生成 HTML/SVG/Canvas 交互组件。
- 本地交互库 `/interactions`：使用浏览器 localStorage/Zustand persist 保存、打开、筛选和删除 artifact。
- Guided Planning：生成前先澄清需求，输出教师可读的生成计划，用户批准后才正式生成。
- LearningBlueprint：记录主题、学科、年级、Bloom 层级、核心变量、expectedInsight、学习目标和知识约束。
- Subject Schema Validator：对高频 STEM 主题注入学科约束，并把校验摘要进入生成上下文。
- Verified Experiment Templates：对常见主题优先匹配原创可信模板，再做 slot-based customization。
- Multi-Agent Feedback Loop：Pedagogy、UX、Safety、Runtime Evaluator 共同评审，JudgeAgent 决定是否触发 RepairAgent。
- Explainable QualityReport：展示蓝图对齐、变量覆盖、知识约束、模板保留和 repair trace。
- Follow-up 修改：基于当前 HTML 创建新版本，尽量保留 blueprint、模板约束和稳定 `data-role`。
- Research Mode：本地记录摘要事件并导出 JSON/CSV，用于后续教师-AI 共创研究。
- 模型 profile 切换：通过 `model-profiles.json` 和 `/api/model-profiles` 管理当前模型配置。

## 设计理念

STEMotion 更关注生成过程是否可解释、可审查、可修复，而不是让大模型一次性自由生成完整网页。

面向 CHI/HCI 叙事，当前系统围绕三个概念组织：

- **Pedagogical Grounding**：教师 prompt 被外化为 Guided Plan 和 LearningBlueprint，教学目标、核心变量和 expectedInsight 可以被检查。
- **Reviewable Generative Artifacts**：生成物不只是 HTML，还包括 blueprint、schema validation、template metadata、quality report 和 repair trace。
- **Controlled Adaptation**：常见实验优先基于 verified template 可控改编；未命中模板时再进入蓝图驱动的自由生成。

项目边界：

- 不复制第三方平台源码、素材、品牌元素、UI 细节或原始文案。
- 不新增数据库、账号系统或云端研究日志。
- 不把缺失的质量分数字段填成假分数。
- 不把 Research Mode 作为自动上传机制；所有研究日志默认只保存在本地。

## 技术栈

- Next.js `16.2.6`，App Router，Route Handlers
- React `19.2.4`
- TypeScript strict mode
- Tailwind CSS v4
- Zustand v5，本地 persist
- Framer Motion、Lucide React、Recharts
- OpenAI SDK，兼容 OpenAI Chat Completions 和 Anthropic Messages API 风格调用

## 快速开始

```bash
npm install
cp model-profiles.example.json model-profiles.json
npm run dev
```

默认开发端口是 `3001`：

- `http://localhost:3001/`：标准实验室
- `http://localhost:3001/deep-interaction`：深度交互生成
- `http://localhost:3001/interactions`：本地交互库

不要把真实 API Key 提交到仓库。

## 模型配置

项目优先读取根目录下的 `model-profiles.json`。

```jsonc
{
  "activeProfile": "default",
  "profiles": {
    "default": {
      "label": "Default Model",
      "provider": "openai",
      "baseURL": "https://api.example.com/v1",
      "apiKey": "sk-your-key",
      "model": "model-name",
      "timeout": 300000
    }
  }
}
```

- `provider: "openai"`：使用 OpenAI Chat Completions 兼容格式。
- `provider: "anthropic"`：使用 Anthropic Messages API 格式，`baseURL` 会补齐 messages 路径。
- `thinking` 为可选字段；启用后 Anthropic 调用会使用非流式路径，并把 temperature 设为 `1`。
- `GET /api/model-profiles` 只返回脱敏后的 profile 摘要。
- `PATCH /api/model-profiles` 切换 `activeProfile` 并清理服务端 profile 缓存。

## 核心流程

### 标准实验室模式

`POST /api/generate` 调用 `runExperimentAgentPipeline`，返回一个标准 `ExperimentConfig`。

```text
User Prompt
-> ExperimentPlannerAgent
-> WidgetCodeAgent
-> TeacherActionAgent
-> ExperimentConfig
-> validateExperimentConfig
-> 页面加载实验
```

标准实验室适合快速演示。它不会进入 Guided Planning、LearningBlueprint、Verified Templates 或多 Agent feedback loop。

### 深度交互模式

深度交互模式当前支持四类 artifact：

| 类型 | 说明 |
| --- | --- |
| `simulation` | 模拟实验、参数探索、过程动画 |
| `3d_visualization` | 3D 或空间结构可视化 |
| `game` | 知识驱动的互动小游戏 |
| `mind_map` | 概念结构、知识网络和思维导图 |

生成前会先进入 Guided Planning：

```text
User Prompt
-> POST /api/deep-interaction/planning
   -> clarification_required, if prompt is ambiguous
   -> plan_ready, if teacher plan is ready
-> User Approval
-> POST /api/deep-interaction/generate
```

`planningSessionId` 只用于前端和 Research Mode 追踪。服务端不保存 planning session；每次 planning API 调用都通过 `prompt + answers + clarificationRound` 重建上下文。

批准后进入 SSE 生成流程：

```text
InteractionPlannerAgent
-> LearningDesignAgent
-> LearningBlueprint
-> SubjectSchemaValidator
-> TemplateMatcher
   -> high-confidence match:
      -> TemplateCustomizationAgent
   -> otherwise:
      -> WidgetHtmlAgent
-> HTML safety validation / programmatic repair / LLM repair
-> TeacherActionAgent
-> InteractionSchema + Artifact draft
-> Multi-Agent Feedback Loop
   -> Pedagogy Evaluator
   -> UX Evaluator
   -> Safety Evaluator
   -> Runtime Evaluator
   -> JudgeAgent
   -> RepairAgent, when needed
-> Explainable QualityReport
-> artifact_ready
-> Zustand persist 保存到本地交互库
```

Verified Template 不是免审路径。即使命中可信模板，HTML 仍然必须进入现有 safety、runtime、pedagogy、UX feedback loop。

## Guided Plan

`GuidedGenerationPlan` 是教师计划，不是工程执行日志。它面向教师展示：

- `topic`
- `subjectDomain`
- `gradeRange`
- `interactionType`
- `expectedInsight`
- `learningObjectives`
- `coreVariables`
- `knowledgeConstraints`
- `possibleTemplate`
- `interactionStructure`
- `qualityFocus`
- `assumptions`

Planning Agent 失败或 JSON 解析失败时不会阻断用户。系统会返回 deterministic fallback plan，并在 assumptions 中标记：

```text
Planning failed; proceed with default generation assumptions.
```

澄清最多 2 轮。第二轮后仍不明确时，系统返回可批准计划，并把未解决问题写入 assumptions。

## LearningBlueprint 与 Subject Schema

`LearningBlueprint` 是深度交互生成的教学中间层，定义在 `src/lib/deep-interaction/types.ts`。核心字段包括：

- `topic`、`subjectDomain`、`gradeRange`、`bloomLevel`、`scaffoldingLevel`
- `coreVariables`：区分 independent、dependent、controlled 变量
- `expectedInsight`：学生应通过交互形成的核心洞察
- `learningObjectives`、`prerequisites`
- `knowledgeConstraints`：公式、单位、顺序、概念和视觉呈现约束

内置 Subject Schema 位于 `src/lib/deep-interaction/subject-schemas/`，当前包含：

| Schema | 主题 | 关键约束 |
| --- | --- | --- |
| `physics:ohms_law` | 欧姆定律 | `I = U / R`，V/Ω/A 单位，I 与 U/R 的关系 |
| `math:quadratic_function` | 二次函数 | `y = ax^2 + bx + c`，`x = -b / (2a)`，开口方向 |
| `physics:projectile_motion` | 抛体运动 | 水平方向匀速，竖直方向受重力加速度影响 |
| `chemistry:acid_base_titration` | 酸碱滴定 | pH/指示剂变化，强酸强碱等量点附近 pH |
| `biology:cell_division` | 有丝分裂 | 阶段顺序，两个子细胞遗传物质通常相同 |

约束合并规则：schema constraints 优先。Subject Schema 未命中时不阻断生成，只记录 warning。

## Verified Experiment Templates

可信模板位于 `src/lib/deep-interaction/verified-experiments/`。模板是项目内原创实现的自包含 HTML，不复制第三方源码、素材或品牌元素。

当前模板：

| Template | 主题 | 核心能力 |
| --- | --- | --- |
| `physics-ohms-law-basic` | 欧姆定律 | 调节电压/电阻，观察电流变化 |
| `math-quadratic-function-basic` | 二次函数 | 调节 a/b/c，观察抛物线、对称轴和顶点 |
| `biology-mitosis-basic` | 有丝分裂 | 按阶段展示细胞分裂过程 |
| `chemistry-acid-base-titration-basic` | 酸碱滴定 | 展示 pH、颜色变化和等量点 |

模板 artifact 可选保存 `templateMetadata`：

- `template_customized`：命中模板并完成可控改编
- `template_fallback_original`：改编失败，回退原始可信模板
- `free_generation`：未使用模板，走蓝图驱动自由生成

## Explainable QualityReport

`QualityReport` 保留原有 `finalScore`、`level`、`strengths`、`weaknesses`、`suggestions` 和 `evaluatorScores`，并追加可选结构化字段：

- `blueprintAlignment`
- `subjectCorrectness`
- `variableCoverage`
- `learningObjectiveCoverage`
- `knowledgeConstraintSatisfaction`
- `blueprintSummary`
- `schemaValidation`
- `qualityExplanation`
- `repairTrace`

结构化分数只来自 evaluator 的真实结构化输出或程序化校验结果。没有可靠来源时保持 `undefined`。`qualityExplanation` 中的 `unknown` 表示“未检测”或“暂无可靠证据”，不是失败。

## Research Mode

Research Mode 默认关闭，只在本地记录摘要事件，支持 JSON/CSV 导出，不自动上传数据。

记录事件包括：

- `planning_started`
- `clarification_answered`
- `plan_approved`
- `prompt_submitted`
- `blueprint_generated`
- `template_matched`
- `template_customized`
- `artifact_generated`
- `quality_report_viewed`
- `follow_up_submitted`
- `artifact_saved`

Research Mode 不记录完整 prompt、完整 guided plan、完整 HTML、API Key 或模型配置文件。推荐 payload 只包含：

- `promptLength`
- `preferredType`
- `planningSessionId`
- `subjectDomain`
- `topic`
- `interactionType`
- `templateId`
- `artifactId`
- `qualityLevel`

## SSE 事件

`POST /api/deep-interaction/generate` 返回 Server-Sent Events。当前事件包括：

```text
session_created
progress
type_selected
blueprint_generated
subject_validated
template_matched
template_customized
outline_generated
schema_generated
validation_started
feedback_started
feedback_iteration_started
evaluator_started
evaluator_completed
judge_decision
repair_started
repair_completed
feedback_completed
artifact_ready
error
```

服务端每 15 秒发送一次 `:heartbeat`。客户端断开连接时，服务端会取消当前生成流程。

`subject_validated` 只发送校验摘要：`blueprintId`、`passed`、`schemaKey`、`violations`、`warnings`，不发送完整 constraints 列表。

## HTML Widget 规范

生成的 widget 必须是完整、独立、自包含的 HTML 文档：

- 只包含内联 CSS 和内联 JS。
- 禁止外部远程资源、网络请求、动态 import、Storage、Cookie 和嵌套 iframe。
- 必须包含 `<script type="application/json" id="widget-config">`。
- 必须响应 `SET_WIDGET_STATE`、`HIGHLIGHT_ELEMENT`、`ANNOTATE_ELEMENT`、`REVEAL_ELEMENT` 四类 `postMessage`。
- 动画应使用 `requestAnimationFrame`。
- 应提供开始、暂停或重置控制。
- 应在 375px 移动端宽度下保持可用。
- 应使用稳定语义选择器，例如 `data-role="simulation-main"`、`data-role="control-panel"`、`data-role="observation-panel"`、`data-role="formula-panel"`、`data-role="quiz-panel"`。

当前 iframe sandbox 使用兼容模式：

```html
sandbox="allow-scripts allow-same-origin"
```

该值集中配置在 `src/lib/utils/iframe.ts` 的 `INTERACTIVE_WIDGET_IFRAME_SANDBOX`。未来如需切换严格模式，应先验证现有 widget 的资源访问、postMessage 通信和状态回放行为。

## Follow-up 修改

`POST /api/deep-interaction/follow-up` 接收当前 HTML 和用户追问，调用 WidgetRefineAgent 生成局部修改。它不会重新跑完整多 Agent 评审，而是在当前 session 中创建新的 artifact version。

如果当前 artifact 带有 `LearningBlueprint`，follow-up prompt 会要求继续满足 `expectedInsight`、must 级知识约束和核心变量覆盖。

如果当前 artifact 带有 `templateMetadata`，follow-up prompt 会要求保留模板核心约束、稳定 `data-role`、公式区、观察区和 quiz 区。

没有 blueprint 或 templateMetadata 时，服务端保持旧逻辑。

## API 摘要

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/api/generate` | 标准实验室一次性生成 |
| `POST` | `/api/deep-interaction/planning` | 深度交互生成前的澄清与教师计划 |
| `POST` | `/api/deep-interaction/generate` | 深度交互 SSE 生成 |
| `POST` | `/api/deep-interaction/follow-up` | 基于当前 HTML 的追问修改 |
| `GET` | `/api/model-profiles` | 读取可选模型 profile 摘要 |
| `PATCH` | `/api/model-profiles` | 切换当前 active profile |

## 本地状态与持久化

深度交互模式使用多个 Zustand store：

- `stemotion-interaction-sessions`：session、消息、当前 artifact
- `stemotion-interaction-artifacts`：artifact 列表和版本
- `generationProgressStore`：SSE 生成进度，非持久化
- `deepWidgetIframeStore`：深度交互 iframe 运行状态和消息桥接
- `deepWidgetIframeStore` 之外，标准实验室还使用 `widgetIframeStore`
- `stemotion-research-log`：Research Mode 本地摘要事件日志

旧 artifact 缺少 `blueprint`、`templateMetadata`、`planningMetadata`、`qualityExplanation` 或 `repairTrace` 时，UI 应继续可打开、可播放、可删除、可追问。

## 调试日志

日志模块为零依赖 `createLogger`，输出格式：

```text
[YYYY-MM-DD HH:MM:SS] [module:level] message | data
```

常用命令：

```bash
DEBUG=* npm run dev
DEBUG=llm,pipeline,json,html npm run dev
npm run dev
```

常见模块包括 `llm`、`pipeline`、`json`、`html`、`api`、`profiles`、`followUp`、`guidedPlanning`。

## 质量检查

```bash
npm run lint
npm run typecheck
npm run build
npm run check
```

`npm run check` 会依次执行 lint、typecheck 和 production build。

## 目录结构

```text
src/app/
  api/
    generate/
    deep-interaction/
      planning/
      generate/
      follow-up/
    model-profiles/
  deep-interaction/
  interactions/

src/components/deep-interaction/
  DeepInteractionShell.tsx
  DeepInteractionRightPanel.tsx
  GuidedPlanningPanel.tsx
  GenerationProgressPanel.tsx
  TemplateMatchPanel.tsx
  QualityExplanationPanel.tsx
  StudyModePanel.tsx
  renderers/

src/lib/deep-interaction/
  agentWidgetPipeline.ts
  events.ts
  types.ts
  agents/
  subject-schemas/
  verified-experiments/
  prompts/

src/lib/stores/
  interactionSessionStore.ts
  artifactStore.ts
  generationProgressStore.ts
  researchLogStore.ts
```

## 版本方向

- BlueprintEditor：允许教师在生成前编辑 LearningBlueprint。
- 更大规模 Verified Template Library：扩展数学、物理、化学、生物高频实验模板。
- STEMotion Benchmark：比较自由生成、schema-grounded generation 和 template-based customization。
- Study Protocol 支持：围绕 Research Mode 增加更规范的本地导出和研究说明。
