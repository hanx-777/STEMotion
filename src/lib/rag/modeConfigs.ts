import { getSubjectModePrompt } from './defaultPrompts';
import type { RagTaskType } from './types';

export type RagMode = 'student' | 'teacher' | 'visualization';

export interface ModeTaskConfig {
  subId: string;
  label: string;
  taskType: RagTaskType;
  description: string;
  recommendedQuestion: string;
}

export interface ModeConfig {
  mode: RagMode;
  title: string;
  subtitle: string;
  defaultTaskType: RagTaskType;
  defaultSubId: string;
  defaultQuestion: string;
  examplesDisplayMode: 'hidden' | 'cards';
  tasks: ModeTaskConfig[];
}

export const MODE_CONFIGS: Record<RagMode, ModeConfig> = {
  student: {
    mode: 'student',
    title: '学生助学',
    subtitle: '面向大学物理力学学习场景，提供知识讲解、分步解题、错因诊断和学习建议。',
    defaultTaskType: 'step_solution',
    defaultSubId: 'step_solution',
    defaultQuestion: '在大学物理力学实验中，某小球从高度 h = 1.20 m 的平台边缘以初速度 v0 = 8.0 m/s、仰角 θ = 35° 斜向上抛出。忽略空气阻力，取 g = 9.8 m/s²。请建立二维运动模型，求小球落地时间、水平射程、最大高度，并分析 θ 对射程的影响。要求说明模型假设、公式适用条件、单位检查和易错点，并给出可视化参数。',
    examplesDisplayMode: 'hidden',
    tasks: [
      { subId: 'knowledge_qa', label: '知识讲解', taskType: 'knowledge_qa', description: '解释概念、公式和物理直觉', recommendedQuestion: '为什么匀速圆周运动速度大小不变但仍然有加速度？' },
      { subId: 'step_solution', label: '分步解题', taskType: 'step_solution', description: '提取信息、判断模型、分步推导、计算结果', recommendedQuestion: '一个小球以 20 m/s 初速度、30 度角斜向上抛出，忽略空气阻力，求最大高度和水平射程。' },
      { subId: 'misconception_diagnosis', label: '错因诊断', taskType: 'misconception_diagnosis', description: '分析错误答案，指出公式误用和复习建议', recommendedQuestion: '学生答案：斜抛最大高度 H = v0² / 2g。请判断是否正确并说明原因。' },
    ],
  },
  teacher: {
    mode: 'teacher',
    title: '教师助教',
    subtitle: '面向大学物理力学教学场景，辅助教师生成课堂导入、演示流程、互动问题和课后练习。',
    defaultTaskType: 'teacher_prep',
    defaultSubId: 'teacher_classprep',
    defaultQuestion: '请为「斜抛运动最大高度与水平射程」设计一段 10 分钟课堂演示，要求包含课堂导入、核心公式、互动提问、可视化演示参数和课后练习。',
    examplesDisplayMode: 'cards',
    tasks: [
      { subId: 'teacher_classprep', label: '课堂备课', taskType: 'teacher_prep', description: '生成教学目标、课堂导入、核心公式和教学流程', recommendedQuestion: '请为「斜抛运动最大高度与水平射程」设计一段 10 分钟课堂演示。' },
      { subId: 'teacher_demo_design', label: '演示设计', taskType: 'teacher_prep', description: '生成课堂可视化演示流程和参数建议', recommendedQuestion: '请设计一个用于讲解斜抛运动轨迹的课堂可视化演示。' },
      { subId: 'teacher_practice_gen', label: '练习生成', taskType: 'teacher_prep', description: '围绕当前知识点生成练习题和易错点提醒', recommendedQuestion: '请围绕斜抛运动生成 3 道由易到难的课堂练习题。' },
    ],
  },
  visualization: {
    mode: 'visualization',
    title: '可视化演示',
    subtitle: '基于大学物理力学模型生成运动参数卡、轨迹图和轻量动态演示，帮助理解抽象运动过程。',
    defaultTaskType: 'step_solution',
    defaultSubId: 'viz_trajectory',
    defaultQuestion: '生成一个初速度 20 m/s、发射角 30 度、g = 9.8 m/s² 的斜抛运动轨迹演示。',
    examplesDisplayMode: 'cards',
    tasks: [
      { subId: 'viz_trajectory', label: '斜抛轨迹', taskType: 'step_solution', description: '根据初速度、发射角和重力加速度生成运动轨迹图', recommendedQuestion: '生成一个初速度 20 m/s、发射角 30 度、g = 9.8 m/s² 的斜抛运动轨迹演示。' },
      { subId: 'viz_animation', label: '动态演示', taskType: 'step_solution', description: '打开页面内轻量动画，观察运动过程', recommendedQuestion: '演示斜抛运动中水平速度和竖直速度随时间的变化。' },
      { subId: 'viz_params', label: '参数分析', taskType: 'step_solution', description: '提取并展示 v0、角度、g、最大高度和水平射程', recommendedQuestion: '分析 v0 = 20 m/s、角度 = 30° 时斜抛运动的关键参数。' },
    ],
  },
};

export function getModeConfig(mode: string): ModeConfig {
  return MODE_CONFIGS[(mode in MODE_CONFIGS ? mode : 'student') as RagMode];
}

export function getSubjectModeConfig(mode: string, subject: string): ModeConfig {
  const baseConfig = getModeConfig(mode);
  const subjectPrompt = getSubjectModePrompt(subject, baseConfig.mode);

  return {
    ...baseConfig,
    defaultQuestion: subjectPrompt.defaultQuestion,
    tasks: baseConfig.tasks.map((task) => ({
      ...task,
      recommendedQuestion: subjectPrompt.tasks[task.subId] ?? task.recommendedQuestion,
    })),
  };
}
