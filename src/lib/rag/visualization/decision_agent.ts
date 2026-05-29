import type { VisualizationDecision, VisualizationType } from './types';
import { DETECTION_PATTERNS } from './detection_patterns';

export function decideVisualization(input: {
  question: string;
  answerText?: string;
}): VisualizationDecision {
  const text = `${input.question} ${input.answerText ?? ''}`;
  const scores: Array<{ type: VisualizationType; score: number; matched: string[] }> = [];

  for (const pattern of DETECTION_PATTERNS) {
    const matched: string[] = [];
    for (const keyword of pattern.keywords) {
      const match = keyword.exec(text);
      if (match) matched.push(match[0]);
    }
    const score = matched.length / pattern.keywords.length;
    scores.push({ type: pattern.type, score, matched });
  }

  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];

  if (!best || best.score < 0.15) {
    return {
      shouldVisualize: false,
      confidence: best?.score ?? 0,
      reason: '题目不涉及需要可视化的内容',
      extractedParameters: {},
    };
  }

  if (best.type === 'projectile_motion') {
    return buildProjectileDecision(input.question, best.score);
  }

  return {
    shouldVisualize: best.score >= 0.3,
    visualizationType: best.score >= 0.3 ? best.type : undefined,
    confidence: best.score,
    reason: best.score >= 0.3
      ? `检测到${typeLabel(best.type)}相关内容：${best.matched.join('、')}`
      : `部分匹配${typeLabel(best.type)}，但置信度不足`,
    extractedParameters: {},
  };
}

function buildProjectileDecision(question: string, score: number): VisualizationDecision {
  const v0 = matchNumber(question, /(\d+(?:\.\d+)?)\s*(?:m\/s|米\/秒|mps)/i);
  const angle = matchNumber(question, /(\d+(?:\.\d+)?)\s*(?:°|度)/i);
  const g = matchNumber(question, /g\s*[=：:]?\s*(\d+(?:\.\d+)?)/i) ?? 9.8;

  return {
    shouldVisualize: true,
    visualizationType: 'projectile_motion',
    confidence: Math.max(score, 0.8),
    reason: '检测到抛体运动问题',
    extractedParameters: { v0, angle_deg: angle, g },
  };
}

function matchNumber(value: string, pattern: RegExp): number | undefined {
  const matched = pattern.exec(value);
  if (!matched) return undefined;
  const parsed = Number(matched[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function typeLabel(type: VisualizationType): string {
  const labels: Record<VisualizationType, string> = {
    function_graph: '函数图像',
    force_diagram: '受力分析',
    algorithm_trace: '算法过程',
    projectile_motion: '抛体运动',
  };
  return labels[type];
}
