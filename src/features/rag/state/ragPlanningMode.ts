import type { RagMode } from '@/lib/rag/modeConfigs';
import type { RagTaskType } from '@/lib/rag/types';

export type RagPlanningVisualizationMode = 'auto' | 'manual' | 'off';

export interface RagPlanningQuestion {
  id: string;
  label: string;
  prompt: string;
  placeholder: string;
  defaultValue?: string;
}

export interface RagPlanningDraft {
  id: string;
  title: string;
  summary: string;
  question: string;
  subject: string;
  taskType: RagTaskType;
  requiresConfirmation: true;
  steps: string[];
  questions: RagPlanningQuestion[];
}

export interface BuildRagPlanningDraftInput {
  question: string;
  subject: string;
  subjectDisplayName?: string;
  taskType: RagTaskType;
  taskLabel: string;
  mode: RagMode;
  useWebSearch: boolean;
  fastMode: boolean;
  visualizationMode: RagPlanningVisualizationMode;
}

const TASK_INTENT: Record<RagTaskType, string> = {
  knowledge_qa: '解释概念、公式条件和直觉',
  step_solution: '提取条件、建立模型并分步推导',
  misconception_diagnosis: '定位错误、解释原因并给出修正建议',
  teacher_prep: '组织课堂目标、活动流程和互动问题',
};

export function buildRagPlanningDraft(input: BuildRagPlanningDraftInput): RagPlanningDraft {
  const question = normalizeQuestion(input.question);
  const subjectLabel = input.subjectDisplayName || input.subject;
  const questions = inferClarifyingQuestions(input, question).slice(0, 3);
  const steps = [
    `确认任务：${input.taskLabel}，目标是${TASK_INTENT[input.taskType]}。`,
    `检索范围：${subjectLabel} 本地知识库${input.useWebSearch ? '，必要时补充网络检索' : '，不使用网络检索'}。`,
    input.fastMode ? '生成策略：快速模式，优先给出紧凑答案。' : '生成策略：高质量模式，保留证据、公式、单位检查和易错点。',
    visualizationStep(input.visualizationMode),
  ];

  return {
    id: stablePlanId(input, question),
    title: `${input.mode === 'teacher' ? '教师助教' : '智能问答'}规划`,
    summary: questions.length
      ? '我会先补齐关键条件，再开始检索和生成。'
      : '信息已经足够清晰，确认后开始检索和生成。',
    question,
    subject: input.subject,
    taskType: input.taskType,
    requiresConfirmation: true,
    steps,
    questions,
  };
}

export function composeRagQuestionWithPlanningAnswers(
  question: string,
  draft: RagPlanningDraft,
  answers: Record<string, string>,
): string {
  const additions = draft.questions
    .map((item) => {
      const value = (answers[item.id] || item.defaultValue || '').trim();
      return value ? `- ${item.label}: ${value}` : '';
    })
    .filter(Boolean);

  if (additions.length === 0) return question.trim();

  return `${question.trim()}

规划模式补充信息：
${additions.join('\n')}`;
}

function inferClarifyingQuestions(
  input: BuildRagPlanningDraftInput,
  question: string,
): RagPlanningQuestion[] {
  const questions: RagPlanningQuestion[] = [];
  const compact = question.replace(/\s+/g, '');

  if (compact.length < 12 && input.taskType !== 'teacher_prep') {
    questions.push({
      id: 'learning_goal',
      label: '学习目标',
      prompt: '你希望这次回答重点解决什么？',
      placeholder: '例如：讲清概念、分步解题、生成课堂活动',
    });
  }

  if (input.taskType === 'teacher_prep' && !/(分钟|课时|学生|大一|大二|年级)/.test(question)) {
    questions.push({
      id: 'teaching_context',
      label: '教学场景',
      prompt: '这段内容面向谁、课堂时长大约多久？',
      placeholder: '例如：面向大一学生，10 分钟课堂演示',
    });
  }

  if (isProjectileQuestion(question)) {
    if (!hasProjectileSpeed(question)) {
      questions.push({
        id: 'projectile_v0',
        label: '初速度 v0',
        prompt: '斜抛/抛体问题的初速度是多少？',
        placeholder: '例如：20 m/s',
        defaultValue: input.visualizationMode === 'off' ? undefined : '20 m/s',
      });
    }
    if (!hasProjectileAngle(question)) {
      questions.push({
        id: 'projectile_angle',
        label: '发射角 θ',
        prompt: '发射角或方向角是多少？',
        placeholder: '例如：30 度',
        defaultValue: input.visualizationMode === 'off' ? undefined : '30 度',
      });
    }
  }

  if (/受力|斜面|力图|force/i.test(question)) {
    if (!/(kg|千克|质量|m\s*=)/i.test(question)) {
      questions.push({
        id: 'force_mass',
        label: '物体质量',
        prompt: '物体质量是多少？',
        placeholder: '例如：5 kg；未知也可以写“未给出”',
      });
    }
    if (/斜面/.test(question) && !/(°|度|角|theta|θ)/i.test(question)) {
      questions.push({
        id: 'incline_angle',
        label: '斜面角度',
        prompt: '斜面角度是多少？',
        placeholder: '例如：30 度',
      });
    }
  }

  if (/函数|图像|曲线|极值|单调/i.test(question) && !/(f\s*\(|y\s*=|=)/i.test(question)) {
    questions.push({
      id: 'function_expression',
      label: '函数表达式',
      prompt: '要分析的函数表达式是什么？',
      placeholder: '例如：f(x)=x e^{-x^2}',
    });
  }

  return dedupeQuestions(questions);
}

function visualizationStep(mode: RagPlanningVisualizationMode): string {
  if (mode === 'auto') return '可视化：若题目适合，将在回答后自动生成互动可视化并继续审计。';
  if (mode === 'manual') return '可视化：回答后只显示提示，手动确认后再生成互动可视化。';
  return '可视化：本次关闭可视化生成，只保留文本、公式和引用。';
}

function stablePlanId(input: BuildRagPlanningDraftInput, question: string): string {
  return [
    'rag-plan',
    input.mode,
    input.subject,
    input.taskType,
    input.visualizationMode,
    hashText(question),
  ].join(':');
}

function hashText(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function normalizeQuestion(question: string): string {
  return question.replace(/\s+/g, ' ').trim();
}

function isProjectileQuestion(question: string): boolean {
  return /(斜抛|抛体|抛射|射程|最大高度|projectile)/i.test(question);
}

function hasProjectileSpeed(question: string): boolean {
  return /(v0|v₀|初速度|速度)[^。；;，,]*\d|(\d+(?:\.\d+)?)\s*(m\/s|米\/秒|米每秒)/i.test(question);
}

function hasProjectileAngle(question: string): boolean {
  return /(\d+(?:\.\d+)?)\s*(°|度)|θ|theta|角/i.test(question);
}

function dedupeQuestions(questions: RagPlanningQuestion[]): RagPlanningQuestion[] {
  const seen = new Set<string>();
  return questions.filter((question) => {
    if (seen.has(question.id)) return false;
    seen.add(question.id);
    return true;
  });
}
