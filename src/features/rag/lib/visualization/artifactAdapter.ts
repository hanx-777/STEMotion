import type {
  InteractionArtifact,
  QualityReport,
  RagVisualizationSchema,
} from '@/features/deep-interaction/lib/types';
import type { RagQualityReport } from '@/features/rag/lib/types';
import type { VisualizationSpec } from './types';

export interface RagVisualizationArtifactInput {
  spec: VisualizationSpec;
  source: 'student' | 'teacher';
  subject: string;
  originalQuestion: string;
  taskType: string;
  qualityReport?: RagQualityReport;
  now?: string;
}

export function createRagVisualizationArtifact(input: RagVisualizationArtifactInput): InteractionArtifact {
  const now = input.now ?? new Date().toISOString();
  const timestamp = Date.parse(now);
  const idTimestamp = Number.isNaN(timestamp) ? Date.now() : timestamp;
  const stableSeed = sanitizeIdPart(`${input.source}_${input.subject}_${input.taskType}_${input.spec.type}`);
  const sessionId = `rag_${stableSeed}_${idTimestamp}`;
  const artifactId = `artifact_${sessionId}`;

  const schema: RagVisualizationSchema = {
    type: 'rag_visualization',
    title: input.spec.contextTitle ? `${input.spec.contextTitle}可视化` : input.spec.title,
    description: input.spec.visualGoal ?? input.spec.description,
    learningGoals: learningGoalsForSpec(input.spec),
    explanationSteps: explanationStepsForSpec(input.spec),
    brief: input.spec.brief,
    visualizationSpec: input.spec,
    ragMetadata: {
      source: input.source,
      subject: input.subject,
      originalQuestion: input.originalQuestion,
      taskType: input.taskType,
    },
  };

  return {
    id: artifactId,
    sessionId,
    type: 'rag_visualization',
    title: schema.title,
    description: schema.description,
    schema,
    status: 'ready',
    version: 1,
    createdAt: now,
    updatedAt: now,
    qualityReport: mapQualityReport(input.qualityReport, input.spec),
    finalScore: input.qualityReport?.score,
  };
}

function learningGoalsForSpec(spec: VisualizationSpec): string[] {
  if (spec.brief) {
    return [
      `理解${spec.brief.knowledgePoint}在原题中的作用`,
      spec.brief.visualGoal,
    ];
  }
  if (spec.type === 'algorithm_trace') {
    return [
      '理解算法状态如何逐步变化',
      '观察关键数据结构的入栈、出栈或更新过程',
    ];
  }
  if (spec.type === 'function_graph') {
    return [
      '观察函数图像与关键点',
      '连接表达式、单调性和图形变化',
    ];
  }
  if (spec.type === 'force_diagram') {
    return [
      '识别物体所受主要力',
      '理解力的方向和物理含义',
    ];
  }
  if (spec.type === 'projectile_motion') {
    return [
      '理解初速度、角度和重力对轨迹的影响',
      '通过轨迹形状判断运动过程中的关键量',
    ];
  }
  return ['通过交互式可视化理解核心概念'];
}

function explanationStepsForSpec(spec: VisualizationSpec): RagVisualizationSchema['explanationSteps'] {
  if (spec.brief) {
    return [
      {
        id: 'restore-question',
        title: '还原原题情境',
        narration: spec.brief.scenario,
      },
      {
        id: 'inspect-variables',
        title: '确认关键变量',
        narration: spec.brief.variables.length > 0
          ? spec.brief.variables.map((variable) => `${variable.label}=${variable.value}${variable.unit ?? ''}`).join('；')
          : '从题目和回答中定位核心对象、状态或图形关系。',
      },
      {
        id: 'visual-goal',
        title: '观察演示目标',
        narration: spec.brief.mustShow.join('、'),
      },
    ];
  }
  if (spec.type === 'algorithm_trace') {
    return spec.steps.slice(0, 8).map((step) => ({
      id: `step_${step.stepIndex}`,
      title: `步骤 ${step.stepIndex}: ${step.operation}`,
      narration: step.explanation,
    }));
  }
  if (spec.type === 'function_graph') {
    return [
      { id: 'expression', title: '确认函数表达式', narration: `观察 ${spec.expressions.map((item) => item.label).join('、')} 的图像。` },
      { id: 'points', title: '定位关键点', narration: spec.pointsOfInterest.length > 0 ? '结合截距、极值或自定义关键点理解函数性质。' : '结合坐标轴和曲线变化理解函数性质。' },
    ];
  }
  if (spec.type === 'force_diagram') {
    return [
      { id: 'object', title: '确定研究对象', narration: `研究对象：${spec.objectLabel}。` },
      { id: 'forces', title: '逐个检查受力', narration: `图中包含 ${spec.forces.length} 个主要力，注意每个力的方向和含义。` },
    ];
  }
  if (spec.type === 'projectile_motion') {
    return [
      { id: 'parameters', title: '读取运动参数', narration: spec.description },
      { id: 'trajectory', title: '观察轨迹变化', narration: '将初速度、角度和重力与最大高度、射程和飞行时间对应起来。' },
    ];
  }
  return [
    { id: 'inspect', title: '观察可视化对象', narration: spec.description },
    { id: 'connect', title: '联系原题与回答', narration: '将图形、状态或参数与 RAG 回答中的推导对应起来。' },
  ];
}

function mapQualityReport(report: RagQualityReport | undefined, spec: VisualizationSpec): QualityReport | undefined {
  if (!report) return undefined;

  return {
    passed: report.passed,
    finalScore: report.score,
    level: report.score >= 85 ? 'excellent' : report.score >= 70 ? 'good' : report.score >= 60 ? 'usable' : 'needs_improvement',
    summary: `RAG 生成的 ${spec.type} 可视化`,
    strengths: report.checks.filter((check) => check.passed).map((check) => check.message),
    weaknesses: report.checks.filter((check) => !check.passed).map((check) => check.message),
    suggestions: report.checks
      .filter((check) => !check.passed && (check.severity === 'warning' || check.severity === 'error' || check.severity === 'critical'))
      .map((check) => check.message),
    evaluatorScores: {},
  };
}

function sanitizeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'visualization';
}
