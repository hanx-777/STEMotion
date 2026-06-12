import type { DeepInteractionType } from './types';

export const interactionTypeMeta: Record<
  DeepInteractionType,
  { label: string; description: string; accent: string }
> = {
  '3d_visualization': {
    label: '3D 可视化',
    description: '三维可视化呈现，让抽象结构更直观。',
    accent: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  },
  simulation: {
    label: '模拟实验',
    description: '流程模拟和实验环境，观察动态变化和结果。',
    accent: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  game: {
    label: '游戏',
    description: '知识小游戏，通过交互挑战加深理解和记忆。',
    accent: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  mind_map: {
    label: '思维导图',
    description: '结构化知识组织，帮助学习者建立整体概念框架。',
    accent: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  rag_visualization: {
    label: 'RAG可视化',
    description: '从问答生成的物理可视化',
    accent: 'border-teal-200 bg-teal-50 text-teal-700',
  },
};

export const interactionTypeOrder: DeepInteractionType[] = [
  '3d_visualization',
  'simulation',
  'game',
  'mind_map',
  'rag_visualization',
];

export const labGenerationTypeOrder: DeepInteractionType[] = [
  'simulation',
  'game',
  'mind_map',
  '3d_visualization',
];
