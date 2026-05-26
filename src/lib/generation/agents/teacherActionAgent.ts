import type { ExperimentAction } from '../../schema/actions';
import { parseJsonResponse } from '../jsonParser';
import type { ExplanationStep } from '../../schema/experiment';
import type { ExperimentPlan } from '../agentPipeline';
import { createFallbackTeacherActions } from '../fallbacks';
import { generateWithConfiguredModel } from '../llmClient';
import { teacherActionSystemPrompt } from '../promptTemplates';

export interface TeacherActionResult {
  actions: ExperimentAction[];
  explanationSteps: ExplanationStep[];
}

const ALLOWED_ACTION_TYPES = new Set([
  'speech',
  'highlight_object',
  'highlight_formula',
  'set_parameter',
  'start_simulation',
  'pause_simulation',
  'reset_simulation',
  'show_formula',
  'show_metric',
  'show_quiz',
  'compare_result',
  'set_widget_state',
  'highlight_widget_element',
  'annotate_widget_element',
  'reveal_widget_element',
]);

export async function runTeacherActionAgent(plan: ExperimentPlan, html: string): Promise<TeacherActionResult> {
  const first = await generateTeacherActions(plan, html).catch(() => null);

  if (!first) {
    return createFallbackTeacherActions(plan);
  }

  try {
    return validateTeacherActions(first);
  } catch (error) {
    const repairHint = error instanceof Error ? error.message : String(error);
    const repaired = await generateTeacherActions(plan, html, repairHint).catch(() => null);
    return repaired ? validateTeacherActions(repaired) : createFallbackTeacherActions(plan);
  }
}

async function generateTeacherActions(
  plan: ExperimentPlan,
  html: string,
  repairHint?: string,
): Promise<unknown> {
  const raw = await withTimeout(
    generateWithConfiguredModel({
      messages: [
        { role: 'system', content: teacherActionSystemPrompt(plan, html, repairHint) },
        { role: 'user', content: `Generate teacher actions for: ${plan.title}` },
      ],
      temperature: repairHint ? 0.1 : 0.25,
      maxTokens: 131072,
    }),
    repairHint ? 6000 : 8000,
  );

  return parseJsonResponse(raw);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('TeacherActionAgent timed out.')), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function validateTeacherActions(value: unknown): TeacherActionResult {
  if (!value || typeof value !== 'object') {
    throw new Error('TeacherActionAgent did not return a JSON object.');
  }

  const result = value as { actions?: unknown; explanationSteps?: unknown };
  if (!Array.isArray(result.actions) || result.actions.length === 0) {
    throw new Error('TeacherActionAgent output must include a non-empty actions array.');
  }

  const actions = result.actions.map(normalizeAction);
  if (!actions.some((action) => action.type === 'speech')) {
    throw new Error('Teacher actions must include at least one speech action.');
  }
  if (!actions.some((action) => action.type === 'set_widget_state')) {
    actions.push({
      id: 'set_demo_state',
      type: 'set_widget_state',
      state: { running: true },
      duration: 1200,
    });
  }
  if (!actions.some((action) => action.type === 'show_quiz')) {
    actions.push({ id: 'show_main_quiz', type: 'show_quiz', quizId: 'main_quiz', duration: 900 });
  }

  const actionIds = new Set(actions.map((action) => action.id));
  const explanationSteps = Array.isArray(result.explanationSteps)
    ? result.explanationSteps.map((step, index) => normalizeStep(step, index, actionIds))
    : [
        {
          id: 'step_1',
          title: '实验导入',
          narration: '观察互动实验中的变量变化，并把现象和公式联系起来。',
          actionIds: actions.map((action) => action.id),
        },
      ];

  return { actions, explanationSteps };
}

function normalizeAction(action: unknown): ExperimentAction {
  if (!action || typeof action !== 'object') {
    throw new Error('Each action must be an object.');
  }

  const candidate = action as Record<string, unknown>;
  const type = String(candidate.type ?? '');
  if (!ALLOWED_ACTION_TYPES.has(type)) {
    throw new Error(`Unsupported action type: ${type}`);
  }

  const id = String(candidate.id || `${type}_${Math.random().toString(36).slice(2, 8)}`);
  const duration = Number(candidate.duration ?? 1000);
  return { ...candidate, id, type, duration } as ExperimentAction;
}

function normalizeStep(step: unknown, index: number, actionIds: Set<string>): ExplanationStep {
  if (!step || typeof step !== 'object') {
    throw new Error('Each explanation step must be an object.');
  }

  const candidate = step as Record<string, unknown>;
  const ids = Array.isArray(candidate.actionIds)
    ? candidate.actionIds.map(String).filter((id) => actionIds.has(id))
    : [];

  return {
    id: String(candidate.id || `step_${index + 1}`),
    title: String(candidate.title || `步骤 ${index + 1}`),
    narration: String(candidate.narration || ''),
    actionIds: ids.length > 0 ? ids : Array.from(actionIds),
  };
}
