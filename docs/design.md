# STEMotion 产品与研究设计说明

本文档描述 STEMotion 当前实现形态、产品边界和 CHI/HCI 取向的系统叙事。它不是历史 roadmap，而是当前项目的产品设计说明。

## 1. 产品定位

STEMotion 是面向 K-12 STEM 教育的 AI 交互学习 artifact 生成系统。它的目标不是替教师一次性生成静态网页，而是支持教师与 AI 协作完成一个可检查、可修改、可复用的交互实验。

一句话定位：

> STEMotion is a teacher-AI co-authoring system for blueprint-grounded and reviewable interactive STEM learning artifacts.

中文表述：

> STEMotion 是一个基于教学蓝图、学科约束和多 Agent 质量闭环的 STEM 交互实验共创系统。

## 2. 核心设计理念

### Pedagogical Grounding

系统不直接从 prompt 跳到 HTML，而是先将教师意图外化为教师可读的 Guided Plan，并进一步结构化为 `LearningBlueprint`。

这让以下内容变得可检查：

- 学科主题是否明确；
- 年级和认知层级是否合适；
- 核心变量是否可操作、可观察；
- 学生应形成的 expectedInsight 是否清楚；
- 必须保持正确的公式、单位、阶段顺序和概念边界是什么。

### Reviewable Generative Artifacts

STEMotion 的 artifact 不只是 HTML。一个完整 artifact 可以包含：

- `InteractionSchema`
- `htmlWidget`
- `LearningBlueprint`
- `templateMetadata`
- `planningMetadata`
- `QualityReport`
- `qualityExplanation`
- `repairTrace`
- follow-up version history

因此教师和研究者可以回看“为什么这样生成”“评审发现了什么”“修复了什么”“是否基于可信模板”。

### Controlled Adaptation

对常见 STEM 主题，系统优先匹配 `Verified Experiment Templates`，再通过 `TemplateCustomizationAgent` 做受控改编。模板提供学科正确性和交互结构下限，AI 主要修改 editable slots。

未命中模板时，系统退回蓝图驱动的自由生成路径，但仍进入 HTML 安全校验、多 Agent 评审和必要修复。

## 3. 目标用户

### 教师

教师用于备课、课堂演示、实验预习和课后资源生成。教师最关心：

- 是否符合当前教学目标；
- 是否适合学生年级；
- 学科概念是否正确；
- 交互是否能帮助学生形成关键理解；
- 是否能追问修改；
- 是否可保存和复用。

### 学生

学生用于自主探索、实验预习、概念理解和错因纠正。学生最关心：

- 能不能直接操作；
- 操作之后能不能看见结果；
- 抽象公式是否有可视化支撑；
- 错误理解是否能被反馈纠正；
- 界面是否清楚、移动端是否可用。

### 研究者

研究者关注教师如何审查、接受、修改或拒绝 AI 生成物。Research Mode 默认只在本地记录摘要事件，为后续用户研究提供基础数据。

研究日志不自动上传，不记录完整 prompt、完整 plan、完整 HTML、API Key 或模型配置。

### 开发维护者

开发维护者关注 pipeline 的可扩展性、失败降级、数据结构兼容和本地持久化安全。新增能力应尽量追加可选字段，避免破坏旧 artifact。

## 4. 产品入口

```text
/                     标准实验室模式
/deep-interaction     深度交互生成模式
/interactions         本地交互库
/experiments          兼容跳转到本地交互库
/player               播放相关页面
```

标准实验室 `/` 保持轻量一键生成，适合快速演示传统 `ExperimentConfig`。

深度交互 `/deep-interaction` 是当前研究和产品叙事重点，包含 Guided Planning、LearningBlueprint、模板匹配、多 Agent 质量闭环和 follow-up。

## 5. 深度交互用户流程

```text
输入学习主题
-> Guided Planning
   -> 需求明确：生成 Teacher Plan
   -> 需求模糊：最多 2 轮澄清
-> 用户批准计划
-> SSE 生成流程
-> artifact_ready
-> 本地交互库保存
-> 播放 / 探索 / follow-up 修改
```

Guided Planning 的计划面向教师，而不是面向工程师。它展示学习目标、核心变量、知识约束、可能模板、交互结构和质量关注点。

`planningSessionId` 只作为追踪 ID。服务端不保存规划会话状态。

## 6. 生成架构

批准后的深度交互生成流程：

```text
InteractionPlannerAgent
-> LearningDesignAgent
-> SubjectSchemaValidator
-> TemplateMatcher
   -> TemplateCustomizationAgent, if high confidence
   -> WidgetHtmlAgent, otherwise
-> HTML safety validation / repair
-> TeacherActionAgent
-> Multi-Agent Feedback Loop
-> Explainable QualityReport
-> artifact_ready
```

关键原则：

- `guidedPlan` 是高优先级上下文，但不盲从；
- Subject Schema 和 HTML 安全规范优先级高于用户确认过的错误计划；
- template 路径仍必须进入安全、运行时、教学和 UX 评审；
- evaluator 缺少可靠来源时，不填假分数；
- 旧 artifact 缺少新字段时必须继续兼容。

## 7. Artifact 组成

一个深度交互 artifact 的核心结构包括：

- `id`、`sessionId`、`type`、`title`、`description`
- `schema`
- `status`
- `version`
- `blueprint?`
- `templateMetadata?`
- `planningMetadata?`
- `feedbackLoop?`
- `qualityReport?`

可选字段只追加，不删除旧字段。这样可以保证 localStorage 中的历史 artifact 继续打开。

## 8. 可信模板设计

Verified Templates 是项目内原创实现的高质量底座。当前首批模板覆盖：

- 欧姆定律
- 二次函数
- 有丝分裂
- 酸碱滴定

模板必须：

- 自包含，无外链资源；
- 包含 `widget-config`；
- 支持核心 postMessage 协议；
- 使用稳定 `data-role`；
- 支持移动端 375px；
- 保留 protected constraints；
- 进入完整 feedback loop。

模板不是第三方实验源码搬运，也不是免审路径。

## 9. 质量评审设计

多 Agent feedback loop 的角色：

- `Pedagogy Evaluator`：检查教学目标、变量覆盖、蓝图对齐和学科适配。
- `UX Evaluator`：检查可访问性、移动端、触控、布局稳定、反馈和动画意义。
- `Safety Evaluator`：检查 HTML 安全边界和禁用能力。
- `Runtime Evaluator`：检查可运行性和基本脚本问题。
- `JudgeAgent`：综合分数和阻塞问题，决定 accept、repair、regenerate 或 reject。
- `RepairAgent`：按目标区域做最小修复。

`QualityReport` 面向教师展示结果，`qualityExplanation` 用更可读的方式解释 expectedInsight、变量、知识约束、模板保留和修复记录。

## 10. Research Mode 设计

Research Mode 是本地研究辅助功能，不是用户追踪系统。

默认关闭。开启后只记录摘要事件：

- 规划开始；
- 澄清回答；
- 计划批准；
- 蓝图生成；
- 模板命中；
- artifact 生成；
- 质量报告查看；
- follow-up 提交；
- artifact 保存。

记录字段控制在 `promptLength`、`subjectDomain`、`topic`、`templateId`、`artifactId`、`qualityLevel` 等摘要范围内。

## 11. 安全与边界

HTML widget 运行在 iframe 中。当前 sandbox 为兼容模式：

```html
sandbox="allow-scripts allow-same-origin"
```

Widget 生成和模板改编禁止：

- 外部远程资源；
- `fetch`、`XMLHttpRequest`、`WebSocket`；
- `localStorage`、`document.cookie`；
- 嵌套 iframe；
- 动态 import。

项目边界：

- 不引入数据库；
- 不引入账号系统；
- 不上传研究日志；
- 不做完整在线编程环境；
- 不复制第三方源码、素材、品牌元素或 UI 细节。

## 12. 后续方向

- BlueprintEditor：教师在生成前编辑 LearningBlueprint。
- 更大规模 Verified Template Library：扩展高频 STEM 主题。
- STEMotion Benchmark：比较 free generation、schema-grounded generation 和 template-based customization。
- Study Protocol：围绕 Research Mode 增加更规范的研究导出说明。
