/**
 * STEMotion-MVP 全流程数据流转记录脚本
 *
 * 以「酸碱中和滴定实验」为例，记录从输入到最终生成交互式实验的全流程数据变化。
 * 在管线每一步插入数据记录，最终输出到 docs/data-flow-trace-example.md
 *
 * 用法: cd stemotion-mvp && npx tsx scripts/trace-data-flow.ts
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';

// 手动加载 .env.local（避免依赖 dotenv）
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const envPath = resolve(projectRoot, '.env.local');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // 去除引号
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  console.error(`警告: 无法读取 ${envPath}，请确保环境变量已设置。`);
}

// --- 用相对路径引入，避免 @/* alias 解析问题 ---
import { generateWithConfiguredModel } from '../src/lib/generation/llmClient';
import {
  validateInteractiveHtml,
  extractWidgetConfig,
  stripMarkdownCodeFence,
} from '../src/lib/generation/htmlSafety';
import { jsonrepair } from 'jsonrepair';

// ============================================================
// 类型定义（从 pipeline 复制，因为未导出）
// ============================================================

interface WidgetVariable {
  name: string;
  label: string;
  min: number;
  max: number;
  default: number;
  step: number;
  unit?: string;
}

interface WidgetOutline {
  widgetType: string;
  concept: string;
  visualObjects: string[];
  keyVariables: WidgetVariable[];
  interactionMechanics: string[];
  animationRequirements: string[];
  teacherTargets: Array<{ id: string; purpose: string }>;
  presets: Array<{ name: string; state: Record<string, number | string | boolean> }>;
  successCriteria: string[];
}

interface InteractionPlan {
  id: string;
  title: string;
  concept: string;
  description: string;
  interactionType: string;
  subject: string;
  gradeLevel: string;
  learningGoals: string[];
  variables: WidgetVariable[];
  outline: { title: string; steps: string[] };
  widgetOutline: WidgetOutline;
  quiz: {
    question: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
  };
}

// ============================================================
// 工具函数
// ============================================================

function parseJson(raw: string): unknown {
  const fenced = raw.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1] ?? raw;
  const match = fenced.match(/\{[\s\S]*\}/);
  const text = match ? match[0] : fenced;
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(jsonrepair(text));
  }
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ============================================================
// Trace 收集器
// ============================================================

interface TraceStep {
  stage: string;
  input: unknown;
  output: unknown;
  durationMs: number;
  notes?: string;
}

const traceSteps: TraceStep[] = [];
const startTime = Date.now();

function log(msg: string) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[${elapsed}s] ${msg}`);
}

// ============================================================
// Stage 1: planInteraction
// ============================================================

async function planInteraction(prompt: string, preferredType: string): Promise<InteractionPlan> {
  log('Stage 1: planInteraction — 调用 LLM 生成交互计划...');

  const system = `You are STEMotion InteractionPlannerAgent.
Return only valid JSON. Do not write markdown.
The user-selected interaction type is fixed: ${preferredType}. Never change it.
Online coding, programming, Python, JavaScript editor, and code runner modes are not supported.
Do not copy OpenMAIC code, UI, prompts, assets, branding, or names. Use an original STEMotion plan.

JSON shape:
{
  "id": "string",
  "title": "string",
  "concept": "string",
  "description": "string",
  "subject": "math|physics|chemistry|biology|general",
  "gradeLevel": "primary|middle_school|high_school",
  "learningGoals": ["string"],
  "variables": [{"name":"camelCase","label":"string","min":0,"max":10,"default":5,"step":1,"unit":"optional"}],
  "outline": {"title":"string","steps":["string"]},
  "widgetOutline": {
    "widgetType": "${preferredType}",
    "concept": "string",
    "visualObjects": ["string"],
    "keyVariables": [{"name":"camelCase","label":"string","min":0,"max":10,"default":5,"step":1,"unit":"optional"}],
    "interactionMechanics": ["string"],
    "animationRequirements": ["string"],
    "teacherTargets": [{"id":"#controls","purpose":"string"}],
    "presets": [{"name":"string","state":{"running":true}}],
    "successCriteria": ["string"]
  },
  "quiz": {"question":"string","options":["string"],"correctAnswer":"string","explanation":"string"}
}
Use the same language as the user.`;

  const messages = [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: prompt },
  ];

  const t0 = Date.now();
  const raw = await generateWithConfiguredModel({
    messages,
    temperature: 0.12,
    maxTokens: 131072,
  });
  const durationMs = Date.now() - t0;

  const parsed = parseJson(raw) as InteractionPlan;

  // 确保 interactionType 被锁定
  parsed.interactionType = preferredType;
  parsed.id = parsed.id || makeId('plan');

  traceSteps.push({
    stage: 'planInteraction (LLM 1)',
    input: { prompt, preferredType, systemPromptLength: system.length },
    output: parsed,
    durationMs,
    notes: `temperature=0.12, maxTokens=16000 (含 thinking budget)`,
  });

  log(`  ✓ 计划生成完成 (${durationMs}ms): "${parsed.title}"`);
  return parsed;
}

// ============================================================
// Stage 2: buildWidgetHtml
// ============================================================

async function buildWidgetHtml(plan: InteractionPlan): Promise<string> {
  log('Stage 2: buildWidgetHtml — 调用 LLM 生成交互式 HTML...');

  const shared = `You are STEMotion WidgetHtmlAgent.
Generate one complete self-contained HTML document. Return HTML only. Do not use markdown.
Do not copy OpenMAIC code, UI, prompts, assets, branding, or names.

Hard contract:
- exactly one <!DOCTYPE html> and one </html>
- inline CSS and JavaScript only
- no external scripts, styles, images, remote URLs, fetch, XMLHttpRequest, WebSocket, EventSource, import(), localStorage, sessionStorage, cookies, window.open, or nested iframes
- include <script type="application/json" id="widget-config"> with concept, variables, defaultState, messageTargets
- include #controls, #visualization, #metrics, #start-btn, #reset-btn
- use requestAnimationFrame for obvious motion or visual state changes
- implement SET_WIDGET_STATE, HIGHLIGHT_ELEMENT, ANNOTATE_ELEMENT, REVEAL_ELEMENT in a window message listener
- reset must restore all state; start/pause must be obvious
- controls must not overlap the visualization; 375px mobile layout must stack cleanly; touch targets >= 44px
- text must be Chinese if the user prompt is Chinese.

Simulation widget requirements:
- Build a real experiment surface, not a static explanation card.
- Include sliders for variables, live metrics with units, animated particles/objects/fluids/graphs, and at least two presets if useful.
- If the topic is chemistry, show vessels, drops, color or pH changes. If physics, show forces, motion, current, waves, or fields. If math, show a dynamic graph.`;

  const userContent = JSON.stringify(
    {
      title: plan.title,
      concept: plan.concept,
      description: plan.description,
      subject: plan.subject,
      gradeLevel: plan.gradeLevel,
      learningGoals: plan.learningGoals,
      variables: plan.variables,
      outline: plan.outline,
      widgetOutline: plan.widgetOutline,
    },
    null,
    2,
  );

  const messages = [
    { role: 'system' as const, content: shared },
    { role: 'user' as const, content: userContent },
  ];

  const t0 = Date.now();
  const raw = await generateWithConfiguredModel({
    messages,
    temperature: 0.24,
    maxTokens: 32000,
  });
  const durationMs = Date.now() - t0;

  const html = stripMarkdownCodeFence(raw);

  // 验证
  const validation = validateInteractiveHtml(html);

  traceSteps.push({
    stage: 'buildWidgetHtml (LLM 2)',
    input: { planTitle: plan.title, userContentLength: userContent.length },
    output: {
      htmlLength: html.length,
      htmlPreview: html.slice(0, 500) + '...',
      validationResult: validation,
    },
    durationMs,
    notes: `temperature=0.24, maxTokens=32000 (含 thinking budget)`,
  });

  if (!validation.ok) {
    log(`  ⚠ HTML 验证失败: ${validation.errors.join('; ')}`);
    log('  尝试修复...');

    const repairRaw = await generateWithConfiguredModel({
      messages: [
        {
          role: 'system',
          content: `You are STEMotion ValidationRepairAgent.
Return only a repaired complete HTML document. Do not write markdown.
Preserve the original educational idea, but fix every validation error.
Keep inline CSS/JS only. No remote resources. No fetch, XMLHttpRequest, WebSocket, EventSource, import(), storage APIs, cookies, or nested iframes.
The repaired HTML must include widget-config, requestAnimationFrame, start/reset controls, and message handlers for SET_WIDGET_STATE, HIGHLIGHT_ELEMENT, ANNOTATE_ELEMENT, REVEAL_ELEMENT.`,
        },
        {
          role: 'user',
          content: JSON.stringify({ type: plan.interactionType, validationError: validation.errors.join(' '), html }),
        },
      ],
      temperature: 0.1,
      maxTokens: 131072,
    });

    const repairedHtml = stripMarkdownCodeFence(repairRaw);
    const revalidation = validateInteractiveHtml(repairedHtml);

    traceSteps.push({
      stage: 'repairWidgetHtml (LLM 2b)',
      input: { errors: validation.errors },
      output: { htmlLength: repairedHtml.length, revalidation },
      durationMs: Date.now() - t0 - durationMs,
      notes: 'temperature=0.1, maxTokens=11000',
    });

    if (!revalidation.ok) {
      throw new Error(`HTML 修复后仍然验证失败: ${revalidation.errors.join('; ')}`);
    }

    log('  ✓ HTML 修复成功');
    return repairedHtml;
  }

  log(`  ✓ HTML 生成完成 (${durationMs}ms), ${html.length} chars, 验证通过`);
  return html;
}

// ============================================================
// Stage 3: buildTeacherActions
// ============================================================

async function buildTeacherActions(
  plan: InteractionPlan,
  targets: Array<{ id: string; purpose: string }>,
): Promise<{ actions: unknown[] }> {
  log('Stage 3: buildTeacherActions — 调用 LLM 生成教师动作...');

  const system = `You are STEMotion TeacherActionAgent.
Return only JSON: {"actions":[...]}.
Allowed action types: speech,set_widget_state,highlight_widget_element,annotate_widget_element,reveal_widget_element,show_quiz.
Use durationMs, not duration.
Targets must come from the provided target list.
Create 5 to 8 actions. They should guide the learner through the widget, not merely describe it.
Use the user's language.`;

  const userContent = JSON.stringify({
    title: plan.title,
    concept: plan.concept,
    interactionType: plan.interactionType,
    variables: plan.variables,
    targets,
    quizId: 'main_quiz',
  });

  const messages = [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: userContent },
  ];

  const t0 = Date.now();
  const raw = await generateWithConfiguredModel({
    messages,
    temperature: 0.16,
    maxTokens: 131072,
  });
  const durationMs = Date.now() - t0;

  const parsed = parseJson(raw) as { actions?: unknown[] };
  const actions = Array.isArray(parsed.actions) ? parsed.actions : [];

  traceSteps.push({
    stage: 'buildTeacherActions (LLM 3)',
    input: { planTitle: plan.title, targets },
    output: { actionCount: actions.length, actions },
    durationMs,
    notes: `temperature=0.16, maxTokens=16000 (含 thinking budget)`,
  });

  log(`  ✓ 教师动作生成完成 (${durationMs}ms), ${actions.length} 个动作`);
  return { actions };
}

// ============================================================
// Stage 4: createSchemaWithWidget (纯组装，无 LLM)
// ============================================================

function createSchemaWithWidget(
  plan: InteractionPlan,
  html: string,
  widgetConfig: Record<string, unknown>,
  actions: unknown[],
) {
  log('Stage 4: createSchemaWithWidget — 组装最终 schema...');

  const schema = {
    title: plan.title,
    description: plan.description,
    learningGoals: plan.learningGoals,
    explanationSteps: [
      {
        id: 'step_intro',
        title: '进入交互',
        narration: `先观察 ${plan.concept} 的核心对象和可调变量。`,
        actions: actions.slice(0, 2),
      },
      {
        id: 'step_explore',
        title: '动手探索',
        narration: '运行互动页，调节变量，观察动画和指标如何同步变化。',
        actions: actions.slice(2, 5),
      },
      {
        id: 'step_reflect',
        title: '总结规律',
        narration: '把观察结果和公式、概念或知识结构连接起来，再完成一个检查问题。',
        actions: actions.slice(5),
      },
    ],
    quiz: [
      {
        id: 'main_quiz',
        question: plan.quiz.question,
        options: plan.quiz.options,
        correctAnswer: plan.quiz.correctAnswer,
        explanation: plan.quiz.explanation,
      },
    ],
    htmlWidget: {
      html: `[${html.length} chars HTML]`,
      widgetType: plan.interactionType,
      widgetConfig,
      allowedMessageTypes: ['SET_WIDGET_STATE', 'HIGHLIGHT_ELEMENT', 'ANNOTATE_ELEMENT', 'REVEAL_ELEMENT'],
    },
  };

  traceSteps.push({
    stage: 'createSchemaWithWidget (纯组装)',
    input: { planTitle: plan.title, htmlLength: html.length, actionCount: actions.length },
    output: schema,
    durationMs: 0,
    notes: '无 LLM 调用，纯数据组装',
  });

  log('  ✓ Schema 组装完成');
  return { schema, fullHtml: html };
}

// ============================================================
// 输出 Markdown 报告
// ============================================================

function generateMarkdownReport(fullHtml: string): string {
  const totalDuration = traceSteps.reduce((sum, s) => sum + s.durationMs, 0);

  let md = `# STEMotion-MVP 全流程数据流转记录

> 自动生成于 ${new Date().toISOString()}
> 示例输入：「酸碱中和滴定实验」

## 管线概览

\`\`\`
输入 → planInteraction() [LLM 1] → buildWidgetHtml() [LLM 2] → buildTeacherActions() [LLM 3] → createSchemaWithWidget() → artifact
\`\`\`

总耗时: ${(totalDuration / 1000).toFixed(1)}s

---

`;

  for (const step of traceSteps) {
    md += `## ${step.stage}\n\n`;
    md += `**耗时**: ${step.durationMs}ms\n`;
    if (step.notes) md += `**参数**: ${step.notes}\n`;
    md += `\n### 输入\n\n\`\`\`json\n${JSON.stringify(step.input, null, 2)}\n\`\`\`\n\n`;
    md += `### 输出\n\n\`\`\`json\n${JSON.stringify(step.output, null, 2).slice(0, 5000)}\n\`\`\`\n\n`;
    md += `---\n\n`;
  }

  // 附录：完整 HTML（截取前 3000 字符）
  md += `## 附录：生成的完整 HTML（前 3000 字符）\n\n`;
  md += `\`\`\`html\n${fullHtml.slice(0, 3000)}\n\`\`\`\n`;

  return md;
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  const INPUT_PROMPT = '生成一个酸碱中和滴定实验的模拟实验，让学生可以调节酸碱溶液体积和浓度，观察 pH 变化和指示剂颜色变化。';
  const PREFERRED_TYPE = 'simulation';

  console.log('='.repeat(60));
  console.log('STEMotion-MVP 全流程数据流转记录');
  console.log('='.repeat(60));
  console.log(`输入: "${INPUT_PROMPT}"`);
  console.log(`类型: ${PREFERRED_TYPE}`);
  console.log('='.repeat(60));
  console.log('');

  // Stage 1
  const plan = await planInteraction(INPUT_PROMPT, PREFERRED_TYPE);

  // Stage 2
  const html = await buildWidgetHtml(plan);

  // 提取 widget config
  let widgetConfig: Record<string, unknown>;
  try {
    widgetConfig = extractWidgetConfig(html);
  } catch {
    widgetConfig = {
      concept: plan.concept,
      variables: plan.variables,
      defaultState: Object.fromEntries(plan.variables.map((v) => [v.name, v.default])),
      messageTargets: plan.widgetOutline.teacherTargets,
    };
  }

  // 获取 targets
  const targets: Array<{ id: string; purpose: string }> = Array.isArray(widgetConfig.messageTargets)
    ? (widgetConfig.messageTargets as Array<{ id: string; purpose: string }>)
    : plan.widgetOutline.teacherTargets;

  // Stage 3
  const teacher = await buildTeacherActions(plan, targets);

  // Stage 4
  const { fullHtml } = createSchemaWithWidget(plan, html, widgetConfig, teacher.actions);

  // 生成报告
  const report = generateMarkdownReport(fullHtml);
  const outDir = resolve(projectRoot, 'docs');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'data-flow-trace-example.md');
  writeFileSync(outPath, report, 'utf-8');

  console.log('');
  console.log('='.repeat(60));
  log(`✓ 报告已写入: ${outPath}`);
  console.log('='.repeat(60));
}

main().catch((err) => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
