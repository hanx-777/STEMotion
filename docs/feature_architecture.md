# STEMotion 功能分级

## 一级：参赛主应用层

### 学生助学中心 (`/student`)

面向大学生的物理力学智能学习助手，基于课程知识库提供可追溯的结构化回答。

- **知识讲解**：解释物理概念、公式推导和物理直觉。
- **分步解题**：提取题目信息、判断物理模型、分步推导、计算结果。
- **错因诊断**：分析错误答案，指出公式误用和复习建议。

### 教师助教中心 (`/teacher`)

面向教师的备课和课堂演示辅助工具。

- **课堂备课**：生成教学目标、课堂导入、互动提问和课后练习。
- **演示设计**：生成课堂可视化演示流程和参数建议。
- **练习生成**：围绕当前知识点生成练习题和易错点提醒。

### 可视化演示中心 (`/visualization`)

继承 deep-interaction 生成能力，用于生成大学物理力学交互实验和可视化演示。

- **完整交互实验**：通过 Guided Planning、LearningBlueprint 和多 Agent 质量评审生成 HTML/SVG/Canvas 小组件。
- **教师动作协议**：通过 postMessage 支持高亮、注释、状态切换等课堂演示动作。
- **本地保存**：生成结果可进入 `/interactions` 交互库管理。

### 兼容入口

- `/rag`：兼容旧链接，当前重定向到 `/student`。
- `/deep-interaction`：保留为高级生成能力入口，不在主导航中突出展示。
- `/experiments`：兼容旧实验入口，当前重定向到 `/interactions`。
- `/`、`/generate`、`/player`：保留旧标准实验室和播放相关能力，不作为 XH202620 主演示路径。

## 二级：可信知识底座层

### 学科知识库

每个学科 Skill 配置独立知识库，支持课程讲义、教材章节和原创整理笔记的分块索引与混合检索（TF-IDF 词法 + 可选 Embedding 语义）。

### 可追溯 RAG 引擎

回答中的 `[Lx]` 表示本地课程资料，`[Wx]` 表示网络补充资料。两类引用在数据结构、UI 和质量检查中保持区分。

- 本地课程资料为优先可信来源。
- 网络补充资料仅作为补充参考，不伪装为课程资料。
- 无可靠依据时仍由大模型回答，但必须明确提示依据不足，且不伪造 citations。

## 三级：学科扩展层

### 学科 Skill 管理

支持多学科 Skill 配置（`physics_mechanics`、`advanced_math`、`chemistry`、`computer_science`），每个 Skill 包含：

- 系统提示词和回答模板。
- 知识库文件和检索配置。
- 工具能力标签和回答规范。

## 四级：系统支撑层

### 模型与 API 设置 (`/settings`)

管理 OpenAI 兼容接口和 Claude Messages API 的本地 profile。读取接口只返回 `hasApiKey` 和 `apiKeyPreview`，不返回完整 API Key。

### 交互库 (`/interactions`)

保存、打开、筛选和删除 deep-interaction 生成的 artifact。内容保存在浏览器本地 Zustand persist 中。

### RAG 内嵌可视化与完整可视化的边界

- `/student` 与 `/teacher` 中的 RAG 内嵌可视化是 lightweight preview，主要展示参数卡片、斜抛轨迹和轻量 SVG。
- `/visualization` 使用 deep-interaction 流程，面向完整交互实验生成。

## 当前页面信息架构

```text
主导航
├─ 学生助学 /student
├─ 教师助教 /teacher
├─ 可视化演示 /visualization
├─ 交互库 /interactions
└─ 设置 /settings

/student
├─ 模块标题与默认学科状态
├─ 任务切换：知识讲解 / 分步解题 / 错因诊断
├─ 问题输入与“使用默认问题”
├─ 智能回答、公式、结果和可视化参数
└─ 右侧：进度、知识依据、引用和本地会话

/teacher
├─ 任务切换：课堂备课 / 演示设计 / 练习生成
├─ 教师默认问题与示例入口
└─ RAG 回答、引用和可视化提示

/visualization
└─ deep-interaction 工作台
```
