import type { ExperimentAction } from '../schema/actions';
import type { ExperimentConfig, ExperimentParameter, SubjectType } from '../schema/experiment';
import { validateExperimentConfig } from './validators';
import { runExperimentPlannerAgent } from './agents/experimentPlannerAgent';
import { runTeacherActionAgent } from './agents/teacherActionAgent';
import { runWidgetCodeAgent } from './agents/widgetCodeAgent';
import { extractWidgetConfig } from './htmlSafety';
import { ALLOWED_WIDGET_MESSAGES } from './promptTemplates';

export interface ExperimentPlanVariable {
  name: string;
  label: string;
  min: number;
  max: number;
  default: number;
  step: number;
  unit?: string;
}

export interface ExperimentPlan {
  id: string;
  title: string;
  subject: SubjectType;
  gradeLevel: string;
  concept: string;
  description: string;
  learningGoals: string[];
  variables: ExperimentPlanVariable[];
  animationIntent: string;
  formulae: Array<{ id: string; title: string; latex: string }>;
  quiz: {
    question: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
  };
  safetyNotes: string[];
  messageTargets: Array<{ id: string; purpose: string }>;
}

export async function runExperimentAgentPipeline(prompt: string): Promise<ExperimentConfig> {
  if (!prompt.trim()) {
    throw new Error('请输入一个 STEM 实验或动画需求。');
  }

  const plan = await runExperimentPlannerAgent(prompt);
  const html = await runWidgetCodeAgent(plan);
  const teacher = await runTeacherActionAgent(plan, html);
  const widgetConfig = withRequiredWidgetConfig(extractWidgetConfig(html), plan);
  const actions = withFormulaAndQuizActions(teacher.actions, plan);

  const config: ExperimentConfig = {
    id: plan.id,
    title: plan.title,
    subject: plan.subject,
    gradeLevel: plan.gradeLevel,
    description: plan.description,
    learningGoals: plan.learningGoals,
    renderer: 'interactive_html',
    environment: {
      generatedBy: 'ExperimentAgentPipeline',
      concept: plan.concept,
      safetyNotes: plan.safetyNotes,
    },
    objects: [
      {
        id: 'interactive-widget',
        type: 'html_widget',
        label: plan.title,
        initialState: widgetConfig.defaultState as Record<string, unknown>,
      },
    ],
    parameters: plan.variables.map(toParameter),
    simulation: {
      type: 'placeholder',
      model: plan.formulae.map((formula) => formula.latex).join('; ') || plan.concept,
      timeStepMs: 16,
      durationSeconds: 12,
      trackedMetrics: plan.variables.map((variable) => variable.name),
    },
    interactiveWidget: {
      html,
      widgetType: 'simulation',
      widgetConfig,
      allowedMessageTypes: [...ALLOWED_WIDGET_MESSAGES],
    },
    actions,
    explanationSteps: teacher.explanationSteps,
    quiz: [
      {
        id: 'main_quiz',
        type: 'multiple_choice',
        question: plan.quiz.question,
        options: plan.quiz.options,
        correctAnswer: plan.quiz.correctAnswer,
        explanation: plan.quiz.explanation,
      },
    ],
  };

  return validateExperimentConfig(config);
}

function toParameter(variable: ExperimentPlanVariable): ExperimentParameter {
  return {
    id: variable.name,
    label: variable.label,
    type: 'number',
    defaultValue: variable.default,
    min: variable.min,
    max: variable.max,
    step: variable.step,
    unit: variable.unit,
  };
}

function withRequiredWidgetConfig(
  widgetConfig: Record<string, unknown>,
  plan: ExperimentPlan,
): Record<string, unknown> {
  const defaultState =
    widgetConfig.defaultState && typeof widgetConfig.defaultState === 'object'
      ? (widgetConfig.defaultState as Record<string, unknown>)
      : Object.fromEntries(plan.variables.map((variable) => [variable.name, variable.default]));

  return {
    ...widgetConfig,
    type: String(widgetConfig.type ?? 'simulation'),
    concept: String(widgetConfig.concept ?? plan.concept),
    variables: Array.isArray(widgetConfig.variables) ? widgetConfig.variables : plan.variables,
    defaultState,
    messageTargets: Array.isArray(widgetConfig.messageTargets)
      ? widgetConfig.messageTargets
      : plan.messageTargets,
  };
}

function withFormulaAndQuizActions(actions: ExperimentAction[], plan: ExperimentPlan): ExperimentAction[] {
  const next = [...actions];

  for (const formula of plan.formulae) {
    if (formula.latex && !next.some((action) => action.type === 'show_formula' && action.formulaId === formula.id)) {
      next.splice(Math.min(2, next.length), 0, {
        id: `show_${formula.id}`,
        type: 'show_formula',
        formulaId: formula.id,
        title: formula.title,
        latex: formula.latex,
        duration: 900,
      });
    }
  }

  if (!next.some((action) => action.type === 'show_quiz')) {
    next.push({ id: 'show_main_quiz', type: 'show_quiz', quizId: 'main_quiz', duration: 900 });
  }

  return next;
}
