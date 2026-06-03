import type { RagTaskType } from './types';

export interface RagQueryPlan {
  original_query: string;
  rewritten_queries: string[];
  keywords: string[];
  task_type: RagTaskType;
}

export function planRagQuery(question: string, taskType: RagTaskType): RagQueryPlan {
  const normalized = question.trim().replace(/\s+/g, ' ');
  const keywords = extractKeywords(normalized);
  const rewritten = new Set<string>([normalized]);

  if (/斜抛|抛体|projectile/i.test(normalized)) {
    rewritten.add(`${normalized} 斜抛运动 最大高度 水平射程 速度分解`);
  }
  if (/圆周|向心|circular/i.test(normalized)) {
    rewritten.add(`${normalized} 匀速圆周运动 向心加速度 速度方向`);
  }
  if (/错|错误|诊断|misconception/i.test(normalized) || taskType === 'misconception_diagnosis') {
    rewritten.add(`${normalized} 常见误区 公式适用条件`);
  }
  if (/备课|课堂|演示|teacher/i.test(normalized) || taskType === 'teacher_prep') {
    rewritten.add(`${normalized} 教学目标 课堂演示 互动提问`);
  }

  return {
    original_query: normalized,
    rewritten_queries: [...rewritten],
    keywords,
    task_type: taskType,
  };
}

function extractKeywords(query: string): string[] {
  const tokens = query
    .toLowerCase()
    .match(/[a-z0-9]+|[\u4e00-\u9fff]{2,}|[\u4e00-\u9fff]/g) ?? [];
  const stopWords = new Set(['一个', '什么', '为什么', '如何', '怎么', '请', '求', '的', '是', '了']);
  return [...new Set(tokens)]
    .filter((token) => token.length > 1 && !stopWords.has(token))
    .slice(0, 12);
}
