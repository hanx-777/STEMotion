# 左侧导航重组 — 学生/教师/可视化一级入口实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将"学生助学 / 教师助教 / 可视化演示"从 /rag 页面内部的二级场景中心提升为左侧一级导航入口，隐藏"实验工作台"和"深度交互"，形成清晰的三模块产品结构。

**Architecture:** 新增三个前端路由页面 `/student`、`/teacher`、`/visualization`，每个页面复用同一个 `SubjectRagConsole` 组件并传入 `mode` prop。新增 `modeConfigs.ts` 配置文件定义每个 mode 的默认任务、默认问题、标题和副标题。修改 `AppShell.tsx` 导航结构。保留 `/rag` 路由并重定向到 `/student`。

**Tech Stack:** Next.js App Router, React 18, Tailwind CSS v4, lucide-react

---

## 文件清单

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/lib/rag/modeConfigs.ts` | Create | 三个 mode 的配置（标题、副标题、默认任务、默认问题、任务列表） |
| `src/features/rag/ui/SubjectRagConsole.tsx` | Modify | 接受 `mode` prop，移除 center selector，根据 mode 过滤任务 |
| `src/features/rag/ui/RagWorkbench.tsx` | Modify | 透传 `mode` prop 给 SubjectRagConsole |
| `src/app/student/page.tsx` | Create | 学生助学路由页面 |
| `src/app/teacher/page.tsx` | Create | 教师助教路由页面 |
| `src/app/visualization/page.tsx` | Create | 可视化演示路由页面 |
| `src/app/rag/page.tsx` | Modify | 重定向到 `/student` |
| `src/components/layout/AppShell.tsx` | Modify | 导航结构重组 |
| `docs/feature_architecture.md` | Modify | 更新功能导航说明 |
| `README.md` | Modify | 更新页面入口说明 |

---

### Task 1: 创建 modeConfigs.ts

**Files:**
- Create: `src/lib/rag/modeConfigs.ts`

定义三个 mode 的配置数据，供页面和组件使用。

- [ ] **Step 1: 创建 modeConfigs.ts**

```typescript
import type { RagTaskType } from './types';

export type RagMode = 'student' | 'teacher' | 'visualization';

export interface ModeTaskConfig {
  subId: string;
  label: string;
  taskType: RagTaskType;
  description: string;
  recommendedQuestion: string;
}

export interface ModeConfig {
  mode: RagMode;
  title: string;
  subtitle: string;
  defaultTaskType: RagTaskType;
  defaultSubId: string;
  defaultQuestion: string;
  tasks: ModeTaskConfig[];
}

export const MODE_CONFIGS: Record<RagMode, ModeConfig> = {
  student: {
    mode: 'student',
    title: '学生助学',
    subtitle: '面向大学物理力学学习场景，提供知识讲解、分步解题、错因诊断和学习建议。',
    defaultTaskType: 'step_solution',
    defaultSubId: 'step_solution',
    defaultQuestion: '一个小球以 20 m/s 初速度、30 度角斜向上抛出，忽略空气阻力，求最大高度和水平射程。',
    tasks: [
      { subId: 'knowledge_qa', label: '知识讲解', taskType: 'knowledge_qa', description: '解释概念、公式和物理直觉', recommendedQuestion: '为什么匀速圆周运动速度大小不变但仍然有加速度？' },
      { subId: 'step_solution', label: '分步解题', taskType: 'step_solution', description: '提取信息、判断模型、分步推导、计算结果', recommendedQuestion: '一个小球以 20 m/s 初速度、30 度角斜向上抛出，忽略空气阻力，求最大高度和水平射程。' },
      { subId: 'misconception_diagnosis', label: '错因诊断', taskType: 'misconception_diagnosis', description: '分析错误答案，指出公式误用和复习建议', recommendedQuestion: '学生答案：斜抛最大高度 H = v0² / 2g。请判断是否正确并说明原因。' },
    ],
  },
  teacher: {
    mode: 'teacher',
    title: '教师助教',
    subtitle: '面向大学物理力学教学场景，辅助教师生成课堂导入、演示流程、互动问题和课后练习。',
    defaultTaskType: 'teacher_prep',
    defaultSubId: 'teacher_classprep',
    defaultQuestion: '请为「斜抛运动最大高度与水平射程」设计一段 10 分钟课堂演示，要求包含课堂导入、核心公式、互动提问、可视化演示参数和课后练习。',
    tasks: [
      { subId: 'teacher_classprep', label: '课堂备课', taskType: 'teacher_prep', description: '生成教学目标、课堂导入、核心公式和教学流程', recommendedQuestion: '请为「斜抛运动最大高度与水平射程」设计一段 10 分钟课堂演示。' },
      { subId: 'teacher_demo_design', label: '演示设计', taskType: 'teacher_prep', description: '生成课堂可视化演示流程和参数建议', recommendedQuestion: '请设计一个用于讲解斜抛运动轨迹的课堂可视化演示。' },
      { subId: 'teacher_practice_gen', label: '练习生成', taskType: 'teacher_prep', description: '围绕当前知识点生成练习题和易错点提醒', recommendedQuestion: '请围绕斜抛运动生成 3 道由易到难的课堂练习题。' },
    ],
  },
  visualization: {
    mode: 'visualization',
    title: '可视化演示',
    subtitle: '基于大学物理力学模型生成运动参数卡、轨迹图和轻量动态演示，帮助理解抽象运动过程。',
    defaultTaskType: 'step_solution',
    defaultSubId: 'viz_trajectory',
    defaultQuestion: '生成一个初速度 20 m/s、发射角 30 度、g = 9.8 m/s² 的斜抛运动轨迹演示。',
    tasks: [
      { subId: 'viz_trajectory', label: '斜抛轨迹', taskType: 'step_solution', description: '根据初速度、发射角和重力加速度生成运动轨迹图', recommendedQuestion: '生成一个初速度 20 m/s、发射角 30 度、g = 9.8 m/s² 的斜抛运动轨迹演示。' },
      { subId: 'viz_animation', label: '动态演示', taskType: 'step_solution', description: '打开页面内轻量动画，观察运动过程', recommendedQuestion: '演示斜抛运动中水平速度和竖直速度随时间的变化。' },
      { subId: 'viz_params', label: '参数分析', taskType: 'step_solution', description: '提取并展示 v0、角度、g、最大高度和水平射程', recommendedQuestion: '分析 v0 = 20 m/s、角度 = 30° 时斜抛运动的关键参数。' },
    ],
  },
};

export function getModeConfig(mode: string): ModeConfig {
  if (mode in MODE_CONFIGS) {
    return MODE_CONFIGS[mode as RagMode];
  }
  return MODE_CONFIGS.student;
}
```

- [ ] **Step 2: 运行 tsc 检查**

Run: `npx tsc --noEmit`
Expected: No errors

---

### Task 2: 修改 SubjectRagConsole 接受 mode prop

**Files:**
- Modify: `src/features/rag/ui/SubjectRagConsole.tsx`

核心改动：
1. 组件接受 `mode` prop
2. 根据 mode 设置初始 activeGroup、activeSubId、taskType、question
3. 移除 center selector UI（TASK_GROUPS 卡片）
4. 只显示当前 mode 对应的任务卡片
5. 页面标题和副标题从 modeConfig 获取
6. 移除 TASK_GROUPS 常量（不再需要）

- [ ] **Step 1: 添加 mode prop 和 import modeConfigs**

在文件顶部添加 import：

```typescript
import { getModeConfig, type RagMode } from '@/lib/rag/modeConfigs';
```

修改组件签名：

```typescript
export default function SubjectRagConsole({ mode = 'student' }: { mode?: RagMode }) {
```

- [ ] **Step 2: 根据 modeConfig 设置初始状态**

将现有的状态初始化（约 line 183-198）改为从 modeConfig 读取：

```typescript
const modeConfig = getModeConfig(mode);

const [subjects, setSubjects] = useState<SubjectInfo[]>([]);
const [subject, setSubject] = useState('physics_mechanics');
const [taskType, setTaskType] = useState<TaskType>(modeConfig.defaultTaskType);
const [question, setQuestion] = useState(modeConfig.defaultQuestion);
const [useWebSearch, setUseWebSearch] = useState(true);
const [loadingSubjects, setLoadingSubjects] = useState(true);
const [asking, setAsking] = useState(false);
const [loadingStep, setLoadingStep] = useState(0);
const [error, setError] = useState<string | null>(null);
const [result, setResult] = useState<RagResult | null>(null);
const [activeDemoId, setActiveDemoId] = useState<string | null>(null);
const [skillOpen, setSkillOpen] = useState(false);
const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
const [highlightedSourceKey, setHighlightedSourceKey] = useState<string | null>(null);
const [showTrajectory, setShowTrajectory] = useState(false);
const [showAnimation, setShowAnimation] = useState(false);
const [activeGroup, setActiveGroup] = useState<TaskGroupId>(mode);
const [activeSubId, setActiveSubId] = useState<string>(modeConfig.defaultSubId);
const [sessionCollapsed, setSessionCollapsed] = useState(true);
```

- [ ] **Step 3: 更新 activeTask 解析**

activeTask 应该从 modeConfig.tasks 中查找，而不是从全局 TASK_MODES：

```typescript
const activeTask = modeConfig.tasks.find((t) => t.subId === activeSubId) ?? modeConfig.tasks[0];
```

- [ ] **Step 4: 移除 center selector UI**

删除"选择使用场景"区域（约 line 497-533），包括：
- `<h2>选择使用场景</h2>` 标题
- `<div className="mb-5 grid gap-3 sm:grid-cols-3">` center selector 卡片

替换为 mode 标题和副标题：

```tsx
<section className="stemotion-elevated rounded-lg p-4">
  <div className="mb-4">
    <h2 className="text-base font-semibold text-[var(--stemotion-ink)]">{modeConfig.title}</h2>
    <p className="mt-1 text-xs text-[var(--stemotion-muted)]">{modeConfig.subtitle}</p>
  </div>
```

- [ ] **Step 5: 替换任务卡片区域**

删除现有的三个 `{activeGroup === 'student' && ...}`、`{activeGroup === 'teacher' && ...}`、`{activeGroup === 'visualization' && ...}` 条件块。

替换为统一的任务卡片渲染：

```tsx
  <h3 className="mb-2 text-sm font-semibold text-[var(--stemotion-muted)]">
    {modeConfig.title}任务
  </h3>
  <div className="mb-4 grid gap-1 rounded-lg border border-[var(--stemotion-border)] bg-[#f1eee6] p-1 sm:grid-cols-3">
    {modeConfig.tasks.map((task) => (
      <button
        type="button"
        key={task.subId}
        onClick={() => { setTaskType(task.taskType); setActiveSubId(task.subId); setQuestion(task.recommendedQuestion); setActiveDemoId(null); setResult(null); }}
        className={`min-h-11 rounded-md border px-3 py-2 text-left text-sm transition ${
          activeSubId === task.subId
            ? 'border-white bg-white font-semibold text-[var(--stemotion-primary-strong)] shadow-sm'
            : 'border-transparent text-slate-600 hover:bg-white/70 hover:text-[var(--stemotion-ink)]'
        }`}
      >
        {task.label}
        <span className="mt-0.5 block text-[11px] font-normal leading-4 text-[var(--stemotion-muted)]">{task.description}</span>
      </button>
    ))}
  </div>
```

- [ ] **Step 6: 更新 demo 卡片区域**

demo 卡片应根据当前 mode 过滤。将 `demosByGroup` 改为只显示当前 mode 的 demos：

```tsx
  <div className="mb-4 grid gap-2 md:grid-cols-3">
    {demosByGroup[mode]?.map((demo) => (
      <DemoCard key={demo.id} demo={demo} active={activeDemoId === demo.id} onClick={() => applyDemo(demo)} />
    ))}
  </div>
```

- [ ] **Step 7: 更新可视化提示**

可视化提示只在 visualization mode 下显示：

```tsx
  {mode === 'visualization' && (
    <p className="mb-4 rounded-lg border border-teal-100 bg-[var(--stemotion-primary-soft)] px-3 py-2 text-xs leading-5 text-[var(--stemotion-primary-strong)]">
      可视化演示会优先使用当前回答中的 visualization_hint；如果没有，则尝试从问题中解析 v0、角度和 g。
    </p>
  )}
```

- [ ] **Step 8: 更新状态行文案**

状态行的"当前场景"从 modeConfig 读取：

```tsx
<span>当前模块：<strong className="text-[var(--stemotion-ink)]">{modeConfig.title}</strong></span>
<span>当前任务：<strong className="text-[var(--stemotion-ink)]">{activeTask.label}</strong></span>
```

- [ ] **Step 9: 更新 applyDemo 函数**

applyDemo 不再需要切换 activeGroup（因为 mode 已经固定），但需要确保 demo 的 group 匹配当前 mode：

```typescript
const applyDemo = (demo: DemoCase) => {
  setQuestion(demo.question);
  setTaskType(demo.taskType);
  setActiveDemoId(demo.id);
  setResult(null);
  // 找到对应的 task 以更新 activeSubId
  const matchingTask = modeConfig.tasks.find((t) => t.taskType === demo.taskType);
  if (matchingTask) {
    setActiveSubId(matchingTask.subId);
  }
};
```

- [ ] **Step 10: 清理不再需要的常量**

删除 `TASK_GROUPS` 常量（不再使用）。
保留 `TASK_MODES`（可能被其他地方引用）或如果确认无其他引用也可删除。

- [ ] **Step 11: 运行 tsc 检查**

Run: `npx tsc --noEmit`
Expected: No errors

---

### Task 3: 修改 RagWorkbench 透传 mode

**Files:**
- Modify: `src/features/rag/ui/RagWorkbench.tsx`

- [ ] **Step 1: 更新 RagWorkbench 接受 mode prop**

```tsx
'use client';

import SubjectRagConsole from './SubjectRagConsole';
import type { RagMode } from '@/lib/rag/modeConfigs';

export default function RagWorkbench({ mode = 'student' }: { mode?: RagMode }) {
  return <SubjectRagConsole mode={mode} />;
}
```

- [ ] **Step 2: 运行 tsc 检查**

Run: `npx tsc --noEmit`
Expected: No errors

---

### Task 4: 创建三个路由页面

**Files:**
- Create: `src/app/student/page.tsx`
- Create: `src/app/teacher/page.tsx`
- Create: `src/app/visualization/page.tsx`

- [ ] **Step 1: 创建 /student 页面**

```tsx
'use client';

import AppShell from '@/components/layout/AppShell';
import RagWorkbench from '@/features/rag/ui/RagWorkbench';

export default function StudentPage() {
  return (
    <AppShell>
      <RagWorkbench mode="student" />
    </AppShell>
  );
}
```

- [ ] **Step 2: 创建 /teacher 页面**

```tsx
'use client';

import AppShell from '@/components/layout/AppShell';
import RagWorkbench from '@/features/rag/ui/RagWorkbench';

export default function TeacherPage() {
  return (
    <AppShell>
      <RagWorkbench mode="teacher" />
    </AppShell>
  );
}
```

- [ ] **Step 3: 创建 /visualization 页面**

```tsx
'use client';

import AppShell from '@/components/layout/AppShell';
import RagWorkbench from '@/features/rag/ui/RagWorkbench';

export default function VisualizationPage() {
  return (
    <AppShell>
      <RagWorkbench mode="visualization" />
    </AppShell>
  );
}
```

- [ ] **Step 4: 运行 tsc 检查**

Run: `npx tsc --noEmit`
Expected: No errors

---

### Task 5: 修改 /rag 重定向

**Files:**
- Modify: `src/app/rag/page.tsx`

- [ ] **Step 1: 将 /rag 改为重定向到 /student**

```tsx
import { redirect } from 'next/navigation';

export default function RagPage() {
  redirect('/student');
}
```

注意：这里不需要 `'use client'`，因为 `redirect` 是 server-side 函数。如果当前页面使用了 `'use client'`，需要移除。

但 `/rag` 也可能被外部链接或 API 直接访问。如果需要保留 query param 支持，可以用：

```tsx
import { redirect } from 'next/navigation';

export default function RagPage() {
  redirect('/student');
}
```

- [ ] **Step 2: 验证重定向**

确认 `/rag` 会重定向到 `/student`，且 `/student` 正常渲染。

---

### Task 6: 修改 AppShell 导航结构

**Files:**
- Modify: `src/components/layout/AppShell.tsx`

- [ ] **Step 1: 更新 import**

添加新的 lucide-react 图标：

```typescript
import { BookOpen, GraduationCap, Info, LineChart, Library, Menu, PanelRightClose, PanelRightOpen, Settings } from 'lucide-react';
```

移除不再需要的图标：`Beaker`, `Sparkles`, `BookOpenCheck`。

- [ ] **Step 2: 替换 navItems**

将现有的 `navItems` 数组替换为：

```typescript
const navItems = [
  { name: '学生助学', href: '/student', icon: BookOpen },
  { name: '教师助教', href: '/teacher', icon: GraduationCap },
  { name: '可视化演示', href: '/visualization', icon: LineChart },
  { name: '交互库', href: '/interactions', icon: Library },
];
```

- [ ] **Step 3: 更新 isActive 逻辑**

当前 `isActive` 函数已经能处理子路径匹配，新路由 `/student`、`/teacher`、`/visualization` 都是一级路径，不需要修改。

- [ ] **Step 4: 更新 headerTitle 逻辑**

替换 `headerTitle` 计算逻辑：

```typescript
const headerTitle =
  pathname === '/student' || pathname === '/rag'
    ? '学生助学'
    : pathname === '/teacher'
      ? '教师助教'
      : pathname === '/visualization'
        ? '可视化演示'
        : pathname === '/settings'
          ? '模型与 API 设置'
          : pathname === '/interactions' || pathname === '/experiments'
            ? '交互库'
            : pathname === '/deep-interaction'
              ? '深度交互模式'
              : pathname === '/'
                ? '实验工作台'
                : 'STEMotion';
```

- [ ] **Step 5: 运行 tsc 检查**

Run: `npx tsc --noEmit`
Expected: No errors

---

### Task 7: 更新 demoCases 分组

**Files:**
- Modify: `src/lib/rag/demoCases.ts` (如果需要)

当前 demoCases 已经有 `group` 字段（`'student' | 'teacher' | 'visualization'`），与 mode 对应。不需要修改数据结构。

但需要确认 `demosByGroup` 在 SubjectRagConsole 中的 useMemo 正确使用了 `group` 字段。

如果当前 `demosByGroup` 已经按 group 分组，则无需修改。

---

### Task 8: 更新文档

**Files:**
- Modify: `README.md`
- Modify: `docs/feature_architecture.md`

- [ ] **Step 1: 更新 README.md 页面入口**

将"页面入口"表格更新为：

```markdown
| 页面 | 说明 |
| --- | --- |
| `/student` | 学生助学：知识讲解、分步解题、错因诊断 |
| `/teacher` | 教师助教：课堂备课、演示设计、练习生成 |
| `/visualization` | 可视化演示：斜抛轨迹、动态演示、参数分析 |
| `/settings` | OpenAI / Claude 模型 profile、API Key、Base URL、模型列表和 active profile |
| `/interactions` | 本地交互库，保存、打开、筛选和删除 artifact |
| `/rag` | 重定向到 `/student` |
```

- [ ] **Step 2: 更新 docs/feature_architecture.md**

更新功能导航说明，反映新的三模块结构。

---

### Task 9: 运行完整测试

- [ ] **Step 1: TypeScript 类型检查**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: ESLint**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 3: 生产构建**

Run: `npm run build`
Expected: Build succeeds, `/student`, `/teacher`, `/visualization` pages listed

- [ ] **Step 4: 运行测试（如果有）**

Run: `npm test`
Expected: Tests pass

---

## 不改动的内容

- `/deep-interaction` 页面代码 — 只从导航隐藏，不删除
- `/` 实验工作台页面代码 — 只从导航隐藏，不删除
- RAG API（`/api/v1/rag/ask`、`/api/rag/ask`）
- `rag_pipeline.ts` 检索逻辑
- `retriever.ts` 索引逻辑
- `vector_store.ts` 存储逻辑
- `skill.yaml` 学科配置
- `system_prompt.md` 和 `answer_template.md`
- 知识库文件（`skills/physics_mechanics/knowledge_base/`）
- 模型配置逻辑
- `/settings` 页面
- `/interactions` 页面

---

## 验证清单

1. 左侧导航显示：学生助学、教师助教、可视化演示、交互库、设置、关于
2. 实验工作台和深度交互不再出现在主导航
3. `/student` 页面只显示学生相关任务（知识讲解、分步解题、错因诊断）
4. `/teacher` 页面只显示教师相关任务（课堂备课、演示设计、练习生成）
5. `/visualization` 页面只显示可视化相关工具（斜抛轨迹、动态演示、参数分析）
6. 三个页面都能调用同一个 RAG 问答流程
7. 三个页面都保留知识依据面板
8. `/rag` 重定向到 `/student`
9. 点击任务卡片填入推荐问题，不自动请求
10. 页面标题正确显示（学生助学 / 教师助教 / 可视化演示）
11. 375px 宽度无横向滚动
12. `npm run build` 成功
