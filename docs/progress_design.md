# 进度展示设计文档

## 为什么重构

原有进度展示是纯前端假进度：`setInterval` 每 850ms 递增 `loadingStep` 从 0 到 2，与服务器真实状态无关。参赛展示时，评委会质疑系统的真实性。

重构目标：将进度展示改为"事件驱动 + 阶段式 + 可解释"，不伪造进度。

## 架构

### 统一类型 (`src/lib/progress/progressTypes.ts`)

- `ProgressStatus`: idle | pending | running | completed | skipped | warning | error
- `ProgressStage`: 阶段定义（id, title, description, status, startedAt, completedAt, detail）
- `ProgressModel`: 完整进度模型（mode, stages[], message, summary）

### 阶段定义 (`src/lib/progress/progressStages.ts`)

- `createRagStages()`: RAG 问答 6 阶段
- `createDeepInteractionStages()`: 深度交互 9 阶段

### 进度计算 (`src/lib/progress/progressCalculator.ts`)

基于阶段权重计算百分比，不基于时间。

### UI 组件 (`src/components/progress/RealisticProgressPanel.tsx`)

统一进度面板，接收 `ProgressModel` prop。

## RAG 进度阶段

| 阶段 | 权重 | 说明 |
|------|------|------|
| 解析问题 | 10% | 识别学科、任务类型 |
| 检索本地课程资料 | 25% | 从知识库查找相关片段 |
| 网络补充检索 | 10% | 本地不足时补充（可 skipped） |
| 生成结构化回答 | 30% | 根据任务类型组织回答 |
| 整理引用来源 | 15% | 区分本地/网络来源 |
| 生成可视化提示 | 10% | 识别可视化参数（可 skipped） |

**驱动方式**：RAG API 是同步 request-response，无 SSE。前端按真实调用边界更新：
- 请求发出前：parse → running
- 请求进行中：retrieve_local → running（不假装完成）
- 响应返回后：根据 response 内容标记各阶段 completed/skipped

## Deep-Interaction 进度阶段

| 阶段 | 权重 | 对应 SSE 事件 |
|------|------|---------------|
| 创建生成会话 | 5% | planning |
| 分析教学需求 | 10% | selecting_type, generating_outline |
| 生成教学蓝图 | 15% | blueprint |
| 校验学科约束 | 10% | subject_validation |
| 匹配可信模板 | 10% | template |
| 生成交互实验 | 25% | generating_schema, building_interaction |
| 质量检查 | 15% | feedback, evaluation |
| 自动修复 | 5% | repair（无 repair 时 skipped） |
| 生成完成 | 5% | ready, artifact_ready |

**驱动方式**：SSE 真实事件驱动，通过 `generationProgressStore` 映射到统一模型。

## 进度百分比计算规则

1. completed 阶段计入完整权重
2. skipped 阶段计入完整权重（UI 显示"跳过"）
3. running 阶段最多计入 40% 权重
4. error 阶段不继续增加进度
5. 所有阶段 completed/skipped 后才能显示 100%

## 不伪造进度原则

1. 不让进度条按时间自动增长
2. 不在没有事件/响应前标记阶段 completed
3. 不把 heartbeat 当作真实进度
4. 如果后端没有细粒度信息，显示"正在等待模型返回"
5. 进度条可以有视觉动画，但数据状态必须来自真实阶段
