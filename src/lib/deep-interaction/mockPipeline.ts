import { classifyDeepInteractionPrompt } from './classifier';
import type { DeepInteractionStreamEvent, InteractionOutline } from './events';
import { makeId } from '@/lib/utils/makeId';
import {
  createGameSchema,
  createInclinedPlaneSchema,
  createMindMapSchema,
  createOhmsLawSchema,
  createThreeDVisualizationSchema,
} from './schemas';
import type {
  DeepInteractionType,
  InteractionArtifact,
  InteractionGradeLevel,
  InteractionSchema,
  InteractionSession,
} from './types';
import { validateInteractionArtifact, validateInteractionSchema, validateInteractionSession } from './validators';

export interface DeepInteractionGenerateInput {
  prompt: string;
  gradeLevel?: InteractionGradeLevel;
  preferredType?: DeepInteractionType;
  existingSessionId?: string;
  currentArtifactId?: string;
}

export type EmitDeepInteractionEvent = (event: DeepInteractionStreamEvent) => void;

export async function runMockDeepInteractionPipeline(
  input: DeepInteractionGenerateInput,
  emit: EmitDeepInteractionEvent,
): Promise<void> {
  const classified = classifyDeepInteractionPrompt(input.prompt, input.preferredType, input.gradeLevel);
  const now = new Date().toISOString();
  const sessionId = input.existingSessionId ?? makeId('session');
  const initialType = classified.unsupportedProgramming ? 'mind_map' : classified.interactionType;

  const session: InteractionSession = {
    id: sessionId,
    title: makeTitle(classified.topic, initialType),
    topic: classified.topic,
    subject: classified.subject,
    gradeLevel: classified.gradeLevel,
    mode: 'deep_interaction',
    interactionType: initialType,
    status: 'planning',
    progress: 5,
    messages: [
      {
        id: makeId('message'),
        role: 'user',
        content: input.prompt,
        createdAt: now,
      },
    ],
    artifacts: [],
    createdAt: now,
    updatedAt: now,
  };

  validateInteractionSession(session);
  emit({ type: 'session_created', session, progress: 5 });
  await wait(360);

  emit({
    type: 'progress',
    stage: 'planning',
    message: '正在理解学习主题...',
    progress: 10,
  });
  await wait(420);

  if (classified.unsupportedProgramming) {
    emit({
      type: 'progress',
      stage: 'selecting_type',
      message: classified.message!,
      progress: 18,
    });
    await wait(520);
  }

  emit({
    type: 'type_selected',
    interactionType: initialType,
    message: `已选择交互类型：${getTypeLabel(initialType)}`,
    progress: 25,
  });
  await wait(420);

  const outline = createOutline(classified.topic, initialType);
  emit({
    type: 'outline_generated',
    outline,
    progress: 45,
  });
  await wait(520);

  emit({
    type: 'progress',
    stage: 'generating_schema',
    message: '正在生成结构化交互数据...',
    progress: 58,
  });
  await wait(480);

  const schema = createSchema(classified.topic, initialType);
  validateInteractionSchema(schema);
  emit({
    type: 'schema_generated',
    schemaPreview: createSchemaPreview(schema),
    progress: 70,
  });
  await wait(460);

  emit({
    type: 'validation_started',
    message: '正在校验生成结果...',
    progress: 82,
  });
  await wait(420);

  const artifact: InteractionArtifact = {
    id: makeId('artifact'),
    sessionId,
    type: schema.type,
    title: schema.title,
    description: schema.description,
    schema,
    status: 'ready',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  validateInteractionArtifact(artifact);

  emit({ type: 'artifact_ready', artifact, progress: 100 });
}

export function createSchema(topic: string, type: DeepInteractionType): InteractionSchema {
  if (type === 'simulation') {
    if (topic.includes('欧姆') || topic.includes('电路') || topic.includes('电阻') || topic.includes('电压')) {
      return createOhmsLawSchema();
    }
    return createInclinedPlaneSchema(topic.includes('斜面') ? '斜面小车模拟实验' : `${topic || 'STEM'}模拟实验`);
  }
  if (type === 'mind_map') return createMindMapSchema(topic);
  if (type === '3d_visualization') return createThreeDVisualizationSchema(topic);
  return createGameSchema(topic);
}

function createOutline(topic: string, type: DeepInteractionType): InteractionOutline {
  if (type === 'simulation') {
    return {
      title: topic.includes('电路') || topic.includes('欧姆') ? '欧姆定律模拟实验' : '斜面小车实验',
      steps: ['识别变量', '调节参数', '观察动态变化', '总结规律'],
    };
  }
  if (type === 'mind_map') {
    return {
      title: `${topic || '主题'}知识结构`,
      steps: ['确定中心主题', '展开一级概念', '连接公式和应用', '用问题检查理解'],
    };
  }
  if (type === '3d_visualization') {
    return {
      title: `${topic || '结构'}3D 可视化`,
      steps: ['建立三维对象', '添加标签', '规划观察路径', '引导空间理解'],
    };
  }
  return {
    title: `${topic || 'STEM'}游戏挑战`,
    steps: ['设定规则', '生成关卡', '提供即时反馈', '复盘关键知识'],
  };
}

function createSchemaPreview(schema: InteractionSchema) {
  return {
    type: schema.type,
    title: schema.title,
    learningGoals: schema.learningGoals.slice(0, 3),
    explanationSteps: schema.explanationSteps.map((step) => step.title),
  };
}

function makeTitle(topic: string, type: DeepInteractionType): string {
  if (type === 'simulation') return topic.includes('电路') || topic.includes('欧姆') ? '欧姆定律探索' : '斜面小车探索';
  if (type === 'mind_map') return '知识结构探索';
  if (type === '3d_visualization') return '三维结构探索';
  return '知识挑战探索';
}

function getTypeLabel(type: DeepInteractionType): string {
  const labels: Record<DeepInteractionType, string> = {
    '3d_visualization': '3D 可视化',
    simulation: '模拟实验',
    game: '游戏',
    mind_map: '思维导图',
    rag_visualization: 'RAG可视化',
  };
  return labels[type];
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
