import { generateWithConfiguredModel } from '@/lib/generation/llmClient';
import { parseJsonResponse } from '@/lib/generation/jsonParser';
import { createLogger } from '@/lib/logger';
import { withTimeout } from '@/lib/utils/withTimeout';
import type { LearningBlueprint, SchemaValidationSummary } from '../types';
import type { AppliedTemplateSlot, VerifiedExperimentTemplate } from '../verified-experiments/types';

const log = createLogger('template-customization');

export interface TemplateCustomizationInput {
  userPrompt: string;
  blueprint: LearningBlueprint;
  template: VerifiedExperimentTemplate;
  schemaValidation?: SchemaValidationSummary;
}

export interface TemplateCustomizationResult {
  html: string;
  appliedSlots: AppliedTemplateSlot[];
  preservedConstraints: string[];
  warnings: string[];
  usedFallback: boolean;
}

interface RawCustomizationResult {
  html?: unknown;
  appliedSlots?: unknown;
  preservedConstraints?: unknown;
  warnings?: unknown;
}

export async function runTemplateCustomizationAgent(
  input: TemplateCustomizationInput,
): Promise<TemplateCustomizationResult> {
  try {
    const raw = await withTimeout(
      generateWithConfiguredModel({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(input) },
        ],
        temperature: 0.15,
        maxTokens: 131072,
      }),
      900000,
    );

    const parsed = parseJsonResponse(raw) as RawCustomizationResult;
    const html = typeof parsed.html === 'string' ? parsed.html.trim() : '';
    const safety = validateCustomizedTemplateHtml(html);

    if (!html || !safety.ok) {
      return fallback(input.template, safety.errors.length ? safety.errors : ['Template customization returned empty HTML.']);
    }

    return {
      html,
      appliedSlots: normalizeAppliedSlots(parsed.appliedSlots),
      preservedConstraints: arrayOfStrings(parsed.preservedConstraints, input.template.protectedConstraints),
      warnings: arrayOfStrings(parsed.warnings, []),
      usedFallback: false,
    };
  } catch (error) {
    log.warn('Template customization failed; using original template', {
      templateId: input.template.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return fallback(input.template, ['Template customization failed; used original verified template.']);
  }
}

function buildUserPrompt(input: TemplateCustomizationInput): string {
  const { blueprint, template } = input;
  return `用户原始需求:
${input.userPrompt}

LearningBlueprint 摘要:
topic: ${blueprint.topic}
subjectDomain: ${blueprint.subjectDomain}
expectedInsight: ${blueprint.expectedInsight}
coreVariables:
${blueprint.coreVariables.map((variable) => `- ${variable.name} (${variable.symbol}, ${variable.role}${variable.unit ? `, ${variable.unit}` : ''})`).join('\n')}

knowledgeConstraints:
${blueprint.knowledgeConstraints.map((constraint) => `- [${constraint.severity}] ${constraint.id}: ${constraint.description}; ${constraint.mustBeTrue}`).join('\n')}

schemaValidation:
${input.schemaValidation ? JSON.stringify(input.schemaValidation, null, 2) : 'not provided'}

Verified Template:
title: ${template.title}
id: ${template.id}
editableSlots:
${JSON.stringify(template.editableSlots, null, 2)}
protectedConstraints:
${template.protectedConstraints.map((constraint) => `- ${constraint}`).join('\n')}

Template HTML:
${template.html}`;
}

const SYSTEM_PROMPT = `你是 STEMotion TemplateCustomizationAgent。

任务：基于可信实验模板做局部改编，不从零重写 HTML。

输出规则：
- 只输出 JSON，不要输出 Markdown 或解释。
- 优先修改 editableSlots。
- 无法安全改编时返回原模板。
- 不要删除原有控件、公式区、观察区、quiz 区或核心交互。
- 用户要求会破坏学科正确性时，保留原行为，并在 warnings 中说明。

必须保留：
- protectedConstraints。
- must 级 knowledgeConstraints。
- 稳定 data-role。
- widget-config。
- postMessage 协议。
- 内联 CSS/JS 与无外部资源约束。

JSON 格式:
{
  "html": "完整 HTML",
  "appliedSlots": [
    { "key": "string", "oldValue": "...", "newValue": "...", "reason": "string" }
  ],
  "preservedConstraints": ["string"],
  "warnings": ["string"]
}`;

function validateCustomizedTemplateHtml(html: string): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!html.includes('<script type="application/json" id="widget-config">')) {
    errors.push('Missing widget-config script.');
  }

  for (const role of ['simulation-main', 'control-panel', 'observation-panel']) {
    if (!html.includes(`data-role="${role}"`)) {
      errors.push(`Missing data-role="${role}".`);
    }
  }

  if (!/window\.addEventListener\s*\(\s*['"]message['"]/i.test(html)) {
    errors.push('Missing postMessage listener.');
  }

  for (const message of ['SET_WIDGET_STATE', 'HIGHLIGHT_ELEMENT', 'ANNOTATE_ELEMENT', 'REVEAL_ELEMENT']) {
    if (!html.includes(message)) {
      errors.push(`Missing postMessage type ${message}.`);
    }
  }

  const forbiddenPatterns: Array<[RegExp, string]> = [
    [/https?:\/\//i, 'External URL is not allowed.'],
    [/\bfetch\s*\(/i, 'fetch() is not allowed.'],
    [/\bXMLHttpRequest\b/i, 'XMLHttpRequest is not allowed.'],
    [/\bWebSocket\b/i, 'WebSocket is not allowed.'],
    [/\blocalStorage\b/i, 'localStorage is not allowed.'],
    [/\bdocument\.cookie\b/i, 'document.cookie is not allowed.'],
    [/<iframe\b/i, 'Nested iframe is not allowed.'],
  ];

  for (const [pattern, message] of forbiddenPatterns) {
    if (pattern.test(html)) errors.push(message);
  }

  return { ok: errors.length === 0, errors };
}

function normalizeAppliedSlots(value: unknown): AppliedTemplateSlot[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((slot): AppliedTemplateSlot | null => {
      if (!slot || typeof slot !== 'object') return null;
      const record = slot as Record<string, unknown>;
      if (typeof record.key !== 'string') return null;
      return {
        key: record.key,
        oldValue: record.oldValue,
        newValue: record.newValue,
        reason: typeof record.reason === 'string' ? record.reason : 'Template slot adjusted.',
      };
    })
    .filter((slot): slot is AppliedTemplateSlot => Boolean(slot));
}

function arrayOfStrings(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  return value.map(String).filter(Boolean);
}

function fallback(template: VerifiedExperimentTemplate, warnings: string[]): TemplateCustomizationResult {
  return {
    html: template.html,
    appliedSlots: [],
    preservedConstraints: template.protectedConstraints,
    warnings,
    usedFallback: true,
  };
}
