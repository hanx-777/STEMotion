# /rag 页面信息架构 v2 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 /rag 页面的三个场景中心从普通按钮升级为带图标、描述和任务数的卡片式选择器，增加推荐问题、子标题、可视化提示，统一文案，让评委一眼区分学生/教师/可视化三个场景层级。

**Architecture:** 仅修改 `SubjectRagConsole.tsx` 和 `demoCases.ts` 两个文件。不新增路由、API 或状态管理。在现有 `TASK_MODES` 和 `TASK_GROUPS` 常量上增加 `icon`、`taskCount`、`recommendedQuestion` 字段，重构 center selector 为卡片式布局。

**Tech Stack:** Next.js App Router, React 18, Tailwind CSS v4, Lucide icons, Zustand

---

## 文件清单

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/features/rag/ui/SubjectRagConsole.tsx` | Modify | 主 UI：center selector、task cards、status line、empty state、viz hint |
| `src/lib/rag/demoCases.ts` | No change | 已有 group 字段，无需修改 |

---

### Task 1: 扩展 TASK_MODES 和 TASK_GROUPS 数据结构

**Files:**
- Modify: `src/features/rag/ui/SubjectRagConsole.tsx:139-160`

当前 `TASK_MODES` 缺少 `recommendedQuestion`，`TASK_GROUPS` 缺少 `icon`、`taskCount`。需要扩展这些常量，为后续 UI 提供数据。

- [ ] **Step 1: 更新 TaskModeEntry 接口**

在 `interface TaskModeEntry` (line 139) 中添加 `recommendedQuestion` 字段：

```typescript
interface TaskModeEntry {
  id: TaskType;
  subId: string;
  label: string;
  description: string;
  group: TaskGroupId;
  recommendedQuestion: string;
}
```

- [ ] **Step 2: 更新 TASK_GROUPS 结构**

将 `TASK_GROUPS` (line 156) 从简单数组改为包含 icon 组件引用和 taskCount 的结构：

```typescript
import { BookOpen, GraduationCap, LineChart } from 'lucide-react';
// 需要在文件顶部 import 中添加这三个 icon

const TASK_GROUPS: Array<{
  id: TaskGroupId;
  title: string;
  subtitle: string;
  taskCount: number;
  taskCountLabel: string;
  icon: typeof BookOpen;
  subHeader: string;
}> = [
  { id: 'student', title: '学生助学中心', subtitle: '概念理解、分步解题、错因诊断', taskCount: 3, taskCountLabel: '个学习任务', icon: BookOpen, subHeader: '学生助学任务' },
  { id: 'teacher', title: '教师助教中心', subtitle: '课堂备课、演示设计、练习生成', taskCount: 3, taskCountLabel: '个教学任务', icon: GraduationCap, subHeader: '教师助教任务' },
  { id: 'visualization', title: '可视化演示中心', subtitle: '运动轨迹、动态演示、参数分析', taskCount: 3, taskCountLabel: '个可视化工具', icon: LineChart, subHeader: '可视化演示工具' },
];
```

- [ ] **Step 3: 给 TASK_MODES 每项添加 recommendedQuestion**

更新 `TASK_MODES` (line 147) 的每个条目：

```typescript
const TASK_MODES: TaskModeEntry[] = [
  { id: 'knowledge_qa', subId: 'knowledge_qa', label: '知识讲解', description: '解释概念、公式和物理直觉', group: 'student', recommendedQuestion: '为什么匀速圆周运动速度大小不变但仍然有加速度？' },
  { id: 'step_solution', subId: 'step_solution', label: '分步解题', description: '提取信息、判断模型、分步推导、计算结果', group: 'student', recommendedQuestion: '一个小球以 20 m/s 初速度、30 度角斜向上抛出，忽略空气阻力，求最大高度和水平射程。' },
  { id: 'misconception_diagnosis', subId: 'misconception_diagnosis', label: '错因诊断', description: '分析错误答案，指出公式误用和复习建议', group: 'student', recommendedQuestion: '学生答案：斜抛最大高度 H = v0² / 2g。请判断是否正确并说明原因。' },
  { id: 'teacher_prep', subId: 'teacher_classprep', label: '课堂备课', description: '生成教学目标、课堂导入、核心公式和教学流程', group: 'teacher', recommendedQuestion: '请为"斜抛运动最大高度与水平射程"设计一段 10 分钟课堂演示。' },
  { id: 'teacher_prep', subId: 'teacher_demo_design', label: '演示设计', description: '生成课堂可视化演示流程和参数建议', group: 'teacher', recommendedQuestion: '请设计一个用于讲解斜抛运动轨迹的课堂可视化演示。' },
  { id: 'teacher_prep', subId: 'teacher_practice_gen', label: '练习生成', description: '围绕当前知识点生成练习题和易错点提醒', group: 'teacher', recommendedQuestion: '请围绕斜抛运动生成 3 道由易到难的课堂练习题。' },
];
```

- [ ] **Step 4: 添加可视化中心的任务条目**

可视化演示中心当前没有对应 TASK_MODES 条目（它只有 demo cases）。需要添加 3 个条目以支持任务卡片：

```typescript
  // 在 teacher_practice_gen 之后添加：
  { id: 'step_solution', subId: 'viz_trajectory', label: '斜抛轨迹', description: '根据初速度、发射角和重力加速度生成运动轨迹图', group: 'visualization', recommendedQuestion: '生成一个初速度 20 m/s、发射角 30 度、g = 9.8 m/s² 的斜抛运动轨迹演示。' },
  { id: 'step_solution', subId: 'viz_animation', label: '动态演示', description: '打开页面内轻量动画，观察运动过程', group: 'visualization', recommendedQuestion: '演示斜抛运动中水平速度和竖直速度随时间的变化。' },
  { id: 'step_solution', subId: 'viz_params', label: '参数卡片', description: '提取并展示 v0、角度、g、最大高度和水平射程', group: 'visualization', recommendedQuestion: '分析 v0 = 20 m/s、角度 = 30° 时斜抛运动的关键参数。' },
```

- [ ] **Step 5: 更新 lucide-react import**

在文件顶部 import (line 4) 中添加 `BookOpen, GraduationCap, LineChart`：

```typescript
import {
  Activity,
  AlertTriangle,
  BookOpen,
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  Database,
  Eye,
  FileText,
  GraduationCap,
  History,
  LineChart,
  Loader2,
  Plus,
  Play,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
```

- [ ] **Step 6: 运行 tsc 检查类型**

Run: `npx tsc --noEmit`
Expected: No errors

---

### Task 2: 重构 Center Selector 为卡片式布局

**Files:**
- Modify: `src/features/rag/ui/SubjectRagConsole.tsx:482-505`

当前 center selector 是一行小按钮（line 488-504），视觉上和任务卡片层级混杂。需要替换为更突出的卡片式选择器。

- [ ] **Step 1: 更新区域标题**

将 line 485 的 `<h2>` 从 "教学任务" 改为 "选择使用场景"，副标题改为新文案：

```tsx
<h2 className="text-base font-semibold text-[var(--stemotion-ink)]">选择使用场景</h2>
<p className="mt-1 text-xs text-[var(--stemotion-muted)]">系统将根据学生学习、教师教学或可视化演示场景组织回答结构。</p>
```

- [ ] **Step 2: 替换 center selector JSX**

将 line 488-504 的 `sm:grid-cols-3` 小按钮替换为卡片式选择器。每个卡片包含图标、标题、描述和任务数：

```tsx
<div className="grid gap-3 sm:grid-cols-3">
  {TASK_GROUPS.map((group) => {
    const Icon = group.icon;
    const isActive = activeGroup === group.id;
    return (
      <button
        type="button"
        key={group.id}
        onClick={() => setActiveGroup(group.id)}
        className={`rounded-xl border-2 p-4 text-left transition ${
          isActive
            ? 'border-[var(--stemotion-primary)] bg-[var(--stemotion-primary-soft)] shadow-md'
            : 'border-[var(--stemotion-border)] bg-white hover:border-teal-200 hover:shadow-sm'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${isActive ? 'bg-[var(--stemotion-primary)] text-white' : 'bg-slate-100 text-slate-500'}`}>
            <Icon size={18} />
          </div>
          <div>
            <p className={`text-sm font-semibold ${isActive ? 'text-[var(--stemotion-primary-strong)]' : 'text-[var(--stemotion-ink)]'}`}>{group.title}</p>
            <p className="text-[11px] text-[var(--stemotion-muted)]">{group.subtitle}</p>
          </div>
        </div>
        <p className={`mt-2 text-[11px] font-semibold ${isActive ? 'text-[var(--stemotion-primary)]' : 'text-slate-400'}`}>
          {group.taskCount} {group.taskCountLabel}
        </p>
      </button>
    );
  })}
</div>
```

- [ ] **Step 3: 运行 tsc 检查**

Run: `npx tsc --noEmit`
Expected: No errors

---

### Task 3: 给每个中心的任务区添加子标题

**Files:**
- Modify: `src/features/rag/ui/SubjectRagConsole.tsx:507-567`

当前切换 center 后直接显示任务按钮，缺少该中心的小标题。需要在每个 center 的任务按钮上方加子标题。

- [ ] **Step 1: 在 student block 中添加子标题**

在 `{activeGroup === 'student' && (` 之后、任务按钮 grid 之前（约 line 508）添加：

```tsx
<h3 className="mb-2 text-sm font-semibold text-[var(--stemotion-muted)]">
  {TASK_GROUPS.find((g) => g.id === 'student')?.subHeader}
</h3>
```

- [ ] **Step 2: 在 teacher block 中添加子标题**

同样在 teacher block 中添加：

```tsx
<h3 className="mb-2 text-sm font-semibold text-[var(--stemotion-muted)]">
  {TASK_GROUPS.find((g) => g.id === 'teacher')?.subHeader}
</h3>
```

- [ ] **Step 3: 在 visualization block 中添加子标题**

同样在 visualization block 中添加：

```tsx
<h3 className="mb-2 text-sm font-semibold text-[var(--stemotion-muted)]">
  {TASK_GROUPS.find((g) => g.id === 'visualization')?.subHeader}
</h3>
```

- [ ] **Step 4: 给可视化中心添加任务按钮**

当前可视化中心只有 demo 卡片，没有任务按钮。需要在子标题下方、demo 卡片上方添加 3 个任务按钮（与 student/teacher 格式一致）：

```tsx
{activeGroup === 'visualization' && (
  <>
    <h3 className="mb-2 text-sm font-semibold text-[var(--stemotion-muted)]">
      {TASK_GROUPS.find((g) => g.id === 'visualization')?.subHeader}
    </h3>
    <div className="mb-4 grid gap-1 rounded-lg border border-[var(--stemotion-border)] bg-[#f1eee6] p-1 sm:grid-cols-3">
      {TASK_MODES.filter((m) => m.group === 'visualization').map((mode) => (
        <button
          type="button"
          key={mode.subId}
          onClick={() => { setTaskType(mode.id); setActiveSubId(mode.subId); setResult(null); }}
          className={`min-h-11 rounded-md border px-3 py-2 text-left text-sm transition ${
            activeSubId === mode.subId
              ? 'border-white bg-white font-semibold text-[var(--stemotion-primary-strong)] shadow-sm'
              : 'border-transparent text-slate-600 hover:bg-white/70 hover:text-[var(--stemotion-ink)]'
          }`}
        >
          {mode.label}
          <span className="mt-0.5 block text-[11px] font-normal leading-4 text-[var(--stemotion-muted)]">{mode.description}</span>
        </button>
      ))}
    </div>
    <div className="mb-4 grid gap-2 md:grid-cols-2">
      {demosByGroup.visualization.map((demo) => (
        <DemoCard key={demo.id} demo={demo} active={activeDemoId === demo.id} onClick={() => applyDemo(demo)} />
      ))}
    </div>
    <p className="mb-4 rounded-lg border border-teal-100 bg-[var(--stemotion-primary-soft)] px-3 py-2 text-xs leading-5 text-[var(--stemotion-primary-strong)]">
      可视化演示会优先使用当前回答中的 visualization_hint；如果没有，则尝试从问题中解析 v0、角度和 g。
    </p>
  </>
)}
```

- [ ] **Step 5: 运行 tsc + lint 检查**

Run: `npx tsc --noEmit && npm run lint`
Expected: No errors

---

### Task 4: 点击任务卡片时填入推荐问题

**Files:**
- Modify: `src/features/rag/ui/SubjectRagConsole.tsx` — 任务按钮 onClick 处理器

当前点击任务按钮只设置 taskType，不填入推荐问题。需要在 onClick 中同步设置 question。

- [ ] **Step 1: 更新 student 任务按钮 onClick**

将 student block 的任务按钮 onClick (约 line 514) 改为：

```tsx
onClick={() => { setTaskType(mode.id); setActiveSubId(mode.subId); setQuestion(mode.recommendedQuestion); setActiveDemoId(null); setResult(null); }}
```

- [ ] **Step 2: 更新 teacher 任务按钮 onClick**

同样更新 teacher block 的任务按钮 onClick (约 line 541)：

```tsx
onClick={() => { setTaskType(mode.id); setActiveSubId(mode.subId); setQuestion(mode.recommendedQuestion); setActiveDemoId(null); setResult(null); }}
```

- [ ] **Step 3: 更新可视化任务按钮 onClick**

在 Task 3 新增的可视化任务按钮中使用相同模式：

```tsx
onClick={() => { setTaskType(mode.id); setActiveSubId(mode.subId); setQuestion(mode.recommendedQuestion); setActiveDemoId(null); setResult(null); }}
```

- [ ] **Step 4: 验证不自动发起请求**

确认 onClick 中没有调用 `ask()` 函数——只设置状态，不触发请求。

---

### Task 5: 更新状态行文案

**Files:**
- Modify: `src/features/rag/ui/SubjectRagConsole.tsx:584-587`

当前状态行显示 "当前任务：{label} · 默认学科：大学物理力学"，需要改为三行信息。

- [ ] **Step 1: 替换状态行 JSX**

将 line 584-587 替换为：

```tsx
<div className="mt-3 flex flex-wrap items-center justify-between gap-3">
  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--stemotion-muted)]">
    <span>当前场景：<strong className="text-[var(--stemotion-ink)]">{TASK_GROUPS.find((g) => g.id === activeGroup)?.title}</strong></span>
    <span>当前任务：<strong className="text-[var(--stemotion-ink)]">{activeTask.label}</strong></span>
    <span>默认学科：<strong className="text-[var(--stemotion-ink)]">大学物理力学</strong></span>
  </div>
  <button
    type="button"
    onClick={ask}
    disabled={asking || loadingSubjects}
    className="stemotion-pressable inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--stemotion-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--stemotion-primary-strong)] disabled:cursor-not-allowed disabled:opacity-60"
  >
    {asking ? <Loader2 size={17} className="animate-spin" /> : <Search size={17} />}
    {asking ? loadingLabels[loadingStep] : '开始问答'}
  </button>
</div>
```

- [ ] **Step 2: 删除旧的 button JSX**

旧的 button 已经内联在上面的替换中，确保旧的 `<button>` 块被完全替换，不要残留。

---

### Task 6: 更新空状态文案

**Files:**
- Modify: `src/features/rag/ui/SubjectRagConsole.tsx:668-687`

当前空状态文案 "推荐演示流程" 的步骤描述需要更新以匹配新的架构。

- [ ] **Step 1: 替换空状态 JSX**

将 line 668-687 替换为：

```tsx
<div className="rounded-lg border border-dashed border-[var(--stemotion-border-strong)] bg-[#fbfaf6] px-4 py-10 text-center">
  <p className="text-sm font-semibold text-[var(--stemotion-ink)]">推荐演示流程</p>
  <p className="mt-2 text-xs leading-5 text-[var(--stemotion-muted)]">
    1. 选择「学生助学中心 - 分步解题」<br />
    2. 点击「开始问答」查看结构化推导<br />
    3. 展开右侧「知识依据」查看引用来源<br />
    4. 点击「生成轨迹」查看斜抛运动可视化
  </p>
  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
    {DEMO_CASES.filter((d) => d.group === 'student').slice(0, 3).map((demo) => (
      <button
        key={demo.id}
        type="button"
        onClick={() => applyDemo(demo)}
        className="rounded-full border border-teal-200 bg-white px-3 py-1.5 text-xs font-semibold text-[var(--stemotion-primary-strong)] transition hover:bg-[var(--stemotion-primary-soft)]"
      >
        {demo.title}
      </button>
    ))}
  </div>
</div>
```

---

### Task 7: 更新 KnowledgeBasisPanel 空状态文案

**Files:**
- Modify: `src/features/rag/ui/SubjectRagConsole.tsx:838-841`

当前空引用提示为 "暂无引用来源"，需要更详细。

- [ ] **Step 1: 替换空引用文案**

将 line 839-841 替换为：

```tsx
<p className="rounded-lg border border-dashed border-[var(--stemotion-border)] bg-[#fbfaf6] px-3 py-3 text-sm text-[var(--stemotion-muted)]">
  暂无引用来源。完成一次问答后会在这里展示本地课程资料和网络补充资料。
</p>
```

---

### Task 8: 更新 KnowledgeBasisPanel 来源描述

**Files:**
- Modify: `src/features/rag/ui/SubjectRagConsole.tsx:825-831`

需要在来源计数下方添加 "优先可信来源" / "补充参考来源" 描述。

- [ ] **Step 1: 更新 SourceCount 区域**

在 SourceCount grid 之后（line 831 之后）添加描述文字：

```tsx
<div className="mt-1 flex justify-between text-[11px] text-[var(--stemotion-muted)]">
  <span>优先可信来源</span>
  <span>补充参考来源</span>
</div>
```

---

### Task 9: 运行完整测试套件

**Files:** None (verification only)

- [ ] **Step 1: 运行 TypeScript 类型检查**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: 运行 ESLint**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 3: 运行生产构建**

Run: `npm run build`
Expected: Build succeeds, /rag page listed in output

- [ ] **Step 4: 检查是否有 npm test**

Run: `npm test` (if available)
Expected: Tests pass

---

## 不改动的内容

- `demoCases.ts` — 已有 group 字段，不需要修改
- `AppShell.tsx` — 导航已是 "学科助学"
- 后端 API — 无变更
- `rag_pipeline.ts` — 无变更
- `deep-interaction` — 无变更
- `markdown_lite.ts` — 无变更
- 可视化组件（VisualizationPanel、ProjectileSvg）— 无变更

---

## 验证清单

1. /rag 页面左侧导航显示 "学科助学"
2. 页面顶部标题为 "大学物理力学智能助学系统"
3. 区域标题为 "选择使用场景"
4. 三个中心以卡片式选择器展示，包含图标、标题、描述、任务数
5. 默认选中 "学生助学中心"
6. 每个中心下方有子标题（学生助学任务 / 教师助教任务 / 可视化演示工具）
7. 切换中心后，下方任务卡片跟着变化
8. 点击任务卡片设置 taskType + 填入推荐问题，不自动请求
9. 状态行显示 "当前场景 / 当前任务 / 默认学科"
10. 点击教师 demo 自动切换到教师助教中心
11. 点击可视化 demo 自动切换到可视化演示中心
12. 可视化中心显示提示文案
13. 右侧知识依据保持公共展示，空状态有详细文案
14. 375px 宽度无横向滚动
