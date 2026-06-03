import type { ExperimentPlan } from '../agentPipeline';
import { parseJsonResponse } from '../jsonParser';
import { createFallbackExperimentPlan } from '../fallbacks';
import { generateWithConfiguredModel } from '../llmClient';
import { plannerSystemPrompt } from '../promptTemplates';
import { withTimeout } from '@/lib/utils/withTimeout';
import { createLogger } from '@/lib/logger';

const log = createLogger('plannerAgent');

export async function runExperimentPlannerAgent(prompt: string): Promise<ExperimentPlan> {
  let raw: string;

  try {
    raw = await withTimeout(
      generateWithConfiguredModel({
        messages: [
          { role: 'system', content: plannerSystemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        maxTokens: 131072,
      }),
      18000,
    );
  } catch (e) {
    log.warn('PlannerAgent LLM call failed, using fallback', { error: e instanceof Error ? e.message : String(e) });
    return createFallbackExperimentPlan(prompt);
  }

  const first = parseJsonResponse(raw);

  try {
    return validateExperimentPlan(first, prompt);
  } catch (error) {
    const repairHint = error instanceof Error ? error.message : String(error);
    const repairedRaw = await withTimeout(
      generateWithConfiguredModel({
        messages: [
          { role: 'system', content: plannerSystemPrompt },
          {
            role: 'user',
            content: `The previous JSON was invalid: ${repairHint}\nReturn a complete corrected JSON plan for this request: ${prompt}`,
          },
        ],
        temperature: 0.1,
        maxTokens: 131072,
      }),
      8000,
    ).catch((e) => {
      log.warn('PlannerAgent repair call failed', { error: e instanceof Error ? e.message : String(e) });
      return '';
    });

    return repairedRaw ? validateExperimentPlan(parseJsonResponse(repairedRaw), prompt) : createFallbackExperimentPlan(prompt);
  }
}

function validateExperimentPlan(value: unknown, originalPrompt: string): ExperimentPlan {
  if (!value || typeof value !== 'object') {
    throw new Error('PlannerAgent did not return a JSON object.');
  }

  const plan = value as Partial<ExperimentPlan>;
  if (!plan.id || !plan.title || !plan.subject || !plan.concept || !plan.description) {
    throw new Error('PlannerAgent output is missing required plan fields.');
  }

  const learningGoals =
    Array.isArray(plan.learningGoals) && plan.learningGoals.length > 0
      ? plan.learningGoals.map(String).slice(0, 5)
      : createFallbackLearningGoals(plan);

  const variables =
    Array.isArray(plan.variables) && plan.variables.length > 0
      ? plan.variables
      : createFallbackVariables(plan.concept ?? originalPrompt);

  const quiz = normalizeQuiz(plan, originalPrompt);

  return {
    id: toKebab(plan.id),
    title: String(plan.title),
    subject: normalizeSubject(plan.subject),
    gradeLevel: String(plan.gradeLevel ?? 'K-12'),
    concept: String(plan.concept),
    description: String(plan.description),
    learningGoals,
    variables: variables.map((variable, index) => ({
      name: toCamel(String(variable.name || `variable${index + 1}`)),
      label: String(variable.label || variable.name || `Variable ${index + 1}`),
      min: Number(variable.min ?? 0),
      max: Number(variable.max ?? 10),
      default: Number(variable.default ?? variable.min ?? 0),
      step: Number(variable.step ?? 1),
      unit: variable.unit ? String(variable.unit) : undefined,
    })),
    animationIntent: String(plan.animationIntent ?? 'Use visible motion or dynamic visual changes to explain the concept.'),
    formulae: Array.isArray(plan.formulae)
      ? plan.formulae.map((formula, index) => ({
          id: toKebab(String(formula.id || `formula-${index + 1}`)),
          title: String(formula.title || `Formula ${index + 1}`),
          latex: String(formula.latex || ''),
        }))
      : [],
    quiz: {
      question: quiz.question,
      options: quiz.options,
      correctAnswer: quiz.correctAnswer,
      explanation: quiz.explanation,
    },
    safetyNotes: Array.isArray(plan.safetyNotes) ? plan.safetyNotes.map(String) : [],
    messageTargets: Array.isArray(plan.messageTargets)
      ? plan.messageTargets.map((target) => ({
          id: String(target.id),
          purpose: String(target.purpose ?? ''),
        }))
      : [],
  };
}

function createFallbackLearningGoals(plan: Partial<ExperimentPlan>): string[] {
  const concept = String(plan.concept || plan.title || '这个 STEM 概念');
  return [
    `观察 ${concept} 的关键变化`,
    '调节变量并比较结果',
    '用公式或图像解释现象',
  ];
}

function createFallbackVariables(concept: unknown): ExperimentPlan['variables'] {
  const text = String(concept);
  if (/酸|碱|滴定|中和/.test(text)) {
    return [
      { name: 'acidVolume', label: '酸液体积', min: 0, max: 50, default: 20, step: 1, unit: 'mL' },
      { name: 'baseVolume', label: '碱液体积', min: 0, max: 50, default: 20, step: 1, unit: 'mL' },
    ];
  }
  if (/电|欧姆|电阻|电压|电流/.test(text)) {
    return [
      { name: 'voltage', label: '电压', min: 1, max: 24, default: 12, step: 1, unit: 'V' },
      { name: 'resistance', label: '电阻', min: 1, max: 100, default: 20, step: 1, unit: 'Ω' },
    ];
  }
  return [
    { name: 'inputValue', label: '输入变量', min: 0, max: 10, default: 5, step: 0.5 },
  ];
}

function normalizeQuiz(
  plan: Partial<ExperimentPlan>,
  originalPrompt: string,
): ExperimentPlan['quiz'] {
  const options = Array.isArray(plan.quiz?.options) ? plan.quiz.options.map(String).filter(Boolean) : [];
  const hasUsableQuiz = plan.quiz?.question && options.length >= 2;

  if (hasUsableQuiz) {
    return {
      question: String(plan.quiz?.question),
      options,
      correctAnswer: String(plan.quiz?.correctAnswer || options[0]),
      explanation: String(plan.quiz?.explanation ?? ''),
    };
  }

  const concept = String(plan.concept || plan.title || originalPrompt || '这个实验');
  return {
    question: `在“${concept}”中，改变一个变量后最应该观察什么？`,
    options: ['系统状态或测量结果的变化', '页面背景颜色是否变化', '按钮数量是否增加'],
    correctAnswer: '系统状态或测量结果的变化',
    explanation: '互动实验的核心是通过变量变化观察现象、数据和规律之间的关系。',
  };
}

function normalizeSubject(subject: unknown): ExperimentPlan['subject'] {
  if (subject === 'chemistry' || subject === 'math' || subject === 'biology') return subject;
  return 'physics';
}

function toKebab(value: string) {
  return value
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function toCamel(value: string) {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr: string) => chr.toUpperCase())
    .replace(/^[^a-zA-Z]+/, '');
  return cleaned ? cleaned[0].toLowerCase() + cleaned.slice(1) : 'variable';
}

