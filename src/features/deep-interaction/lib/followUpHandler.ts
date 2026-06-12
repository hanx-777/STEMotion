import { createGameSchema, createMindMapSchema, createThreeDVisualizationSchema } from './schemas';
import type {
  DeepInteractionType,
  InteractionArtifact,
  InteractionSchema,
  SimulationSchema,
} from './types';
import { validateInteractionArtifact } from './validators';

export interface FollowUpResult {
  artifact: InteractionArtifact;
  message: string;
}

export interface LLMFollowUpResult {
  html: string;
  message: string;
}

export function handleMockFollowUp(current: InteractionArtifact, prompt: string): FollowUpResult {
  const text = prompt.trim();
  const nextType = detectTypeChange(text);
  const now = new Date().toISOString();

  let schema: InteractionSchema;
  let message = '已根据你的追问创建一个新版本。';

  if (nextType && nextType !== current.type) {
    schema = createSchemaForType(nextType, current.title);
    message = `已把当前内容转换为${typeLabel(nextType)}版本。`;
  } else {
    schema = updateSchema(current.schema, text);
    if (text.includes('摩擦')) message = '已创建新版本：摩擦系数被调高，方便观察减速效果。';
    if (text.includes('图像') || text.includes('图表')) message = '已创建新版本：增加了速度-时间图像配置。';
    if (text.includes('选择题') || text.includes('题')) message = '已创建新版本：追加了一道课堂选择题。';
    if (text.includes('质量')) message = '已创建新版本：增加了关于质量与加速度关系的讲解。';
  }

  const artifact: InteractionArtifact = {
    id: `artifact_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    sessionId: current.sessionId,
    type: schema.type,
    title: schema.title,
    description: schema.description,
    schema,
    status: 'ready',
    version: current.version + 1,
    createdAt: now,
    updatedAt: now,
  };

  validateInteractionArtifact(artifact);
  return { artifact, message };
}

function createSchemaForType(type: DeepInteractionType, topic: string): InteractionSchema {
  if (type === 'mind_map') return createMindMapSchema(topic);
  if (type === 'game') return createGameSchema(topic);
  if (type === '3d_visualization') return createThreeDVisualizationSchema(topic);
  return currentSimulationFallback(topic);
}

function updateSchema(schema: InteractionSchema, text: string): InteractionSchema {
  if (schema.type === 'simulation') {
    return updateSimulationSchema(schema, text);
  }

  if (text.includes('选择题') || text.includes('题')) {
    return {
      ...schema,
      quiz: [
        ...(schema.quiz ?? []),
        {
          id: `q_follow_${Date.now().toString(36)}`,
          question: '根据刚才的交互内容，哪种学习方式最能帮助你发现规律？',
          options: ['主动调节变量并观察结果', '只记住结论', '跳过实验', '忽略反馈'],
          correctAnswer: '主动调节变量并观察结果',
          explanation: '深度交互模式强调动手探索和根据反馈修正理解。',
        },
      ],
    };
  }

  return {
    ...schema,
    explanationSteps: [
      ...schema.explanationSteps,
      {
        id: `follow_${Date.now().toString(36)}`,
        title: '追问解释',
        narration: text.includes('为什么') ? '这个追问可以通过比较变量与结果的关系来回答。' : '已把你的追问加入讲解流程。',
      },
    ],
  };
}

function updateSimulationSchema(schema: SimulationSchema, text: string): SimulationSchema {
  let next: SimulationSchema = { ...schema };

  if (text.includes('摩擦')) {
    next = {
      ...next,
      parameters: next.parameters.map((parameter) =>
        parameter.id === 'friction'
          ? { ...parameter, value: Math.min(parameter.max, Number(parameter.value) + 0.12) }
          : parameter,
      ),
    };
  }

  if (text.includes('图像') || text.includes('图表')) {
    next = {
      ...next,
      charts: [
        ...(next.charts ?? []),
        {
          id: `chart_${Date.now().toString(36)}`,
          title: '速度-时间图像',
          xMetric: 'time',
          yMetric: 'velocity',
        },
      ],
    };
  }

  if (text.includes('选择题') || text.includes('题')) {
    next = {
      ...next,
      quiz: [
        ...(next.quiz ?? []),
        {
          id: `q_follow_${Date.now().toString(36)}`,
          question: '增大摩擦系数后，小车的加速度通常会怎样变化？',
          options: ['变大', '变小', '不可能变化', '一定等于重力加速度'],
          correctAnswer: '变小',
          explanation: '摩擦项 μgcosθ 变大，会抵消更多沿斜面方向的加速效果。',
        },
      ],
    };
  }

  if (text.includes('质量')) {
    next = {
      ...next,
      explanationSteps: [
        ...next.explanationSteps,
        {
          id: `mass_note_${Date.now().toString(36)}`,
          title: '为什么质量不改变理想加速度',
          narration: '在简化模型中，重力分力和摩擦力都与质量成正比，代入 F=ma 后质量会约去。',
          actions: [{ id: `mass_formula_${Date.now().toString(36)}`, type: 'show_formula', formulaId: 'acceleration', durationMs: 900 }],
        },
      ],
    };
  }

  return next;
}

function detectTypeChange(text: string): DeepInteractionType | null {
  if (text.includes('思维导图')) return 'mind_map';
  if (text.includes('游戏')) return 'game';
  if (text.includes('3D') || text.includes('三维')) return '3d_visualization';
  if (text.includes('模拟实验')) return 'simulation';
  return null;
}

function currentSimulationFallback(topic: string): InteractionSchema {
  return {
    type: 'simulation',
    subject: 'general',
    simulationType: 'generic_simulation',
    title: `${topic}模拟实验`,
    description: '把当前主题转换为模拟实验版本。',
    learningGoals: ['观察变量变化', '总结实验规律'],
    parameters: [{ id: 'variable', label: '关键变量', value: 5, defaultValue: 5, min: 0, max: 10, step: 1 }],
    objects: [{ id: 'object', label: '实验对象', objectType: 'generic' }],
    formulas: [],
    actions: [],
    metrics: [{ id: 'result', label: '结果' }],
    explanationSteps: [{ id: 'intro', title: '开始模拟', narration: '调节变量并观察结果。' }],
  };
}

function typeLabel(type: DeepInteractionType): string {
  if (type === '3d_visualization') return '3D 可视化';
  if (type === 'simulation') return '模拟实验';
  if (type === 'game') return '游戏';
  return '思维导图';
}
