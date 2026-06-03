import { validateInteractiveHtml } from '@/lib/generation/htmlSafety';
import type { AgentEvaluation, AgentIssue } from '../types';

let issueCounter = 0;

export function evaluateSafety(html: string): AgentEvaluation {
  const startTime = Date.now();
  const agentName = 'Safety Evaluator';
  const result = validateInteractiveHtml(html);

  const issues: AgentIssue[] = result.errors.map((error) => {
    const isCritical = /fetch|iframe|WebSocket|XMLHttpRequest|EventSource|import|navigator\.sendBeacon|document\.cookie|window\.open/i.test(error);
    return {
      id: `saf_issue_${++issueCounter}`,
      severity: isCritical ? 'critical' as const : 'high' as const,
      category: 'safety' as const,
      message: error,
      suggestion: isCritical ? '移除违规的外部资源访问或嵌套元素。' : '补充缺失的必要元素。',
      target: 'html' as const,
    };
  });

  const score = result.ok ? 100 : Math.max(0, 100 - issues.length * 15);
  const passed = result.ok;

  return {
    agentName,
    score,
    passed,
    summary: result.ok ? 'HTML 安全校验通过。' : `发现 ${issues.length} 个安全问题。`,
    issues,
    durationMs: Date.now() - startTime,
  };
}
