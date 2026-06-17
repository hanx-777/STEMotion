import { generateWithConfiguredModel } from '@/lib/generation/llmClient';
import { parseJsonResponse } from '@/lib/generation/jsonParser';
import { createLogger } from '@/lib/logger';
import { createRagVisualizationBrief } from './briefAgent';
import { buildRagVisualizationDesignContext } from './designContext';
import {
  buildCompactVisualizationSpecContext,
  formatCompactVisualizationSpecContext,
} from './specContext';
import type {
  RagVisualizationGenerationPlan,
  RagVisualizationNarrationStep,
  RagVisualizationVariable,
  VisualizationSpec,
  VisualizationType,
} from './types';
import type { RagLightweightVisualizationPlan } from './lightweight_rag_visualization_agents';

const log = createLogger('rag-visualization-planner');

export interface RagVisualizationPlanningInput {
  question: string;
  answerText?: string;
  subject: string;
  taskType: string;
  formulaBlocks?: Array<{ latex: string; explanation?: string }>;
  finalResults?: Array<{ label: string; value: string; unit?: string }>;
  preferredType?: VisualizationType;
  visualizationSpec?: VisualizationSpec;
}

export interface RagVisualizationPlanningOptions {
  plannerModel?: (prompt: string) => Promise<string>;
  /**
   * Round 002B perf fix: When true, skip the LLM planning call entirely and
   * use convertLightweightPlanToGenerationPlan() instead. Must pass lightweightPlan.
   */
  skipLlmCall?: boolean;
  lightweightPlanForConversion?: RagLightweightVisualizationPlan;
}

/**
 * Round 002B: Convert a RagLightweightVisualizationPlan (pure, no LLM) to
 * the RagVisualizationGenerationPlan format required by auditPipeline.
 *
 * This allows skipping the 99.5s LLM planning call when the lightweight plan
 * already captures all the necessary structure.
 *
 * Improvement over the initial version:
 *   - Extracts real variable values from formulaBlocks text and answerText
 *   - Derives a precise knowledgePoint from domain + question semantics
 *   - Generates domain-specific + formula-aware animationRequirements
 *   - Produces richer rightPanelNarration (5–6 pedagogical steps)
 *   - Adds formula preservation and edge-case checks to successCriteria
 *   - Specifies concrete slider ranges and step labels in controls
 */
export function convertLightweightPlanToGenerationPlan(
  input: RagVisualizationPlanningInput,
  lightweightPlan: RagLightweightVisualizationPlan,
): RagVisualizationGenerationPlan {
  const domainModel = lightweightPlan.domainModel;
  const taskPlan = lightweightPlan.taskPlan;
  const visualizationMapping = lightweightPlan.visualizationMapping;
  const layoutPlan = lightweightPlan.layoutPlan;
  const variables = buildVariables(input, domainModel);
  const knowledgePoint = deriveKnowledgePoint(input, taskPlan, domainModel);
  const metrics = buildMetrics(input, visualizationMapping);
  const animationRequirements = buildAnimationRequirements(input, domainModel, visualizationMapping);
  const controls = buildControls(visualizationMapping, variables);
  const successCriteria = buildSuccessCriteria(input, taskPlan, domainModel, layoutPlan, variables);
  const rightPanelNarration = buildRightPanelNarration(input, taskPlan, domainModel, variables);

  return {
    shouldGenerate: true,
    problemRestatement: input.question.slice(0, 400),
    knowledgePoint,
    variables,
    visualObjects: visualizationMapping.visualObjects.slice(0, 8),
    controls,
    metrics,
    animationRequirements,
    successCriteria,
    rightPanelNarration,
    recommendedType: 'interactive_html',
    confidence: 0.85,
  };
}

// ─── Plan builder helpers ─────────────────────────────────────────────────────

type DomainModelLW = import('./lightweight_rag_visualization_agents').RagDomainModel;
type VisMappingLW = import('./lightweight_rag_visualization_agents').RagVisualizationMapping;
type TaskPlanLW = import('./lightweight_rag_visualization_agents').RagVisualizationTaskPlan;
type UILayoutLW = import('./lightweight_rag_visualization_agents').RagUILayoutPlan;

function buildVariables(
  input: RagVisualizationPlanningInput,
  domainModel: DomainModelLW,
): RagVisualizationVariable[] {
  const formulaText = (input.formulaBlocks ?? []).map((f) => `${f.latex} ${f.explanation ?? ''}`).join(' ');
  const answerText = input.answerText ?? '';

  const variables: RagVisualizationVariable[] = domainModel.variables.slice(0, 8).map((v) => ({
    name: v.name,
    label: v.label ?? v.name,
    value: extractValueFromText(v.name, v.label ?? v.name, formulaText, answerText) ?? 'unknown',
    unit: v.unit,
    role: v.role,
  }));

  for (const result of (input.finalResults ?? []).slice(0, 6)) {
    const existing = variables.find(
      (v) => v.label === result.label || v.name === sanitizeName(result.label) || labelsMatch(v.label, result.label),
    );
    if (existing) {
      existing.value = result.value;
      if (result.unit) existing.unit = result.unit;
      existing.role = 'output';
    } else {
      variables.push({ name: sanitizeName(result.label), label: result.label, value: result.value, unit: result.unit, role: 'output' });
    }
  }

  if (variables.length === 0) variables.push({ name: 'x', label: '主要变量', value: 'unknown', role: 'control' });
  return variables;
}

function deriveKnowledgePoint(
  input: RagVisualizationPlanningInput,
  taskPlan: TaskPlanLW,
  domainModel: DomainModelLW,
): string {
  const q = input.question;
  const d = domainModel.domain;

  if (d === 'physics') {
    if (/斜抛|projectile|抛体/.test(q)) return '斜抛运动（抛体运动）';
    if (/平抛/.test(q)) return '平抛运动';
    if (/碰撞|collision/.test(q)) return '动量守恒与碰撞';
    if (/简谐|振动|SHM/.test(q)) return '简谐运动';
    if (/圆周|centripetal/.test(q)) return '匀速圆周运动';
    if (/浮力|buoyancy|archimedes/.test(q)) return '浮力与阿基米德定律';
    if (/弹簧|胡克|Hooke/.test(q)) return '弹力与胡克定律';
    if (/电场|electric field/.test(q)) return '电场与电力线';
    if (/楞次|感应|induction/.test(q)) return '电磁感应定律';
    return taskPlan.coreGoal.slice(0, 40) || '物理力学原理';
  }
  if (d === 'math') {
    if (/导数|derivative/.test(q)) return '导数与函数单调性';
    if (/积分|integral/.test(q)) return '定积分与面积';
    if (/极值|maximum|minimum/.test(q)) return '函数极值与最优化';
    if (/向量|vector/.test(q)) return '向量运算';
    if (/概率|probability/.test(q)) return '概率分布';
    return taskPlan.coreGoal.slice(0, 40) || '数学函数关系';
  }
  if (d === 'algorithm') {
    if (/BST|二叉搜索树|binary search tree/.test(q)) return '二叉搜索树（BST）插入与查找';
    if (/排序|sort/.test(q)) return '排序算法步骤';
    if (/栈|stack/.test(q)) return '栈的操作与应用';
    if (/队列|queue/.test(q)) return '队列的操作与应用';
    if (/图|graph|DFS|BFS/.test(q)) return '图的遍历算法';
    if (/动态规划|DP/.test(q)) return '动态规划状态转移';
    return taskPlan.coreGoal.slice(0, 40) || '算法执行过程';
  }
  if (d === 'computer_network') {
    if (/TCP|握手|handshake/.test(q)) return 'TCP 三次握手协议';
    if (/HTTP|HTTPS/.test(q)) return 'HTTP 请求响应过程';
    if (/拥塞|congestion/.test(q)) return 'TCP 拥塞控制';
    if (/DNS/.test(q)) return 'DNS 域名解析过程';
    return taskPlan.coreGoal.slice(0, 40) || '网络协议原理';
  }
  if (d === 'machine_learning') {
    if (/梯度下降|gradient descent/.test(q)) return '梯度下降优化算法';
    if (/反向传播|backprop/.test(q)) return '反向传播算法';
    if (/损失|loss/.test(q)) return '损失函数与优化过程';
    return taskPlan.coreGoal.slice(0, 40) || '机器学习算法原理';
  }
  if (d === 'chemistry') {
    if (/滴定|titration/.test(q)) return '酸碱滴定与 pH 变化';
    if (/平衡|equilibrium/.test(q)) return '化学平衡原理';
    return taskPlan.coreGoal.slice(0, 40) || '化学反应原理';
  }
  return taskPlan.coreGoal.slice(0, 60) || input.question.slice(0, 60);
}

function buildMetrics(input: RagVisualizationPlanningInput, mapping: VisMappingLW): string[] {
  const fromResults = (input.finalResults ?? []).slice(0, 4).map((r) => `${r.label}: ${r.value}${r.unit ?? ''}`);
  const fromMapping = mapping.metricsOrLabels.filter((m) => !fromResults.some((r) => r.includes(m.split(':')[0]))).slice(0, 4);
  return [...fromResults, ...fromMapping].filter((v, i, a) => a.indexOf(v) === i).slice(0, 6);
}

function buildAnimationRequirements(
  input: RagVisualizationPlanningInput,
  domainModel: DomainModelLW,
  mapping: VisMappingLW,
): string[] {
  const explicit = mapping.animationSteps.filter((s) => !s.startsWith('Show state:')).slice(0, 3);
  const formulaSteps = (input.formulaBlocks ?? []).slice(0, 2)
    .filter((fb) => fb.explanation)
    .map((fb) => `动态展示推导：${fb.explanation}（${fb.latex.slice(0, 35)}）`);
  const domain = buildDomainAnimSteps(domainModel.domain, input.question);
  return [...explicit, ...formulaSteps, ...domain].filter((v, i, a) => a.indexOf(v) === i).slice(0, 6);
}

function buildDomainAnimSteps(domain: string, q: string): string[] {
  if (domain === 'physics') {
    if (/斜抛|projectile/.test(q)) return ['实时绘制 v_x, v_y 速度箭头', '绘制完整抛物线轨迹同步显示 x(t), y(t)', '最高点高亮 v_y=0 和最大高度 H', '落地显示射程 R 和飞行时间 t'];
    if (/碰撞/.test(q)) return ['碰撞前显示速度箭头和动量值', '碰撞瞬间高亮接触区', '碰撞后更新速度箭头验证 Δp=0'];
    return ['箭头显示物理量随时间变化', '高亮状态转折点', '显示守恒量验证'];
  }
  if (domain === 'math') return ['动态绘制函数曲线支持参数调节', '高亮极值/零点/拐点', '显示切线斜率动态变化'];
  if (domain === 'algorithm') return ['每步高亮当前活动节点/索引', '显示比较计数器和操作序列', '终止条件高亮显示最终状态'];
  if (domain === 'computer_network') return ['时间轴逐帧显示数据包流转', '高亮当前协议状态', '显示超时重传或连接建立动画'];
  if (domain === 'machine_learning') return ['损失曲面上显示当前参数位置', '每迭代更新损失值和梯度箭头', '绘制损失随迭代变化的曲线'];
  if (domain === 'chemistry') return ['随滴加体积动态更新 pH 曲线', '等当点高亮显示 pH', '同步更新烧杯颜色'];
  return ['动态显示变量随时间/步骤变化', '高亮关键状态转折点'];
}

function buildControls(mapping: VisMappingLW, variables: RagVisualizationVariable[]): string[] {
  const enriched = mapping.interactionModel.map((ctrl) => {
    for (const v of variables) {
      const hit = ctrl.toLowerCase().includes(v.name.toLowerCase()) || ctrl.toLowerCase().includes((v.label ?? '').toLowerCase());
      if (hit && v.value !== 'unknown' && !ctrl.includes(v.value)) {
        return `${ctrl}（默认值：${v.value}${v.unit ?? ''}）`;
      }
    }
    return ctrl;
  });
  return ensureCoreControls(enriched.slice(0, 6));
}

function buildSuccessCriteria(
  input: RagVisualizationPlanningInput,
  taskPlan: TaskPlanLW,
  domainModel: DomainModelLW,
  layoutPlan: UILayoutLW,
  variables: RagVisualizationVariable[],
): string[] {
  const criteria = [
    'id="visualization" 主舞台占宽度 ≥65%，首屏可见无需滚动',
    '侧栏 25–35%，仅含滑块/按钮/指标，无长段说明',
    '说明/推导/题目原文默认折叠在 details/tab 内',
    '控件触发后 #visualization 或 #metrics 有可见变化',
    '移动端 <768px 不横向溢出，自动上下堆叠',
    `核心概念体现在标题和标签中：${taskPlan.coreGoal.slice(0, 50)}`,
  ];

  const knownVars = variables.filter((v) => v.value !== 'unknown' && v.role !== 'output').slice(0, 3);
  if (knownVars.length > 0) {
    criteria.push(`已知量必须使用题目数值：${knownVars.map((v) => `${v.label}=${v.value}${v.unit ?? ''}`).join('；')}`);
  }

  if (input.formulaBlocks?.[0]) {
    const f = input.formulaBlocks[0];
    criteria.push(`关键公式必须正确实现：${f.latex.slice(0, 55)}${f.explanation ? `（${f.explanation}）` : ''}`);
  }

  if (domainModel.specialistNotes?.length) {
    criteria.push(...domainModel.specialistNotes.slice(0, 2));
  } else {
    criteria.push(`边界条件：${domainModel.edgeCases.slice(0, 2).join('；')}`);
  }

  return criteria.slice(0, 9);
}

function buildRightPanelNarration(
  input: RagVisualizationPlanningInput,
  taskPlan: TaskPlanLW,
  domainModel: DomainModelLW,
  variables: RagVisualizationVariable[],
): RagVisualizationNarrationStep[] {
  const steps: RagVisualizationNarrationStep[] = [];

  steps.push({ title: '还原原题', narration: input.question.slice(0, 250) });

  const givenVars = variables.filter((v) => v.role === 'given' || (v.value !== 'unknown' && v.role !== 'output'));
  if (givenVars.length > 0) {
    steps.push({ title: '题目已知量', narration: givenVars.slice(0, 5).map((v) => `${v.label} = ${v.value}${v.unit ?? ''}`).join('；') });
  }

  if (input.formulaBlocks?.length) {
    steps.push({ title: '关键公式', narration: input.formulaBlocks.slice(0, 3).map((f) => `${f.explanation ? f.explanation + '：' : ''}${f.latex}`).join('；') });
  }

  steps.push({ title: '观察目标', narration: taskPlan.mainVisualFocus });

  if (domainModel.states.length >= 2) {
    steps.push({ title: '状态变化过程', narration: domainModel.states.slice(0, 4).join(' → ') });
  }

  const outputVars = variables.filter((v) => v.role === 'output' && v.value !== 'unknown');
  if (outputVars.length > 0) {
    steps.push({ title: '计算结果', narration: outputVars.slice(0, 4).map((v) => `${v.label} = ${v.value}${v.unit ?? ''}`).join('；') });
  } else if (input.finalResults?.length) {
    steps.push({ title: '计算结果', narration: input.finalResults.slice(0, 4).map((r) => `${r.label} = ${r.value}${r.unit ?? ''}`).join('；') });
  }

  return steps.slice(0, 6);
}

// ─── Micro-utilities ──────────────────────────────────────────────────────────

function extractValueFromText(name: string, label: string, formulaText: string, answerText: string): string | null {
  const text = `${formulaText} ${answerText}`;
  for (const target of [name, label].filter(Boolean)) {
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = text.match(new RegExp(`${escaped}\\s*[=:：]\\s*([\\d.]+)`, 'i'));
    if (m?.[1]) return m[1];
  }
  return null;
}

function labelsMatch(a: string, b: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/[_\s-]/g, '');
  return n(a) === n(b);
}

function sanitizeName(label: string): string {
  return label.toLowerCase().replace(/\s+/g, '_').replace(/[^\w]/g, '');
}


export async function createRagVisualizationGenerationPlan(
  input: RagVisualizationPlanningInput,
  options: RagVisualizationPlanningOptions = {},
): Promise<RagVisualizationGenerationPlan> {
  const fallback = createFallbackPlan(input);

  // Round 002B perf fix: skip LLM planning call when lightweightPlan is already computed
  if (options.skipLlmCall && options.lightweightPlanForConversion) {
    log.info('[planner] skipping LLM planning call — using lightweight plan conversion (002B)');
    return convertLightweightPlanToGenerationPlan(input, options.lightweightPlanForConversion);
  }

  const prompt = buildRagVisualizationPlanningPrompt(input);

  try {
    const raw = await (options.plannerModel
      ? options.plannerModel(prompt)
      : generateWithConfiguredModel({
          messages: [
            {
              role: 'system',
              content: `你是 STEMotion RagVisualizationPlanningAgent。

任务：还原原题要演示的对象、变量、操作和成功标准。

只返回 JSON，不写 Markdown。

规则：
- 禁止改题、泛化题或编造题目参数。
- 缺失数值必须标为 unknown 或要求页面说明默认演示值。
- 规划必须服务原题和 RAG 回答，不输出通用科普页。
- Include design intent: STEMotion visual vocabulary, anti-filler, first-screen stage-first, and problem-specific interaction choices must be reflected in successCriteria and rightPanelNarration.`,
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.08,
          requestPreset: 'planning',
          profileRole: 'artifact',
        }));

    const parsed = parseJsonResponse(raw) as Partial<RagVisualizationGenerationPlan>;
    return normalizePlan(parsed, fallback);
  } catch (error) {
    log.warn('Planning agent failed, using heuristic fallback', {
      error: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
}

export function buildRagVisualizationPlanningPrompt(input: RagVisualizationPlanningInput): string {
  const formulaText = input.formulaBlocks?.length
    ? input.formulaBlocks.map((item) => `- ${item.latex}${item.explanation ? `：${item.explanation}` : ''}`).join('\n')
    : '- 无';
  const resultText = input.finalResults?.length
    ? input.finalResults.map((item) => `- ${item.label}: ${item.value}${item.unit ?? ''}`).join('\n')
    : '- 无';
  const specText = formatCompactVisualizationSpecContext(
    buildCompactVisualizationSpecContext(input.visualizationSpec),
  );

  return `请为 RAG 回答生成“问题专属互动可视化”的规划 JSON。

硬性规则：
- 禁止改题：problemRestatement 必须保留原题对象、变量、已知量和要求，不要换成类似题。
- 不要编造参数：题目或答案没有给出的数值必须标记为 "unknown"，或在 successCriteria 中要求页面明确说明“默认演示值”。
- 禁止泛化演示；必须围绕原题或知识点。
- 如果题目不适合可视化，shouldGenerate=false，并在 successCriteria 中解释。
- recommendedType 优先用 "interactive_html"，除非非常确定只需结构化 fallback。
- rightPanelNarration 是右侧讲解面板内容，保留原题、变量、观察目标、操作步骤。
- design intent / 设计意图必须进入规划：复用 STEMotion visual vocabulary，遵守 anti-filler，采用 first-screen stage-first 布局，确保 problem-specific interaction。

JSON 形状:
{
  "shouldGenerate": true,
  "problemRestatement": "string",
  "knowledgePoint": "string",
  "variables": [{"name":"string","label":"string","value":"string|unknown","unit":"optional","role":"given|derived|controlled|unknown"}],
  "visualObjects": ["string"],
  "controls": ["string"],
  "metrics": ["string"],
  "animationRequirements": ["string"],
  "successCriteria": ["string"],
  "rightPanelNarration": [{"title":"string","narration":"string"}],
  "recommendedType": "interactive_html|function_graph|force_diagram|algorithm_trace|projectile_motion",
  "confidence": 0.9
}

原题：
${input.question}

RAG 回答摘要：
${(input.answerText ?? '').slice(0, 2400) || '无'}

公式：
${formulaText}

最终结果：
${resultText}

确定性 spec 上下文（只能作为保真素材，不能作为最终模板直接渲染）：
${specText}

设计上下文：
${buildRagVisualizationDesignContext({
  medium: 'RAG visualization planning brief',
  originalQuestion: input.question,
  interactionIntent: 'plan a problem-specific interaction before HTML generation',
})}

上下文：
- subject: ${input.subject}
- taskType: ${input.taskType}
- preferredType: ${input.preferredType ?? 'auto'}

请只返回 JSON。`;
}

function createFallbackPlan(input: RagVisualizationPlanningInput): RagVisualizationGenerationPlan {
  const brief = createRagVisualizationBrief({
    question: input.question,
    answerText: input.answerText,
    subject: input.subject,
    taskType: input.taskType,
    recommendedType: input.preferredType,
  });

  const metrics = input.finalResults?.length
    ? input.finalResults.map((item) => `${item.label}${item.unit ? `(${item.unit})` : ''}`)
    : inferMetrics(brief.knowledgePoint);

  return {
    shouldGenerate: brief.confidence >= 0.45,
    problemRestatement: brief.originalQuestion,
    knowledgePoint: brief.knowledgePoint,
    variables: brief.variables,
    visualObjects: brief.mustShow.length ? brief.mustShow : ['原题对象', '关键变量', '结果变化'],
    controls: ['开始/暂停', '重置', '逐步观察'],
    metrics,
    animationRequirements: brief.mustShow.map((item) => `动态展示：${item}`),
    successCriteria: [
      `标题和标签必须体现：${brief.knowledgePoint}`,
      '必须保留原题变量，缺失参数用 unknown 或明确默认演示值',
      '必须有 start/reset 控件和实时指标',
    ],
    rightPanelNarration: [
      { title: '还原原题', narration: brief.scenario },
      { title: '观察目标', narration: brief.visualGoal },
      {
        title: '检查变量',
        narration: brief.variables.length
          ? brief.variables.map((item) => `${item.label}=${item.value}${item.unit ?? ''}`).join('；')
          : '从题目和回答中定位核心对象、状态或图形关系。',
      },
    ],
    recommendedType: 'interactive_html',
    confidence: brief.confidence,
  };
}

function normalizePlan(
  parsed: Partial<RagVisualizationGenerationPlan>,
  fallback: RagVisualizationGenerationPlan,
): RagVisualizationGenerationPlan {
  const variables = normalizeVariables(parsed.variables, fallback.variables);
  const rightPanelNarration = normalizeNarration(parsed.rightPanelNarration, fallback.rightPanelNarration);
  const confidence = normalizeConfidence(parsed.confidence, fallback.confidence);

  return {
    shouldGenerate: typeof parsed.shouldGenerate === 'boolean' ? parsed.shouldGenerate : fallback.shouldGenerate,
    problemRestatement: nonEmpty(parsed.problemRestatement, fallback.problemRestatement),
    knowledgePoint: nonEmpty(parsed.knowledgePoint, fallback.knowledgePoint),
    variables,
    visualObjects: normalizeStrings(parsed.visualObjects, fallback.visualObjects),
    controls: ensureCoreControls(normalizeStrings(parsed.controls, fallback.controls)),
    metrics: normalizeStrings(parsed.metrics, fallback.metrics),
    animationRequirements: normalizeStrings(parsed.animationRequirements, fallback.animationRequirements),
    successCriteria: normalizeStrings(parsed.successCriteria, fallback.successCriteria),
    rightPanelNarration,
    recommendedType: normalizeVisualizationType(parsed.recommendedType) ?? fallback.recommendedType,
    confidence,
  };
}

function normalizeVariables(
  value: unknown,
  fallback: RagVisualizationVariable[],
): RagVisualizationVariable[] {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  return value.slice(0, 10).map((item, index) => {
    const candidate = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return {
      name: nonEmpty(candidate.name, `var${index + 1}`),
      label: nonEmpty(candidate.label, nonEmpty(candidate.name, `变量 ${index + 1}`)),
      value: nonEmpty(candidate.value, 'unknown'),
      ...(candidate.unit ? { unit: String(candidate.unit) } : {}),
      ...(candidate.role ? { role: String(candidate.role) } : {}),
    };
  });
}

function normalizeNarration(
  value: unknown,
  fallback: RagVisualizationNarrationStep[],
): RagVisualizationNarrationStep[] {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  return value.slice(0, 8).map((item, index) => {
    const candidate = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return {
      title: nonEmpty(candidate.title, `讲解 ${index + 1}`),
      narration: nonEmpty(candidate.narration, '观察可视化中的关键变化。'),
    };
  });
}

function normalizeStrings(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const items = value.map((item) => String(item).trim()).filter(Boolean).slice(0, 10);
  return items.length ? items : fallback;
}

function ensureCoreControls(controls: string[]): string[] {
  const joined = controls.join(' ');
  const next = [...controls];
  if (!/开始|播放|start|run|play/i.test(joined)) next.unshift('开始/暂停');
  if (!/重置|reset/i.test(joined)) next.push('重置');
  return Array.from(new Set(next));
}

function normalizeVisualizationType(value: unknown): VisualizationType | undefined {
  const valid: VisualizationType[] = [
    'function_graph',
    'force_diagram',
    'algorithm_trace',
    'projectile_motion',
    'interactive_html',
  ];
  return valid.includes(value as VisualizationType) ? value as VisualizationType : undefined;
}

function normalizeConfidence(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const score = value > 1 ? value / 100 : value;
  return Math.max(0, Math.min(1, score));
}

function nonEmpty(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  return text || fallback;
}

function inferMetrics(knowledgePoint: string): string[] {
  if (/抛|运动/.test(knowledgePoint)) return ['时间', '水平位移', '竖直位移', '速度分量'];
  if (/函数|图像|极值|单调/.test(knowledgePoint)) return ['x 坐标', 'f(x)', '导数符号', '区间状态'];
  if (/栈|递归|算法/.test(knowledgePoint)) return ['当前步骤', '数据结构状态', '输出结果'];
  return ['当前状态', '关键变量', '观察结果'];
}
