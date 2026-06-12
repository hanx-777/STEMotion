import { generateWithConfiguredModel } from '@/lib/generation/llmClient';
import { buildInternalMultiAgentPlanningPrompt } from '@/lib/generation/multiAgentGenerationPrompt';
import { parseJsonResponse } from '@/lib/generation/jsonParser';
import { createLogger } from '@/lib/logger';
import { withAbortableTimeout } from '@/lib/utils/withTimeout';
import type { AgentEvaluation, AgentIssue, InteractionGradeLevel, InteractionSubject, LearningBlueprint } from '../types';
import {
  createNonBlockingEvaluatorFallback,
  resolveEvaluatorTimeoutMs,
} from './evaluatorFallback';

const log = createLogger('evaluator');

export interface PedagogyEvalContext {
  prompt: string;
  title: string;
  concept: string;
  description: string;
  subject: InteractionSubject;
  gradeLevel: InteractionGradeLevel;
  interactionType: string;
  learningGoals: string[];
  htmlPreview: string;
  actionsSummary: string;
  blueprint?: LearningBlueprint;
  signal?: AbortSignal;
}

export async function evaluatePedagogy(ctx: PedagogyEvalContext): Promise<AgentEvaluation> {
  const startTime = Date.now();
  const agentName = 'Pedagogy Evaluator';

  try {
    const raw = await withAbortableTimeout(
      (signal) => generateWithConfiguredModel({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(ctx) },
        ],
        temperature: 0.1,
        requestPreset: 'reviewer',
        profileRole: 'reviewer',
        signal,
        metadata: {
          stage: 'pedagogy_evaluator',
          promptVersion: 'pedagogy-evaluator-v1',
        },
      }),
      resolveEvaluatorTimeoutMs(),
      'Pedagogy evaluation timed out.',
      ctx.signal,
    );

    const parsed = parseJsonResponse(raw) as {
      score?: number;
      passed?: boolean;
      summary?: string;
      blueprintAlignment?: number;
      learningObjectiveCoverage?: number;
      variableCoverage?: number;
      knowledgeConstraintSatisfaction?: number;
      gradeAppropriateness?: number;
      bloomAppropriateness?: number;
      issues?: Array<{ severity?: string; category?: string; message?: string; suggestion?: string; target?: string; evidence?: string }>;
    };

    const issues: AgentIssue[] = Array.isArray(parsed.issues)
      ? parsed.issues.map((issue, i) => ({
          id: `ped_issue_${i}`,
          severity: normalizeSeverity(issue.severity),
          category: normalizeCategory(issue.category, 'pedagogy'),
          message: String(issue.message || '未指定问题'),
          suggestion: String(issue.suggestion || '请检查相关教学内容。'),
          target: normalizeTarget(issue.target),
          ...(typeof issue.evidence === 'string' && issue.evidence.trim() ? { evidence: issue.evidence.trim() } : {}),
        }))
      : [];

    const score = normalizeScore(parsed.score) ?? 70;
    const passed = parsed.passed ?? score >= 70;
    const blueprintAlignment = normalizeScore(parsed.blueprintAlignment);
    const learningObjectiveCoverage = normalizeScore(parsed.learningObjectiveCoverage);
    const variableCoverage = normalizeScore(parsed.variableCoverage);
    const knowledgeConstraintSatisfaction = normalizeScore(parsed.knowledgeConstraintSatisfaction);
    const gradeAppropriateness = normalizeScore(parsed.gradeAppropriateness);
    const bloomAppropriateness = normalizeScore(parsed.bloomAppropriateness);

    log.info('Pedagogy evaluation complete', { score, passed, issues: issues.length, durationMs: Date.now() - startTime });

    return {
      agentName,
      score,
      passed,
      summary: String(parsed.summary || '教学评估完成。'),
      issues,
      durationMs: Date.now() - startTime,
      ...(blueprintAlignment !== undefined ? { blueprintAlignment } : {}),
      ...(learningObjectiveCoverage !== undefined ? { learningObjectiveCoverage } : {}),
      ...(variableCoverage !== undefined ? { variableCoverage } : {}),
      ...(knowledgeConstraintSatisfaction !== undefined ? { knowledgeConstraintSatisfaction } : {}),
      ...(gradeAppropriateness !== undefined ? { gradeAppropriateness } : {}),
      ...(bloomAppropriateness !== undefined ? { bloomAppropriateness } : {}),
    };
  } catch (e) {
    if (ctx.signal?.aborted) throw new Error('已取消');
    log.warn('Pedagogy evaluation failed, using fallback', { error: e instanceof Error ? e.message : String(e) });
    return createNonBlockingEvaluatorFallback({
      agentName,
      issueId: 'ped_fallback_1',
      category: 'pedagogy',
      message: '教学评估 Agent 超时或未能返回结果，已作为非阻塞 warning 记录。',
      suggestion: '请人工检查教学目标、知识约束、变量覆盖和年级适配；生成主流程可继续。',
      target: 'lessonPlan',
      startTime,
      error: e,
    });
  }
}

const SYSTEM_PROMPT = `你是 STEMotion PedagogyEvaluatorAgent。

任务：对照 LearningBlueprint 评估交互式学习组件的教育有效性。

输出规则：
- 返回纯 JSON，不要写 Markdown。
- 如果没有 LearningBlueprint，按基础教学质量维度评估，但不要输出蓝图结构化分数。

评分维度：
- Expected Insight Alignment 20%：是否引导学生得出 blueprint.expectedInsight。
- Learning Objective Coverage 20%：是否覆盖 learningObjectives，是否遗漏目标。
- Variable Coverage 20%：independent 可调，dependent 可观察，controlled 被说明或固定。
- Knowledge Constraint Satisfaction 20%：must 级约束、公式、单位、阶段顺序是否正确。
- Grade and Bloom Appropriateness 10%：难度是否匹配 gradeRange 和 bloomLevel。
- Scaffolding 10%：guided 有明确引导，inquiry 保留探索空间。

JSON 格式:
{
  "score": 85,
  "passed": true,
  "summary": "一句话总结",
  "blueprintAlignment": 90,
  "learningObjectiveCoverage": 85,
  "variableCoverage": 80,
  "knowledgeConstraintSatisfaction": 95,
  "gradeAppropriateness": 90,
  "bloomAppropriateness": 80,
  "issues": [
    {
      "severity": "low|medium|high|critical",
      "category": "pedagogy|curriculum",
      "message": "问题描述",
      "evidence": "可选，说明触发原因",
      "suggestion": "修复建议",
      "target": "lessonPlan|html|teacherActions"
    }
  ]
}

评分标准：
- 90-100：优秀，教学设计精准。
- 80-89：良好，小问题不影响使用。
- 70-79：可用，需要改进。
- 60-69：不足，需要大幅修改。
- <60：失败，需要重新设计。`;

const INTERNAL_REVIEWER_FLOW = buildInternalMultiAgentPlanningPrompt({
  mode: 'reviewer',
  artifactKind: 'pedagogy evaluation JSON',
  outputInstruction: '返回纯 JSON，覆盖教学有效性和 Reviewer/Critic 中的功能正确性、可视化质量、UI/UX 风险。',
});

function buildUserPrompt(ctx: PedagogyEvalContext): string {
  const blueprintSection = ctx.blueprint
    ? `\n## LearningBlueprint\n${JSON.stringify(ctx.blueprint, null, 2)}\n`
    : '\n## LearningBlueprint\n未提供，请按基础教学质量维度评估，不要输出蓝图结构化分数。\n';

  return `${INTERNAL_REVIEWER_FLOW}

请评估以下交互式学习组件的教学质量：

## 基本信息
- 用户输入：${ctx.prompt}
- 标题：${ctx.title}
- 核心概念：${ctx.concept}
- 学科：${ctx.subject}
- 年级：${ctx.gradeLevel}
- 交互类型：${ctx.interactionType}

## 教学目标
${ctx.learningGoals.map((g) => `- ${g}`).join('\n')}

${blueprintSection}

## 描述
${ctx.description}

## 教师动作概览
${ctx.actionsSummary}

## HTML 组件预览（前 800 字符）
${ctx.htmlPreview.slice(0, 800)}

请从教学有效性的角度评估这个组件。如果提供了 LearningBlueprint，必须严格对照 expectedInsight、learningObjectives、coreVariables、knowledgeConstraints、gradeRange、bloomLevel 与 scaffoldingLevel。`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeScore(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const score = value <= 1 ? value * 100 : value;
  return clamp(Math.round(score), 0, 100);
}

function normalizeSeverity(value: unknown): AgentIssue['severity'] {
  return value === 'critical' || value === 'high' || value === 'medium' || value === 'low' || value === 'warning' ? value : 'medium';
}

function normalizeCategory(value: unknown, fallback: AgentIssue['category']): AgentIssue['category'] {
  const valid: AgentIssue['category'][] = ['pedagogy', 'ux', 'safety', 'runtime', 'curriculum', 'accessibility', 'schema'];
  return valid.includes(value as AgentIssue['category']) ? (value as AgentIssue['category']) : fallback;
}

function normalizeTarget(value: unknown): AgentIssue['target'] | undefined {
  const valid = ['lessonPlan', 'html', 'teacherActions', 'schema', 'all'];
  return valid.includes(value as string) ? (value as AgentIssue['target']) : undefined;
}
