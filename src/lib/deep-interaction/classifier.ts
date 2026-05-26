import type { DeepInteractionType, InteractionGradeLevel, InteractionSubject } from './types';

export interface ClassifiedPrompt {
  subject: InteractionSubject;
  gradeLevel: InteractionGradeLevel;
  interactionType: DeepInteractionType;
  topic: string;
  unsupportedProgramming: boolean;
  message?: string;
}

const includesAny = (value: string, words: string[]) => words.some((word) => value.includes(word));

export function classifyDeepInteractionPrompt(
  prompt: string,
  preferredType?: DeepInteractionType,
  gradeLevel: InteractionGradeLevel = 'middle_school',
): ClassifiedPrompt {
  const normalized = prompt.trim();
  const lower = normalized.toLowerCase();

  const unsupportedProgramming =
    includesAny(normalized, ['代码', '编程', '运行']) ||
    includesAny(lower, ['python', 'javascript', 'java']);

  const subject = classifySubject(normalized, lower);
  const fallbackType = selectType(normalized, lower);

  return {
    subject,
    gradeLevel,
    interactionType: preferredType ?? fallbackType,
    topic: normalized || 'STEM 探究主题',
    unsupportedProgramming,
    message: unsupportedProgramming
      ? '当前深度交互模式暂不提供在线编程功能。你可以选择 3D 可视化、模拟实验、游戏或思维导图来探索这个知识点。'
      : undefined,
  };
}

function classifySubject(prompt: string, lower: string): InteractionSubject {
  if (includesAny(prompt, ['斜面', '小车', '摩擦', '重力', '速度', '加速度', '欧姆', '电压', '电阻', '电路'])) {
    return 'physics';
  }
  if (includesAny(prompt, ['酸', '碱', '中和', '滴定', '反应', '分子', '晶体', '化学'])) {
    return 'chemistry';
  }
  if (includesAny(prompt, ['函数', '几何', '二次', '方程', '概率', '导数']) || lower.includes('math')) {
    return 'math';
  }
  if (includesAny(prompt, ['细胞', '生态', '生物', '人体'])) {
    return 'biology';
  }
  return 'general';
}

function selectType(prompt: string, lower: string): DeepInteractionType {
  if (includesAny(prompt, ['斜面', '小车', '摩擦', '重力', '速度', '加速度'])) return 'simulation';
  if (includesAny(prompt, ['欧姆', '电压', '电阻', '电路'])) return 'simulation';
  if (includesAny(prompt, ['分子', '晶体', '立体', '空间', '结构'])) return '3d_visualization';
  if (includesAny(prompt, ['游戏', '闯关', '挑战', '配平'])) return 'game';
  if (includesAny(prompt, ['思维导图', '知识结构', '复习', '总结', '框架'])) return 'mind_map';
  if (lower.includes('3d')) return '3d_visualization';
  return 'simulation';
}
