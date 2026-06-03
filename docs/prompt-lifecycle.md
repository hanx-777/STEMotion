# STEMotion Prompt 生命周期

本文档追踪一个用户 prompt 在深度交互模式中的完整生命周期。重点说明 prompt 如何进入 Guided Planning、如何被批准为教师计划、如何转化为 LearningBlueprint 和最终 artifact，以及哪些阶段会记录摘要数据。

示例 prompt：

```text
生成一个面向初中物理的欧姆定律实验，可以调节电压和电阻，观察电流变化。
```

## 1. UI 输入

入口组件：

- `src/components/deep-interaction/DeepInteractionRightPanel.tsx`
- `src/components/deep-interaction/GuidedPlanningPanel.tsx`

用户在右侧输入框输入 prompt。点击发送后，前端不直接调用生成接口，而是先创建一个本地 `planningSessionId`，然后调用 planning API。

Research Mode 如果开启，只记录：

```json
{
  "type": "planning_started",
  "payload": {
    "promptLength": 38,
    "preferredType": "simulation",
    "planningSessionId": "planning_xxx"
  }
}
```

不会记录完整 prompt。

## 2. Guided Planning API

接口：

```text
POST /api/deep-interaction/planning
```

请求摘要：

```json
{
  "prompt": "生成一个面向初中物理的欧姆定律实验，可以调节电压和电阻，观察电流变化。",
  "preferredType": "simulation",
  "planningSessionId": "planning_xxx",
  "answers": [],
  "clarificationRound": 0
}
```

服务端处理：

- `planningSessionId` 只用于追踪，不要求服务端保存会话状态。
- 每次调用都通过 `prompt + answers + clarificationRound` 重建上下文。
- Prompt 明确时返回 `plan_ready`。
- Prompt 模糊时返回 `clarification_required`，最多 3 个问题。
- 最多 2 轮澄清；第二轮后仍不明确时返回 `plan_ready`，把风险写入 `assumptions`。
- Planning Agent 失败或 JSON 解析失败时，返回 deterministic fallback plan，不阻断用户。

## 3. 澄清问题

如果返回：

```json
{
  "status": "clarification_required",
  "planningSessionId": "planning_xxx",
  "clarificationRound": 1,
  "questions": [
    {
      "id": "topic",
      "question": "你希望这个交互聚焦哪个具体概念或实验？",
      "options": ["欧姆定律", "二次函数", "酸碱滴定", "有丝分裂"]
    }
  ]
}
```

前端展示问题。用户回答后再次调用 planning API。

Research Mode 如果开启，只记录：

```json
{
  "type": "clarification_answered",
  "payload": {
    "planningSessionId": "planning_xxx",
    "clarificationRound": 1,
    "answerCount": 3
  }
}
```

不会记录完整回答文本。

## 4. Teacher Plan

Prompt 足够明确或澄清完成后，planning API 返回 `GuidedGenerationPlan`。

核心字段：

```ts
interface GuidedGenerationPlan {
  planningSessionId: string;
  topic: string;
  subjectDomain: string;
  gradeRange?: [number, number];
  interactionType?: string;
  expectedInsight: string;
  learningObjectives: string[];
  coreVariables: string[];
  knowledgeConstraints: string[];
  possibleTemplate?: {
    templateId?: string;
    title?: string;
    confidence?: number;
  };
  interactionStructure: string[];
  qualityFocus: string[];
  assumptions: string[];
  approvedAt?: string;
}
```

这个 plan 是教师可读的教学计划，不是工程 pipeline 日志。它不会描述内部 Agent 调用顺序，而是帮助教师确认“要生成什么、为什么生成、质量关注什么”。

## 5. 用户批准

用户点击“批准计划并开始生成”后，前端给 plan 写入 `approvedAt`，并调用现有生成接口：

```text
POST /api/deep-interaction/generate
```

请求包含：

```json
{
  "prompt": "原始 prompt",
  "preferredType": "simulation",
  "existingSessionId": "可选",
  "currentArtifactId": "可选",
  "guidedPlan": {
    "planningSessionId": "planning_xxx",
    "topic": "欧姆定律",
    "subjectDomain": "physics",
    "expectedInsight": "...",
    "approvedAt": "2026-05-19T..."
  }
}
```

Research Mode 如果开启，只记录计划摘要：

```json
{
  "type": "plan_approved",
  "payload": {
    "planningSessionId": "planning_xxx",
    "subjectDomain": "physics",
    "topic": "欧姆定律",
    "interactionType": "simulation",
    "templateId": "physics-ohms-law-basic",
    "clarificationCount": 0
  }
}
```

不会记录完整 plan 文本。

## 6. SSE 生成入口

接口：

```text
POST /api/deep-interaction/generate
```

路由文件：

- `src/app/api/deep-interaction/generate/route.ts`

该接口返回 Server-Sent Events。它会把请求交给：

- `src/lib/deep-interaction/agentWidgetPipeline.ts`

如果请求没有 `guidedPlan`，旧生成逻辑保持不变。

## 7. InteractionPlannerAgent

Pipeline 首先调用 `planInteraction`，将原始 prompt 和用户选择的 `preferredType` 转化为内部 `InteractionPlan`。

该阶段确定：

- 标题；
- 概念；
- 学科；
- 年级段；
- 学习目标；
- 初始变量；
- 交互大纲；
- widget outline；
- quiz。

## 8. LearningDesignAgent

接着调用 `LearningDesignAgent` 生成 `LearningBlueprint`。

如果提供了 `guidedPlan`：

- 它作为高优先级上下文进入 LearningDesignAgent；
- 但系统不盲从 guidedPlan；
- 如果 guidedPlan 与 Subject Schema 或 HTML Widget 安全规范冲突，以学科约束和安全规范优先。

`LearningBlueprint` 会包含：

- `topic`
- `subjectDomain`
- `gradeRange`
- `bloomLevel`
- `scaffoldingLevel`
- `coreVariables`
- `expectedInsight`
- `learningObjectives`
- `knowledgeConstraints`

随后通过 SSE 发出：

```text
blueprint_generated
```

Research Mode 只记录 `subjectDomain` 和 `topic` 摘要。

## 9. SubjectSchemaValidator

`SubjectSchemaValidator` 根据 blueprint 匹配内置 schema，并合并学科约束。

SSE 事件：

```text
subject_validated
```

该事件只发送摘要：

- `blueprintId`
- `passed`
- `schemaKey`
- `violations`
- `warnings`

不会发送完整 constraints 列表，避免 SSE payload 过大。

## 10. TemplateMatcher

系统使用用户 prompt 和 blueprint 摘要匹配 `Verified Experiment Templates`。

高置信命中时：

```text
template_matched
-> TemplateCustomizationAgent
-> template_customized
```

未命中时：

```text
WidgetHtmlAgent
```

中置信匹配只记录，不改变自由生成路径。

## 11. HTML 生成与安全修复

模板路径和自由生成路径都会进入 HTML safety validation。

处理链路包括：

```text
stripMarkdownCodeFence
-> repairMalformedHtml
-> assertSafeInteractiveHtml
-> patchTruncatedHtml, if needed
-> repairWidgetHtml, if needed
```

HTML 必须自包含，并包含 `widget-config`、postMessage 协议和稳定 `data-role`。

## 12. TeacherActionAgent

HTML 通过安全检查后，系统从 widget config 中提取 message targets，并调用 `TeacherActionAgent` 生成讲解动作。

TeacherActionAgent 优先引用：

- `data-role`
- 稳定 id
- widget-config 中声明的 targets

它不应依赖随机 className 或深层 DOM 结构。

## 13. Multi-Agent Feedback Loop

Artifact draft 进入多 Agent 质量闭环：

```text
Pedagogy Evaluator
UX Evaluator
Safety Evaluator
Runtime Evaluator
JudgeAgent
RepairAgent, when needed
```

如果 JudgeAgent 判定需要修复，RepairAgent 会基于问题类别和目标区域进行最小修复。

质量闭环完成后发出：

```text
feedback_completed
```

## 14. Artifact Ready

最终通过：

```text
artifact_ready
```

发送完整 `InteractionArtifact`。

前端保存到：

- `stemotion-interaction-sessions`
- `stemotion-interaction-artifacts`

如果 artifact 来自 approved plan，会包含可选：

```ts
planningMetadata?: {
  planningSessionId: string;
  approvedAt?: string;
  summary: string;
  clarificationCount: number;
}
```

Research Mode 记录 `artifact_generated` 和 `artifact_saved` 的摘要。

## 15. Follow-up 生命周期

用户对当前 artifact 继续追问时，前端调用：

```text
POST /api/deep-interaction/follow-up
```

请求包含：

- 当前 HTML；
- follow-up prompt；
- 当前标题和概念；
- 可选 `LearningBlueprint`；
- 可选 `templateMetadata`。

Follow-up 不重新跑完整 feedback loop，而是在当前 session 中创建新 artifact version。

如果有 blueprint，服务端要求保留 expectedInsight、must 级知识约束和核心变量覆盖。

如果有 templateMetadata，服务端要求保留 protected constraints、稳定 `data-role`、公式区、观察区和 quiz 区。

Research Mode 只记录：

```json
{
  "type": "follow_up_submitted",
  "payload": {
    "promptLength": 20,
    "artifactId": "artifact_xxx",
    "templateId": "physics-ohms-law-basic"
  }
}
```

不会记录完整 follow-up prompt。

## 16. 隐私与记录边界

Research Mode 的记录边界：

| 阶段 | 是否记录完整文本 |
| --- | --- |
| 原始 prompt | 否，只记录 `promptLength` |
| 澄清回答 | 否，只记录回答数量 |
| Guided Plan | 否，只记录主题、学科、类型、模板等摘要 |
| HTML | 否 |
| API Key / model profiles | 否 |
| Artifact metadata | 是，限摘要字段 |

`researchLogStore` 会过滤 `prompt`、`fullPrompt`、`html`、`guidedPlan`、`plan`、`apiKey`、`modelProfiles` 等敏感字段。

## 17. 失败降级

- Planning Agent 失败：返回 fallback plan，用户仍可批准生成。
- LearningDesignAgent 失败：使用 deterministic fallback blueprint。
- TemplateCustomizationAgent 失败：回退原始 verified template。
- HTML 安全检查失败：尝试程序化修复和 LLM 修复。
- Multi-Agent 评审发现问题：JudgeAgent 决定是否调用 RepairAgent。

原则：除非存在不可恢复的安全或运行错误，否则尽量不让用户流程卡死。
