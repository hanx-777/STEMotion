import { parseJsonResponse } from '@/lib/generation/jsonParser';
import type {
  AnswerSection,
  RagAnswerEnvelope,
  RagAnswerProtocol,
  RagFinalResult,
  RagFormulaBlock,
  RagTaskType,
  VisualizationHint,
} from './types';

export interface ParsedRagAnswer {
  protocol: RagAnswerProtocol;
  answer: string;
  sections: AnswerSection[];
  formulaBlocks: RagFormulaBlock[];
  finalResults: RagFinalResult[];
  pitfalls: string[];
  visualizationHint?: VisualizationHint;
  parseWarning?: string;
}

export function parseRagAnswerDraft(input: {
  raw: string;
  taskType: RagTaskType;
  fallbackVisualizationHint?: VisualizationHint;
}): ParsedRagAnswer {
  try {
    const parsed = parseJsonResponse(input.raw) as Partial<RagAnswerEnvelope>;
    const sections = normalizeSections(parsed.sections, input.taskType);
    if (sections.length === 0) throw new Error('JSON answer does not include sections.');
    const formulaBlocks = normalizeFormulaBlocks(parsed.formula_blocks);
    const finalResults = normalizeFinalResults(parsed.final_results);
    const pitfalls = normalizeStringArray(parsed.pitfalls);
    const visualizationHint = normalizeVisualizationHint(parsed.visualization_hint) ?? input.fallbackVisualizationHint;
    const disclaimer = typeof parsed.disclaimer === 'string' ? parsed.disclaimer.trim() : '';
    return {
      protocol: 'json',
      answer: stringifyStructuredAnswer(sections, disclaimer),
      sections: appendDisclaimerSection(sections, disclaimer),
      formulaBlocks,
      finalResults,
      pitfalls,
      visualizationHint,
    };
  } catch (error) {
    const sections = fallbackSections(input.raw, input.taskType);
    return {
      protocol: 'markdown_fallback',
      answer: input.raw,
      sections,
      formulaBlocks: [],
      finalResults: [],
      pitfalls: [],
      visualizationHint: input.fallbackVisualizationHint,
      parseWarning: error instanceof Error ? error.message : String(error),
    };
  }
}

export function buildJsonAnswerInstruction(taskType: RagTaskType): string {
  return [
    'Return JSON only. Do not wrap it in Markdown fences or add prose.',
    'Task: produce a structured tutoring answer grounded in the supplied evidence pack.',
    'JSON schema:',
    '{',
    '  "sections": [{"id": string, "title": string, "content": string}],',
    '  "formula_blocks": [{"id": string, "label": string, "latex": string, "explanation": string, "citation_refs": ["[L1]"]}],',
    '  "citation_refs": ["[L1]", "[W1]"],',
    '  "final_results": [{"label": string, "value": string, "unit": string, "citation_refs": ["[L1]"]}],',
    '  "pitfalls": [string],',
    '  "visualization_hint": {"type": "projectile_motion|function_graph|force_diagram|algorithm_trace", "parameters": {...}},',
    '  "disclaimer": "AI 生成内容，仅供学习参考，请结合课程教材与教师要求核验。"',
    '}',
    `Required sections for task_type=${taskType}: ${requiredSections(taskType).map((section) => `${section.id}:${section.title}`).join(', ')}.`,
    'Put formulas in formula_blocks and also reference them naturally in section content. Formula latex must not include \\[ \\] or $$ delimiters.',
    'Use [Lx] only for local course evidence and [Wx] only for web supplementary evidence.',
    'Do not invent citation labels, sources, page numbers, or evidence.',
    '',
    'FORMULA OUTPUT RULES (MANDATORY):',
    'All mathematical formulas in sections[].content MUST use standard LaTeX delimiters.',
    '- Inline formula: $...$ or \\(...\\) — e.g., $f\'(x)>0$ or \\(f\'(x)>0\\)',
    '- Display formula: $$...$$ or \\[...\\] — e.g., $$f(x)=xe^{-x^2}$$',
    '- NEVER write formulas as plain text like e^(-x^2), sqrt(x), 1/2, x^2.',
    '- Use LaTeX commands: \\frac{a}{b} not a/b, \\sqrt{x} not sqrt(x), e^{-x^2} not e^(-x^2).',
    '- Use \\lim, \\int, \\sum, \\sin, \\cos, \\theta, \\pi etc. for standard math symbols.',
    '- After each display formula, add a brief natural-language explanation.',
    '- Code blocks are exempt: inside ```code``` fences, use programming syntax as usual.',
  ].join('\n');
}

function normalizeSections(value: unknown, taskType: RagTaskType): AnswerSection[] {
  if (!Array.isArray(value)) return [];
  const required = requiredSections(taskType);
  const sections = value
    .map((item) => normalizeSection(item))
    .filter((item): item is AnswerSection => item !== null);
  const byId = new Map(sections.map((section) => [section.id, section]));
  for (const fallback of required) {
    if (!byId.has(fallback.id)) {
      sections.push({ ...fallback, content: '' });
    }
  }
  return sections;
}

function normalizeSection(value: unknown): AnswerSection | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : '';
  const title = typeof record.title === 'string' && record.title.trim() ? record.title.trim() : '';
  const content = typeof record.content === 'string' ? record.content.trim() : '';
  if (!id || !title) return null;
  return { id, title, content };
}

function normalizeFormulaBlocks(value: unknown): RagFormulaBlock[] {
  if (!Array.isArray(value)) return [];
  const blocks: RagFormulaBlock[] = [];
  value.forEach((item, index) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const latex = typeof record.latex === 'string' ? stripFormulaDelimiters(record.latex.trim()) : '';
    if (!latex) return;
    blocks.push({
      id: typeof record.id === 'string' && record.id.trim() ? record.id.trim() : `formula_${index + 1}`,
      label: typeof record.label === 'string' ? record.label.trim() : undefined,
      latex,
      explanation: typeof record.explanation === 'string' ? record.explanation.trim() : undefined,
      citation_refs: normalizeStringArray(record.citation_refs),
    });
  });
  return blocks;
}

function normalizeFinalResults(value: unknown): RagFinalResult[] {
  if (!Array.isArray(value)) return [];
  const results: RagFinalResult[] = [];
  value.forEach((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const label = typeof record.label === 'string' ? record.label.trim() : '';
    const resultValue = typeof record.value === 'string' ? record.value.trim() : '';
    if (!label || !resultValue) return;
    results.push({
      label,
      value: resultValue,
      unit: typeof record.unit === 'string' ? record.unit.trim() : undefined,
      citation_refs: normalizeStringArray(record.citation_refs),
    });
  });
  return results;
}

function normalizeVisualizationHint(value: unknown): VisualizationHint | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record.type !== 'projectile_motion') return undefined;
  const parameters = record.parameters && typeof record.parameters === 'object'
    ? record.parameters as Record<string, unknown>
    : {};
  return {
    type: 'projectile_motion',
    parameters: {
      v0: numberOrUndefined(parameters.v0),
      angle_deg: numberOrUndefined(parameters.angle_deg),
      g: numberOrUndefined(parameters.g) ?? 9.8,
    },
  };
}

function fallbackSections(raw: string, taskType: RagTaskType): AnswerSection[] {
  const required = requiredSections(taskType);
  return required.map((section, index) => ({
    ...section,
    content: index === 2 || section.id === 'concept' || section.id === 'intro' || section.id === 'misconception'
      ? raw.trim()
      : '',
  }));
}

function requiredSections(taskType: RagTaskType): AnswerSection[] {
  if (taskType === 'knowledge_qa') {
    return [
      { id: 'concept', title: '核心概念', content: '' },
      { id: 'evidence', title: '关键依据', content: '' },
      { id: 'study_hint', title: '学习建议', content: '' },
      { id: 'citations', title: '引用来源', content: '' },
    ];
  }
  if (taskType === 'misconception_diagnosis') {
    return [
      { id: 'misconception', title: '错误定位', content: '' },
      { id: 'cause', title: '错因分析', content: '' },
      { id: 'correction', title: '正确思路', content: '' },
      { id: 'practice', title: '巩固练习', content: '' },
      { id: 'citations', title: '引用来源', content: '' },
    ];
  }
  if (taskType === 'teacher_prep') {
    return [
      { id: 'objectives', title: '教学目标', content: '' },
      { id: 'intro', title: '课堂导入', content: '' },
      { id: 'blackboard', title: '核心公式', content: '' },
      { id: 'questions', title: '互动提问', content: '' },
      { id: 'visualization', title: '动态演示参数', content: '' },
      { id: 'citations', title: '引用来源', content: '' },
    ];
  }
  return [
    { id: 'extract', title: '题目信息提取', content: '' },
    { id: 'model', title: '物理模型判断', content: '' },
    { id: 'derivation', title: '分步推导', content: '' },
    { id: 'calculation', title: '数值计算', content: '' },
    { id: 'unit_check', title: '单位检查', content: '' },
    { id: 'result', title: '结论', content: '' },
    { id: 'pitfalls', title: '易错点', content: '' },
    { id: 'citations', title: '引用来源', content: '' },
  ];
}

function appendDisclaimerSection(sections: AnswerSection[], disclaimer: string): AnswerSection[] {
  if (!disclaimer) return sections;
  if (sections.some((section) => section.content.includes(disclaimer))) return sections;
  return sections;
}

function stringifyStructuredAnswer(sections: AnswerSection[], disclaimer: string): string {
  const text = sections.map((section) => `## ${section.title}\n${section.content}`).join('\n\n').trim();
  return disclaimer && !text.includes(disclaimer) ? `${text}\n\n${disclaimer}` : text;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim());
}

function stripFormulaDelimiters(value: string): string {
  return value
    .replace(/^\\\[/, '')
    .replace(/\\\]$/, '')
    .replace(/^\\\(/, '')
    .replace(/\\\)$/, '')
    .replace(/^\$\$/, '')
    .replace(/\$\$$/, '')
    .trim();
}

function numberOrUndefined(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}
