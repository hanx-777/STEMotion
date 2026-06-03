# RAG Interactive HTML maxTokens 截断修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 RAG 主路径 `generateInteractiveHtml` 因 `maxTokens=4000` 频繁触发 `LlmTruncationError` 导致用户看到「检索本地课程资料 … 模型输出被截断」的错误体验。

**Architecture:**
1. **调大 token 上限**：把 `src/lib/rag/visualization/htmlGenerator.ts:23` 的 `maxTokens` 从 `4000` 调到与同模块 `auditPipeline.ts:321` / `agentWidgetPipeline.ts` 一致的 `32768`（保留一倍头部容量，避免成为 deep-interaction 那条线 131072 的整数倍 RPS）。同时把硬编码常量提到模块顶层以便单元测试断言。
2. **复用截断兜底**：`generateInteractiveHtml` 在 `catch(LlmTruncationError)` 时不再向上抛，改为：(a) 保留 `error.partialContent`；(b) 走 `patchTruncatedHtml`（`src/lib/generation/htmlSafety.ts:169`，专为 truncation 设计的程序化补丁）后再走 `cleanAndValidateHtml`。这与 `agentWidgetPipeline.ts:627` 已验证的策略一致，不引入新概念。
3. **UI 错误归因修正**：`src/features/rag/ui/SubjectRagConsole.tsx:573-585` 当前 `catch` 把任何 `running` 阶段标成 `error`，而抛错时 `running` 仍是 `retrieve_local`，导致用户以为检索失败。改成基于 `err` 的语义把"`LlmTruncationError`/可视化相关错误"明确标到 `visualization` 阶段；同时把检索阶段标 `completed` 或 `skipped`。

**Tech Stack:** Next.js 16.2.6 App Router · React 19.2.4 · TypeScript · `node --test` + `tsx` (project 测试约定见 `package.json` script `"test": "tsx --test tests/*.ts"`)。

---

## File Structure

新增 / 修改 / 测试一览（每个文件单一职责）：

- **修改** `src/lib/rag/visualization/htmlGenerator.ts`
  - 抽出 `HTML_GENERATION_MAX_TOKENS = 32768` 顶层常量。
  - 增加 `catch (LlmTruncationError)` 分支：用 `patchTruncatedHtml(error.partialContent)` 兜底。
  - `cleanAndValidateHtml` 中"`<html`/`</html>` 缺失即抛"改为先尝试 `patchTruncatedHtml` 再判断。
- **修改** `src/features/rag/ui/SubjectRagConsole.tsx`
  - `ask()` 的 `catch (err)` 分支：区分"主请求失败"和"在 RAG 主请求已成功、仅可视化失败"，避免错把 `retrieve_local` 标 `error`。
  - `startVisualizationGeneration()` catch 已经正确标 `visualization=error`，无需重复。
- **新增测试** `tests/test_visualization_html_generator.ts`
  - 断言 `HTML_GENERATION_MAX_TOKENS === 32768`。
  - 断言 `generateInteractiveHtml` 把 `maxTokens` 传给 `generateWithConfiguredModel`（依赖注入替换）。
  - 断言截断异常时 `partialContent` 被 patch 后输出包含 `</html>` 闭合且不再抛 `LlmTruncationError`。
- **新增测试** `tests/test_subject_rag_console_error_attribution.ts`
  - 仅测试纯函数 `attributeAskError`（下文 Task 4 提取的可测试工具），确保 truncation 错误归到 `visualization` 阶段、网络错误归到 `running` 阶段。

依赖现有：
- `src/lib/generation/llmClient.ts`：导出 `LlmTruncationError`（已存在，见 `llmClient.ts:20`）。
- `src/lib/generation/htmlSafety.ts`：导出 `patchTruncatedHtml`、`stripMarkdownCodeFence`（已存在）。

---

## Pre-Task：必读资料

- [ ] 阅读 `AGENTS.md` —— 工程约定：Next.js 16 与 React 19 的 API 与训练数据可能不同，写代码前确认。
- [ ] 阅读 `src/lib/generation/llmClient.ts:20-29`（`LlmTruncationError` 定义，含 `partialContent`、`outputTokens`、`maxTokens` 字段）。
- [ ] 阅读 `src/lib/generation/htmlSafety.ts:164-260`（`patchTruncatedHtml` 实现）。
- [ ] 阅读 `src/lib/deep-interaction/agentWidgetPipeline.ts:590-650`（参考"截断 → patch → 再校验 → repair agent"完整三层兜底）。
- [ ] 阅读 `src/lib/rag/visualization/auditPipeline.ts:303-336`（同仓库 `generateRagWidgetHtml` 已经在用 `partialContent` 兜底的成熟范式）。
- [ ] 测试运行约定：`npm run test` 等价于 `tsx --test tests/*.ts`；可单跑 `tsx --test tests/test_visualization_html_generator.ts`。

---

### Task 1: 抽常量、调大 maxTokens

**Files:**
- Modify: `src/lib/rag/visualization/htmlGenerator.ts:1-28`
- Test: `tests/test_visualization_html_generator.ts`

- [ ] **Step 1: 写第一个失败的测试 —— 常量值**

新建 `tests/test_visualization_html_generator.ts`：

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { HTML_GENERATION_MAX_TOKENS } from '../src/lib/rag/visualization/htmlGenerator';

test('HTML_GENERATION_MAX_TOKENS is at least 32k to fit a self-contained interactive widget', () => {
  assert.equal(HTML_GENERATION_MAX_TOKENS, 32768);
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npx tsx --test tests/test_visualization_html_generator.ts`
Expected: FAIL，`HTML_GENERATION_MAX_TOKENS` 未导出（`SyntaxError: The requested module ... does not provide an export named 'HTML_GENERATION_MAX_TOKENS'`）。

- [ ] **Step 3: 修改实现 —— 抽常量并替换 4000**

编辑 `src/lib/rag/visualization/htmlGenerator.ts`：

```ts
import { generateWithConfiguredModel } from '@/lib/generation/llmClient';
import type { RagVisualizationBrief } from './types';

/**
 * HTML 生成的最大输出 token 数。
 * 单一交互式 HTML 通常 6k–15k tokens，给一倍头部容量避免边界截断。
 * 与 src/lib/rag/visualization/auditPipeline.ts:321 的更宽松上限对齐策略，
 * 但仅取它的 1/4，因为本路径不走多 Agent 评审，无需保留补救预算。
 */
export const HTML_GENERATION_MAX_TOKENS = 32768;

export interface HtmlGenerationInput {
  question: string;
  answerText: string;
  visualizationType: string;
  extractedParameters: Record<string, unknown>;
  formulaBlocks?: Array<{ latex: string; explanation?: string }>;
  finalResults?: Array<{ label: string; value: string; unit?: string }>;
  brief?: RagVisualizationBrief;
}

export async function generateInteractiveHtml(input: HtmlGenerationInput): Promise<string> {
  const prompt = buildHtmlGenerationPrompt(input);

  const html = await generateWithConfiguredModel({
    messages: [
      { role: 'system', content: HTML_GENERATION_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    temperature: 0.3,
    maxTokens: HTML_GENERATION_MAX_TOKENS,
    stream: false,
  });

  return cleanAndValidateHtml(html);
}
```

（`buildHtmlGenerationPrompt`、`HTML_GENERATION_SYSTEM_PROMPT`、`cleanAndValidateHtml` 函数体保持原样，本步骤仅修改文件顶部到 `generateInteractiveHtml` 函数末尾。）

- [ ] **Step 4: 跑测试，确认通过**

Run: `npx tsx --test tests/test_visualization_html_generator.ts`
Expected: PASS（1/1 tests passed）。

- [ ] **Step 5: 跑同模块的既有测试，确认未回归**

Run: `npx tsx --test tests/test_rag_visualization_orchestrator.ts tests/test_rag_visualization_brief.ts tests/test_visualization_spec.ts`
Expected: 全部 PASS（这三个测试都使用注入式 `htmlGenerator`，本次改动不应影响它们）。

- [ ] **Step 6: 提交**

```bash
git add src/lib/rag/visualization/htmlGenerator.ts tests/test_visualization_html_generator.ts
git commit -m "fix(rag-viz): raise interactive HTML maxTokens from 4000 to 32768

The hard-coded 4000-token cap was triggering LlmTruncationError on any
non-trivial self-contained widget (Canvas + sliders + RAF easily exceeds
that). Aligns with auditPipeline.ts and agentWidgetPipeline.ts policy.
Extracts HTML_GENERATION_MAX_TOKENS as a named export for testability."
```

---

### Task 2: 截断兜底 —— `generateInteractiveHtml` 接住 `LlmTruncationError`

**Files:**
- Modify: `src/lib/rag/visualization/htmlGenerator.ts:14-28`
- Test: `tests/test_visualization_html_generator.ts`

- [ ] **Step 1: 写失败测试 —— 截断后 patch 兜底**

向 `tests/test_visualization_html_generator.ts` 追加：

```ts
import { generateInteractiveHtml } from '../src/lib/rag/visualization/htmlGenerator';
import { LlmTruncationError } from '../src/lib/generation/llmClient';

test('generateInteractiveHtml recovers truncated output via patchTruncatedHtml', async (t) => {
  // Stub generateWithConfiguredModel to simulate truncation.
  const llmModule = await import('../src/lib/generation/llmClient');
  const originalGen = llmModule.generateWithConfiguredModel;

  const partialHtml = [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head><meta charset="utf-8"><title>抛体运动</title></head>',
    '<body>',
    '  <canvas id="stage" width="600" height="400"></canvas>',
    '  <input type="range" id="angle" min="0" max="90" value="45">',
    '  <button id="start">开始</button>',
    '  <script>',
    '    const ctx = document.getElementById("stage").getContext("2d");',
    // intentionally cut mid-function — no </script>, no </body>, no </html>
  ].join('\n');

  (llmModule as unknown as { generateWithConfiguredModel: typeof originalGen }).generateWithConfiguredModel =
    async () => { throw new LlmTruncationError(32768, 32768, partialHtml); };

  t.after(() => {
    (llmModule as unknown as { generateWithConfiguredModel: typeof originalGen }).generateWithConfiguredModel = originalGen;
  });

  const html = await generateInteractiveHtml({
    question: '以 30° 抛出，求射程',
    answerText: '射程 = v0^2 * sin(2θ) / g',
    visualizationType: 'projectile_motion',
    extractedParameters: { angleDeg: 30, v0: 20 },
  });

  assert.ok(html.includes('</html>'), 'patched output must close <html>');
  assert.ok(html.includes('</script>'), 'patched output must close <script>');
  assert.ok(html.startsWith('<!DOCTYPE html>'), 'patched output keeps DOCTYPE');
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npx tsx --test tests/test_visualization_html_generator.ts`
Expected: FAIL，错误为 `LlmTruncationError: 模型输出被截断：已生成 32768 tokens 达到上限，内容不完整。` —— 因为 `generateInteractiveHtml` 当前不接住。

- [ ] **Step 3: 修改实现 —— catch 截断并 patch**

替换 `src/lib/rag/visualization/htmlGenerator.ts` 顶部 import 和 `generateInteractiveHtml`：

```ts
import { generateWithConfiguredModel, LlmTruncationError } from '@/lib/generation/llmClient';
import { patchTruncatedHtml } from '@/lib/generation/htmlSafety';
import { createLogger } from '@/lib/logger';
import type { RagVisualizationBrief } from './types';

const log = createLogger('rag-viz-html');

export const HTML_GENERATION_MAX_TOKENS = 32768;

export interface HtmlGenerationInput {
  question: string;
  answerText: string;
  visualizationType: string;
  extractedParameters: Record<string, unknown>;
  formulaBlocks?: Array<{ latex: string; explanation?: string }>;
  finalResults?: Array<{ label: string; value: string; unit?: string }>;
  brief?: RagVisualizationBrief;
}

export async function generateInteractiveHtml(input: HtmlGenerationInput): Promise<string> {
  const prompt = buildHtmlGenerationPrompt(input);

  let raw: string;
  try {
    raw = await generateWithConfiguredModel({
      messages: [
        { role: 'system', content: HTML_GENERATION_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      maxTokens: HTML_GENERATION_MAX_TOKENS,
      stream: false,
    });
  } catch (error) {
    if (error instanceof LlmTruncationError) {
      log.warn('Interactive HTML output truncated — patching partial content', {
        outputTokens: error.outputTokens,
        maxTokens: error.maxTokens,
        partialChars: error.partialContent.length,
      });
      raw = patchTruncatedHtml(error.partialContent);
    } else {
      throw error;
    }
  }

  return cleanAndValidateHtml(raw);
}
```

- [ ] **Step 4: 调整 `cleanAndValidateHtml` 让 patch 过的 HTML 通过校验**

继续编辑同一文件，把 `cleanAndValidateHtml` 改为先 patch 再校验：

```ts
function cleanAndValidateHtml(html: string): string {
  // Remove markdown code fences if present
  let cleaned = html.replace(/^```html\n?/i, '').replace(/\n?```$/i, '');

  // Ensure DOCTYPE
  if (!cleaned.includes('<!DOCTYPE')) {
    cleaned = '<!DOCTYPE html>\n' + cleaned;
  }

  // If still missing structural tags (e.g. truncated mid-tag and Task-2 patch didn't run),
  // do one more patch pass before failing hard.
  if (!cleaned.includes('<html') || !cleaned.includes('</html>')) {
    cleaned = patchTruncatedHtml(cleaned);
  }

  if (!cleaned.includes('<html') || !cleaned.includes('</html>')) {
    throw new Error('Generated HTML is incomplete');
  }

  return cleaned.trim();
}
```

- [ ] **Step 5: 跑测试，确认通过**

Run: `npx tsx --test tests/test_visualization_html_generator.ts`
Expected: PASS（2/2 tests passed）。

- [ ] **Step 6: 跑全套可视化测试，确认未回归**

Run: `npx tsx --test tests/test_rag_visualization_orchestrator.ts tests/test_rag_visualization_brief.ts tests/test_rag_visualization_audit_pipeline.ts tests/test_rag_visualization_artifact_adapter.ts tests/test_visualization_spec.ts tests/test_visualization_quality.ts`
Expected: 全部 PASS。

- [ ] **Step 7: 提交**

```bash
git add src/lib/rag/visualization/htmlGenerator.ts tests/test_visualization_html_generator.ts
git commit -m "fix(rag-viz): recover truncated interactive HTML via patchTruncatedHtml

Mirrors the recovery path already used by agentWidgetPipeline.ts and
auditPipeline.ts: catch LlmTruncationError, hand error.partialContent to
patchTruncatedHtml so callers get a closed, validatable document instead
of a hard failure."
```

---

### Task 3: 提取纯函数 `attributeAskError`（为 UI 修复打基础）

**Files:**
- Create: `src/features/rag/state/ragAskErrorAttribution.ts`
- Test: `tests/test_subject_rag_console_error_attribution.ts`

- [ ] **Step 1: 写失败测试**

新建 `tests/test_subject_rag_console_error_attribution.ts`：

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { attributeAskError } from '../src/features/rag/state/ragAskErrorAttribution';
import { LlmTruncationError } from '../src/lib/generation/llmClient';

test('LlmTruncationError is attributed to the visualization stage', () => {
  const err = new LlmTruncationError(4000, 4000, '<html>partial');
  const result = attributeAskError(err);
  assert.equal(result.stageId, 'visualization');
  assert.equal(result.userMessage.includes('可视化'), true);
});

test('plain network errors stay attributed to the running stage', () => {
  const err = new TypeError('Failed to fetch');
  const result = attributeAskError(err);
  assert.equal(result.stageId, null); // null means "fail the currently-running stage"
  assert.equal(result.userMessage, 'Failed to fetch');
});

test('non-Error values fall back to a generic message', () => {
  const result = attributeAskError('boom');
  assert.equal(result.stageId, null);
  assert.equal(result.userMessage, '问答请求失败');
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npx tsx --test tests/test_subject_rag_console_error_attribution.ts`
Expected: FAIL，`Cannot find module ... ragAskErrorAttribution`。

- [ ] **Step 3: 实现纯函数**

新建 `src/features/rag/state/ragAskErrorAttribution.ts`：

```ts
import { LlmTruncationError } from '@/lib/generation/llmClient';
import type { ProgressStage } from '@/lib/progress/progressTypes';

export interface AskErrorAttribution {
  /** 要标 error 的目标阶段；null 表示对当前 `running` 阶段就地标 error。 */
  stageId: ProgressStage['id'] | null;
  /** 给用户展示的中文错误信息。 */
  userMessage: string;
}

export function attributeAskError(err: unknown): AskErrorAttribution {
  if (err instanceof LlmTruncationError) {
    return {
      stageId: 'visualization',
      userMessage: `互动可视化生成超出模型输出上限（${err.outputTokens}/${err.maxTokens} tokens）。检索和回答已完成，但 HTML 生成被截断。`,
    };
  }

  if (err instanceof Error) {
    return { stageId: null, userMessage: err.message };
  }

  return { stageId: null, userMessage: '问答请求失败' };
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `npx tsx --test tests/test_subject_rag_console_error_attribution.ts`
Expected: PASS（3/3 tests passed）。

- [ ] **Step 5: 提交**

```bash
git add src/features/rag/state/ragAskErrorAttribution.ts tests/test_subject_rag_console_error_attribution.ts
git commit -m "feat(rag-ui): add attributeAskError to route errors to the right stage

Pure helper used by SubjectRagConsole.ask() so that an HTML-generation
LlmTruncationError no longer marks 'retrieve_local' as failed when in
fact retrieval succeeded and only the visualization step exceeded its
token budget."
```

---

### Task 4: 在 `SubjectRagConsole.ask()` 接入 `attributeAskError`

**Files:**
- Modify: `src/features/rag/ui/SubjectRagConsole.tsx:22` (imports)
- Modify: `src/features/rag/ui/SubjectRagConsole.tsx:573-608` (catch 分支)

- [ ] **Step 1: 在文件顶部新增 import**

打开 `src/features/rag/ui/SubjectRagConsole.tsx`，找到现有这一行（约 line 22）：

```tsx
import { askRagFromBrowser } from '@/features/rag/client/ragClient';
```

在它正下方插入：

```tsx
import { attributeAskError } from '@/features/rag/state/ragAskErrorAttribution';
```

- [ ] **Step 2: 替换 `catch (err)` 分支为带归因的版本**

定位 `ask` 函数中的现有 catch 块（line 573-608）：

```tsx
    } catch (err) {
      setProgressModel((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          message: '生成失败',
          stages: prev.stages.map((s) =>
            s.status === 'running'
              ? { ...s, status: 'error' as const, detail: err instanceof Error ? err.message : '请求失败' }
              : s,
          ),
        };
      });

      const message = err instanceof Error ? err.message : '问答请求失败';
      toast.error('生成失败，请重试');
```

整体替换为：

```tsx
    } catch (err) {
      const attribution = attributeAskError(err);
      setProgressModel((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          message: '生成失败',
          stages: prev.stages.map((s) => {
            if (attribution.stageId !== null) {
              // Route the error to a specific stage; mark anything still running as completed
              // so the UI doesn't claim "检索失败" when retrieval actually succeeded.
              if (s.id === attribution.stageId) {
                return { ...s, status: 'error' as const, detail: attribution.userMessage };
              }
              if (s.status === 'running') {
                return { ...s, status: 'completed' as const, completedAt: Date.now() };
              }
              return s;
            }
            // No specific attribution — fail whichever stage is running (legacy behavior).
            return s.status === 'running'
              ? { ...s, status: 'error' as const, detail: attribution.userMessage }
              : s;
          }),
        };
      });

      const message = attribution.userMessage;
      toast.error('生成失败，请重试');
```

`catch` 块剩余部分（`if (activeDemo) { ... } else { setError(message); }` 直到 `finally`）保持不变。

- [ ] **Step 3: 类型检查**

Run: `npm run typecheck`
Expected: 无 TypeScript 错误。如果报 `ProgressStage.id` 类型不匹配 `'visualization'`，回头确认 Task 3 中的 import 是否引用了 `progressTypes` 真实导出（否则用 `as const`）。

- [ ] **Step 4: 跑全部测试，确认未回归**

Run: `npm test`
Expected: 全部 PASS，包括新增的 5 个 case（Task 1 + Task 2 + Task 3）。

- [ ] **Step 5: 提交**

```bash
git add src/features/rag/ui/SubjectRagConsole.tsx
git commit -m "fix(rag-ui): route HTML-truncation errors to the visualization stage

Before: any error in ask() turned the currently-running stage red. Since
the visualization HTML is generated *after* retrieve_local completes via
askRagFromBrowser, an LlmTruncationError visually blamed retrieval.

Now: attributeAskError pins LlmTruncationError to the visualization stage
and marks earlier 'running' stages as completed, matching what really
happened in the pipeline."
```

---

### Task 5: 手工冒烟（无法在 node test 里覆盖的部分）

**Files:** 无代码改动。

- [ ] **Step 1: 启动 dev server**

Run: `npm run dev`
Expected: `▲ Next.js 16.2.6 - Local: http://localhost:3001`，无启动报错。

- [ ] **Step 2: 在 `/student` 提一道会触发 HTML 可视化的物理题**

打开 http://localhost:3001/student ，问"以 30° 抛出，初速度 20 m/s，求落地点距离"。打开 DevTools Network 面板观察 `POST /api/v1/rag/visualization/generate`。

Expected：
- 进度条 "检索本地课程资料" 走 `completed`，不再卡在或标红。
- 若 HTML 生成成功，"生成可视化提示" 走 `completed` 并显示互动 HTML。
- 若仍发生截断（在更夸张的题目下可能），错误信息为 "互动可视化生成超出模型输出上限 …"，并标在 `visualization` 阶段而非 `retrieve_local`。

- [ ] **Step 3: 关闭 dev server，记录截图**

把成功 / 失败两种状态的进度条截图保存到 `docs/superpowers/plans/assets/2026-06-01-rag-html-maxtokens-truncation-fix-*.png`（如果用户需要归档）。这一步是 informational，无 commit。

---

## Self-Review

**1. Spec coverage**

| Spec 要点 | 落点 |
| --- | --- |
| 把 `maxTokens` 从 4000 调大 | Task 1 |
| 暴露常量便于测试 | Task 1（`HTML_GENERATION_MAX_TOKENS` 导出） |
| 截断兜底（patchTruncatedHtml） | Task 2 |
| UI 错误归因修正 | Task 3（纯函数）+ Task 4（接入） |
| 不破坏既有可视化测试 | Task 1 step 5、Task 2 step 6、Task 4 step 4 |

**2. Placeholder scan** — 已检查："TBD/TODO/etc." 未出现；每个修改都有完整代码块；测试断言具体；命令行参数完整。

**3. Type consistency** —
- `attributeAskError` 在 Task 3 定义返回 `{ stageId: ProgressStage['id'] | null; userMessage: string }`，Task 4 使用一致的字段名。
- `LlmTruncationError` 的 `outputTokens`/`maxTokens`/`partialContent` 字段名与 `src/lib/generation/llmClient.ts:20-29` 定义一致。
- `patchTruncatedHtml(html: string): string` 签名与 `src/lib/generation/htmlSafety.ts:169` 一致。
- `HTML_GENERATION_MAX_TOKENS` 在 Task 1、Task 2、测试中名称一致。

无需返工。
