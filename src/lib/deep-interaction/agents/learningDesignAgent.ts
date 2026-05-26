import { generateWithConfiguredModel } from '@/lib/generation/llmClient';
import { parseJsonResponse } from '@/lib/generation/jsonParser';
import { createLogger } from '@/lib/logger';
import { makeId } from '@/lib/utils/makeId';
import type {
  BloomLevel,
  DeepInteractionType,
  GuidedGenerationPlan,
  InteractionGradeLevel,
  InteractionSubject,
  KnowledgeConstraint,
  LearningBlueprint,
  LearningVariable,
  ScaffoldingLevel,
  SubjectDomain,
  VariableRole,
} from '../types';
import { findMatchingSubjectSchema } from '../subject-schemas';

const log = createLogger('learningDesignAgent');

export interface LearningDesignContext {
  prompt: string;
  interactionType: DeepInteractionType;
  title: string;
  concept: string;
  subject: InteractionSubject;
  gradeLevel: InteractionGradeLevel;
  learningGoals: string[];
  variables: Array<{
    name: string;
    label: string;
    min: number;
    max: number;
    default: number;
    unit?: string;
  }>;
  guidedPlan?: GuidedGenerationPlan;
}

const SYSTEM_PROMPT = `你是 STEMotion LearningDesignAgent，一位专业的 K-12 STEM 教学设计专家。
你的任务是把用户的一句自然语言需求转化为结构化 LearningBlueprint。

只输出 JSON，不要输出 Markdown，不要解释。

如果提供 guidedPlan，它是教师已经批准的高优先级教学计划，但不能盲从；当 guidedPlan 与 Subject Schema、HTML Widget 安全规范或后续 evaluator 约束冲突时，必须以学科约束和安全规范优先。

要求：
1. subjectDomain 必须从 math, physics, chemistry, biology, earth_science, computer_science, engineering, other 中选择。
2. gradeRange 必须是合理年级范围：小学 1-6，初中 7-9，高中 10-12。
3. bloomLevel 必须从 remember, understand, apply, analyze, evaluate, create 中选择。
4. scaffoldingLevel 必须从 guided, open, inquiry 中选择。
5. coreVariables 必须提取关键变量，并标注 independent/dependent/controlled。
6. expectedInsight 必须是一句话，说明学生通过交互应得出的核心结论。
7. learningObjectives 写 2-4 条，面向课堂学习。
8. knowledgeConstraints 写 2-5 条，描述必须正确的科学事实、公式、单位、顺序或视觉呈现。
9. suggestedVisualStructure 简要描述建议界面结构。
10. estimatedDurationMinutes 给出 3-15 分钟范围内的课堂使用时长。

JSON 格式：
{
  "topic": "string",
  "subjectDomain": "math|physics|chemistry|biology|earth_science|computer_science|engineering|other",
  "interactionType": "simulation|3d_visualization|game|mind_map",
  "gradeRange": [number, number],
  "bloomLevel": "remember|understand|apply|analyze|evaluate|create",
  "scaffoldingLevel": "guided|open|inquiry",
  "coreVariables": [
    {
      "name": "string",
      "symbol": "string",
      "unit": "string",
      "role": "independent|dependent|controlled",
      "range": [number, number],
      "defaultValue": number,
      "description": "string"
    }
  ],
  "expectedInsight": "string",
  "learningObjectives": ["string"],
  "prerequisites": ["string"],
  "knowledgeConstraints": [
    {
      "id": "string",
      "description": "string",
      "formula": "string",
      "mustBeTrue": "string",
      "severity": "must|should",
      "checkType": "conceptual|formula|unit|sequence|variable|visual"
    }
  ],
  "suggestedVisualStructure": "string",
  "estimatedDurationMinutes": number
}`;

export async function generateLearningBlueprint(ctx: LearningDesignContext): Promise<LearningBlueprint> {
  const fallback = createFallbackBlueprint(ctx);

  try {
    const raw = await withTimeout(
      generateWithConfiguredModel({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(ctx) },
        ],
        temperature: 0.12,
        maxTokens: 12000,
        stream: false,
      }),
      120000,
    );

    const parsed = parseJsonResponse(raw) as Record<string, unknown>;
    const blueprint = normalizeBlueprint(parsed, ctx, fallback);
    log.info('Learning blueprint generated', {
      blueprintId: blueprint.id,
      topic: blueprint.topic,
      subjectDomain: blueprint.subjectDomain,
      variables: blueprint.coreVariables.length,
    });
    return blueprint;
  } catch (error) {
    log.warn('LearningDesignAgent failed, using deterministic fallback', {
      error: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
}

export function createFallbackBlueprint(ctx: LearningDesignContext): LearningBlueprint {
  const domain = mapSubjectDomain(ctx.subject);
  const guided = ctx.guidedPlan;
  const lookupText = `${ctx.title} ${ctx.concept} ${ctx.prompt} ${guided?.topic ?? ''} ${guided?.expectedInsight ?? ''}`;
  const match = findMatchingSubjectSchema(domain, lookupText) ?? findMatchingSubjectSchema('other', lookupText);
  const topic = match?.schema.topic ?? guided?.topic ?? ctx.concept;
  const subjectDomain = match?.schema.subjectDomain ?? normalizeGuidedSubjectDomain(guided?.subjectDomain, domain);
  const coreVariables = match?.schema.requiredVariables?.length
    ? match.schema.requiredVariables.map((symbol, index) => variableFromRequiredSymbol(symbol, index))
    : guided?.coreVariables?.length
      ? guided.coreVariables.map(variableFromGuidedPlan)
      : ctx.variables.map(variableFromPlan);
  const learningObjectives = ctx.learningGoals.slice(0, 4).length
    ? ctx.learningGoals.slice(0, 4)
    : guided?.learningObjectives?.length
      ? guided.learningObjectives.slice(0, 4)
      : [`理解${topic}的核心规律`, '通过调节变量观察结果变化'];
  const knowledgeConstraints = match?.schema.constraints ?? constraintsFromGuidedPlan(guided) ?? [
    {
      id: 'fallback-constraint-1',
      description: `${topic}的交互内容应保持学科概念准确`,
      mustBeTrue: '可视化、变量和文字说明不得互相冲突',
      severity: 'must' as const,
      checkType: 'conceptual' as const,
    },
  ];

  return {
    id: makeId('blueprint'),
    topic,
    originalPrompt: ctx.prompt,
    subjectDomain,
    interactionType: ctx.interactionType,
    gradeRange: normalizeGuidedGradeRange(guided?.gradeRange) ?? gradeRangeFor(ctx.gradeLevel),
    bloomLevel: ctx.interactionType === 'mind_map' ? 'understand' : 'apply',
    scaffoldingLevel: 'guided',
    coreVariables,
    expectedInsight: guided?.expectedInsight ?? expectedInsightFor(topic, match?.schema.constraints),
    learningObjectives: ctx.learningGoals.slice(0, 4).length
      ? ctx.learningGoals.slice(0, 4)
      : [`理解${topic}的核心规律`, '通过调节变量观察结果变化'],
    prerequisites: prerequisiteFor(subjectDomain),
    knowledgeConstraints: match?.schema.constraints ?? [
      {
        id: 'fallback-constraint-1',
        description: `${topic}的交互内容应保持学科概念准确`,
        mustBeTrue: '可视化、变量和文字说明不得互相冲突',
        severity: 'must',
        checkType: 'conceptual',
      },
    ],
    suggestedVisualStructure: '主舞台、控制面板、观察数据区、公式或提示区、课堂问题区分层呈现。',
    ...blueprintFieldOverrides(learningObjectives, knowledgeConstraints),
    estimatedDurationMinutes: 8,
    createdAt: new Date().toISOString(),
  };
}

export function formatBlueprintForPrompt(blueprint: LearningBlueprint): string {
  return `【教学蓝图 LearningBlueprint】

主题：${blueprint.topic}
学科：${blueprint.subjectDomain}
年级：${blueprint.gradeRange[0]}-${blueprint.gradeRange[1]} 年级
认知层次：${blueprint.bloomLevel}
支架水平：${blueprint.scaffoldingLevel}

【学习目标】
${blueprint.learningObjectives.map((item, index) => `${index + 1}. ${item}`).join('\n')}

【核心变量】
${blueprint.coreVariables.map(formatVariable).join('\n')}

【期望洞察】
${blueprint.expectedInsight}

【必须满足的知识约束】
${blueprint.knowledgeConstraints.map(formatConstraint).join('\n')}

【建议视觉结构】
${blueprint.suggestedVisualStructure ?? '主舞台、控制面板、观察面板、公式面板和问题区。'}

生成的 HTML 必须围绕 expectedInsight 组织交互，不得偏离 LearningBlueprint。
必须使用稳定语义选择器，例如 data-role="simulation-main"、data-role="control-panel"、data-role="observation-panel"、data-role="formula-panel"、data-role="quiz-panel"。
所有 must 级知识约束必须在交互中正确体现。independent 变量应尽量提供可调控件，dependent 变量应在图像、数值或观察区中可见，controlled 变量应说明或固定。`;
}

function buildUserPrompt(ctx: LearningDesignContext): string {
  return JSON.stringify({
    userPrompt: ctx.prompt,
    guidedPlan: ctx.guidedPlan
      ? {
          ...ctx.guidedPlan,
          instruction: 'Use this teacher-approved plan as high-priority context, but Subject Schema and HTML safety rules override it when conflicts exist.',
        }
      : undefined,
    title: ctx.title,
    concept: ctx.concept,
    subject: ctx.subject,
    gradeLevel: ctx.gradeLevel,
    interactionType: ctx.interactionType,
    learningGoals: ctx.learningGoals,
    variables: ctx.variables,
  }, null, 2);
}

function normalizeBlueprint(
  parsed: Record<string, unknown>,
  ctx: LearningDesignContext,
  fallback: LearningBlueprint,
): LearningBlueprint {
  return {
    id: makeId('blueprint'),
    topic: text(parsed.topic, fallback.topic),
    originalPrompt: ctx.prompt,
    subjectDomain: normalizeSubjectDomain(parsed.subjectDomain, fallback.subjectDomain),
    interactionType: ctx.interactionType,
    gradeRange: normalizeGradeRange(parsed.gradeRange, fallback.gradeRange),
    bloomLevel: normalizeBloomLevel(parsed.bloomLevel, fallback.bloomLevel),
    scaffoldingLevel: normalizeScaffolding(parsed.scaffoldingLevel, fallback.scaffoldingLevel),
    coreVariables: normalizeVariables(parsed.coreVariables, fallback.coreVariables),
    expectedInsight: text(parsed.expectedInsight, fallback.expectedInsight),
    learningObjectives: stringArray(parsed.learningObjectives, fallback.learningObjectives, 4),
    prerequisites: stringArray(parsed.prerequisites, fallback.prerequisites, 5),
    knowledgeConstraints: normalizeConstraints(parsed.knowledgeConstraints, fallback.knowledgeConstraints),
    suggestedVisualStructure: typeof parsed.suggestedVisualStructure === 'string'
      ? parsed.suggestedVisualStructure
      : fallback.suggestedVisualStructure,
    estimatedDurationMinutes: clamp(Number(parsed.estimatedDurationMinutes) || fallback.estimatedDurationMinutes, 3, 15),
    createdAt: new Date().toISOString(),
  };
}

function normalizeVariables(value: unknown, fallback: LearningVariable[]): LearningVariable[] {
  if (!Array.isArray(value) || value.length === 0) return fallback;

  const variables = value
    .map((item, index): LearningVariable | null => {
      if (!item || typeof item !== 'object') return null;
      const candidate = item as Record<string, unknown>;
      return {
        name: text(candidate.name, `变量 ${index + 1}`),
        symbol: text(candidate.symbol, String(candidate.name ?? `v${index + 1}`)),
        role: normalizeVariableRole(candidate.role, index === 0 ? 'independent' : 'dependent'),
        ...(typeof candidate.unit === 'string' ? { unit: candidate.unit } : {}),
        ...(normalizeRange(candidate.range) ? { range: normalizeRange(candidate.range) } : {}),
        ...(typeof candidate.defaultValue === 'number' || typeof candidate.defaultValue === 'string'
          ? { defaultValue: candidate.defaultValue }
          : {}),
        ...(typeof candidate.description === 'string' ? { description: candidate.description } : {}),
      };
    })
    .filter((item): item is LearningVariable => Boolean(item));

  return variables.length ? variables : fallback;
}

function normalizeConstraints(value: unknown, fallback: KnowledgeConstraint[]): KnowledgeConstraint[] {
  if (!Array.isArray(value) || value.length === 0) return fallback;

  const constraints = value
    .map((item, index): KnowledgeConstraint | null => {
      if (!item || typeof item !== 'object') return null;
      const candidate = item as Record<string, unknown>;
      return {
        id: text(candidate.id, `blueprint-constraint-${index + 1}`),
        description: text(candidate.description, '必须保持科学概念准确。'),
        mustBeTrue: text(candidate.mustBeTrue, '交互、文字和数据必须一致。'),
        severity: candidate.severity === 'should' ? 'should' : 'must',
        checkType: normalizeCheckType(candidate.checkType),
        ...(typeof candidate.formula === 'string' ? { formula: candidate.formula } : {}),
      };
    })
    .filter((item): item is KnowledgeConstraint => Boolean(item));

  return constraints.length ? constraints : fallback;
}

function variableFromPlan(variable: LearningDesignContext['variables'][number], index: number): LearningVariable {
  return {
    name: variable.label || variable.name,
    symbol: variable.name,
    unit: variable.unit,
    role: index === 0 ? 'independent' : 'dependent',
    range: [variable.min, variable.max],
    defaultValue: variable.default,
    description: `${variable.label || variable.name} 是交互中的核心变量。`,
  };
}

function variableFromGuidedPlan(value: string, index: number): LearningVariable {
  const [symbolCandidate, ...descriptionParts] = value.trim().split(/\s+/);
  const symbol = symbolCandidate || `v${index + 1}`;
  const description = descriptionParts.join(' ') || value;
  return {
    name: description || symbol,
    symbol,
    role: index === 0 ? 'independent' : 'dependent',
    description: value,
  };
}

function variableFromRequiredSymbol(symbol: string, index: number): LearningVariable {
  const known: Record<string, LearningVariable> = {
    I: { name: '电流', symbol: 'I', unit: 'A', role: 'dependent', range: [0, 10], defaultValue: 1, description: '随电压和电阻变化的观察量。' },
    U: { name: '电压', symbol: 'U', unit: 'V', role: 'independent', range: [1, 24], defaultValue: 6, description: '学生可调节的输入电压。' },
    R: { name: '电阻', symbol: 'R', unit: 'Ω', role: 'independent', range: [1, 100], defaultValue: 10, description: '学生可调节的电路电阻。' },
    a: { name: '开口系数', symbol: 'a', role: 'independent', range: [-3, 3], defaultValue: 1, description: '控制抛物线开口方向与宽窄。' },
    b: { name: '一次项系数', symbol: 'b', role: 'independent', range: [-5, 5], defaultValue: 0, description: '影响抛物线对称轴位置。' },
    c: { name: '常数项', symbol: 'c', role: 'independent', range: [-5, 5], defaultValue: 0, description: '影响抛物线与 y 轴交点。' },
    v0: { name: '初速度', symbol: 'v0', unit: 'm/s', role: 'independent', range: [1, 50], defaultValue: 15, description: '抛体运动的初始速度。' },
    g: { name: '重力加速度', symbol: 'g', unit: 'm/s²', role: 'controlled', range: [9.8, 9.8], defaultValue: 9.8, description: '地球表面附近的重力加速度。' },
    t: { name: '时间', symbol: 't', unit: 's', role: 'dependent', range: [0, 10], defaultValue: 0, description: '运动过程中的时间变量。' },
    pH: { name: '酸碱度', symbol: 'pH', role: 'dependent', range: [0, 14], defaultValue: 7, description: '用于判断滴定过程和终点。' },
  };

  return known[symbol] ?? {
    name: symbol,
    symbol,
    role: index === 0 ? 'independent' : 'dependent',
    description: `${symbol} 是该主题的必要变量。`,
  };
}

function expectedInsightFor(topic: string, constraints?: KnowledgeConstraint[]): string {
  const must = constraints?.find((constraint) => constraint.severity === 'must');
  return must
    ? `学生应通过操作和观察理解：${must.description}。`
    : `学生应通过操作和观察理解${topic}的核心变量关系。`;
}

function prerequisiteFor(domain: SubjectDomain): string[] {
  if (domain === 'math') return ['函数图像基础', '坐标系读图'];
  if (domain === 'physics') return ['变量关系', '基础测量单位'];
  if (domain === 'chemistry') return ['物质变化观察', '实验安全基础'];
  if (domain === 'biology') return ['生命现象观察', '基础细胞结构'];
  return ['基础 STEM 观察与记录'];
}

export function mapSubjectDomain(subject: InteractionSubject): SubjectDomain {
  if (subject === 'math' || subject === 'physics' || subject === 'chemistry' || subject === 'biology') {
    return subject;
  }
  return 'other';
}

function gradeRangeFor(grade: InteractionGradeLevel): [number, number] {
  if (grade === 'primary') return [1, 6];
  if (grade === 'high_school') return [10, 12];
  return [7, 9];
}

function normalizeGuidedGradeRange(value: GuidedGenerationPlan['gradeRange'] | undefined): [number, number] | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const start = clamp(Math.round(Number(value[0])), 1, 12);
  const end = clamp(Math.round(Number(value[1])), 1, 12);
  return start <= end ? [start, end] : [end, start];
}

function normalizeGuidedSubjectDomain(value: string | undefined, fallback: SubjectDomain): SubjectDomain {
  return normalizeSubjectDomain(value, fallback);
}

function constraintsFromGuidedPlan(guidedPlan: GuidedGenerationPlan | undefined): KnowledgeConstraint[] | undefined {
  if (!guidedPlan?.knowledgeConstraints?.length) return undefined;
  return guidedPlan.knowledgeConstraints.slice(0, 8).map((constraint, index) => ({
    id: `guided-constraint-${index + 1}`,
    description: constraint,
    mustBeTrue: constraint,
    severity: 'must',
    checkType: 'conceptual',
  }));
}

function blueprintFieldOverrides(
  learningObjectives: string[],
  knowledgeConstraints: KnowledgeConstraint[],
): Partial<LearningBlueprint> {
  return { learningObjectives, knowledgeConstraints };
}

function formatVariable(variable: LearningVariable): string {
  const range = variable.range ? `，范围：${variable.range[0]}-${variable.range[1]}` : '';
  const unit = variable.unit ? `，单位：${variable.unit}` : '';
  return `- ${variable.name}（${variable.symbol}，${variable.role}${unit}${range}）：${variable.description ?? ''}`;
}

function formatConstraint(constraint: KnowledgeConstraint): string {
  const formula = constraint.formula ? `，公式：${constraint.formula}` : '';
  return `- [${constraint.severity}] ${constraint.description}${formula}。校验点：${constraint.mustBeTrue}`;
}

function normalizeRange(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const min = Number(value[0]);
  const max = Number(value[1]);
  return Number.isFinite(min) && Number.isFinite(max) ? [min, max] : undefined;
}

function normalizeGradeRange(value: unknown, fallback: [number, number]): [number, number] {
  const range = normalizeRange(value);
  if (!range) return fallback;
  return [clamp(Math.round(range[0]), 1, 12), clamp(Math.round(range[1]), 1, 12)];
}

function normalizeSubjectDomain(value: unknown, fallback: SubjectDomain): SubjectDomain {
  const valid: SubjectDomain[] = ['math', 'physics', 'chemistry', 'biology', 'earth_science', 'computer_science', 'engineering', 'other'];
  return valid.includes(value as SubjectDomain) ? value as SubjectDomain : fallback;
}

function normalizeBloomLevel(value: unknown, fallback: BloomLevel): BloomLevel {
  const valid: BloomLevel[] = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];
  return valid.includes(value as BloomLevel) ? value as BloomLevel : fallback;
}

function normalizeScaffolding(value: unknown, fallback: ScaffoldingLevel): ScaffoldingLevel {
  const valid: ScaffoldingLevel[] = ['guided', 'open', 'inquiry'];
  return valid.includes(value as ScaffoldingLevel) ? value as ScaffoldingLevel : fallback;
}

function normalizeVariableRole(value: unknown, fallback: VariableRole): VariableRole {
  const valid: VariableRole[] = ['independent', 'dependent', 'controlled'];
  return valid.includes(value as VariableRole) ? value as VariableRole : fallback;
}

function normalizeCheckType(value: unknown): KnowledgeConstraint['checkType'] {
  const valid: KnowledgeConstraint['checkType'][] = ['conceptual', 'formula', 'unit', 'sequence', 'variable', 'visual'];
  return valid.includes(value as KnowledgeConstraint['checkType']) ? value as KnowledgeConstraint['checkType'] : 'conceptual';
}

function stringArray(value: unknown, fallback: string[], max: number): string[] {
  return Array.isArray(value) && value.length
    ? value.map(String).filter(Boolean).slice(0, max)
    : fallback;
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Learning design timed out.')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}
