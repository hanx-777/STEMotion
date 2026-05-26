import type { AgentEvaluation, AgentIssue } from '../types';

let issueCounter = 0;

const CHECKS: Array<{ pattern: RegExp; label: string; points: number }> = [
  { pattern: /WIDGET_READY/, label: '运行时上报代码 (WIDGET_READY)', points: 10 },
  { pattern: /WIDGET_RUNTIME_REPORT/, label: '运行时上报代码 (WIDGET_RUNTIME_REPORT)', points: 5 },
  { pattern: /WIDGET_RUNTIME_ERROR/, label: '错误上报代码 (WIDGET_RUNTIME_ERROR)', points: 5 },
  { pattern: /WIDGET_PONG/, label: 'PING/PONG 通信', points: 5 },
  { pattern: /WIDGET_ACTION_ACK/, label: '动作确认 (WIDGET_ACTION_ACK)', points: 5 },
  { pattern: /addEventListener\s*\(\s*['"]error['"]/, label: '全局错误监听', points: 10 },
  { pattern: /id=['"]start-btn['"]|start.*button|开始/i, label: '开始按钮', points: 10 },
  { pattern: /id=['"]reset-btn['"]|reset.*button|重置/i, label: '重置按钮', points: 10 },
  { pattern: /id=['"]visualization['"]|id=['"]canvas['"]|id=['"]stage['"]/, label: '主舞台元素', points: 10 },
  { pattern: /id=['"]controls['"]/, label: '控件区域', points: 5 },
  { pattern: /requestAnimationFrame/, label: '动画帧循环', points: 10 },
  { pattern: /addEventListener\s*\(\s*['"]message['"]/, label: 'postMessage 监听', points: 10 },
];

export function evaluateRuntime(html: string): AgentEvaluation {
  const startTime = Date.now();
  const agentName = 'Runtime Evaluator';
  const issues: AgentIssue[] = [];
  let score = 5; // base score

  for (const check of CHECKS) {
    if (check.pattern.test(html)) {
      score += check.points;
    }
  }

  // Check for critical missing items
  const hasMessageListener = /addEventListener\s*\(\s*['"]message['"]/.test(html);
  const hasStartButton = /start|开始/i.test(html);
  const hasResetButton = /reset|重置/i.test(html);
  const hasRAF = /requestAnimationFrame/.test(html);

  if (!hasMessageListener) {
    issues.push({
      id: `rt_issue_${++issueCounter}`,
      severity: 'high',
      category: 'runtime',
      message: '缺少 postMessage 监听器。',
      suggestion: '添加 window.addEventListener("message", ...) 处理教师动作。',
      target: 'html',
    });
  }

  if (!hasStartButton) {
    issues.push({
      id: `rt_issue_${++issueCounter}`,
      severity: 'medium',
      category: 'runtime',
      message: '未检测到开始/运行按钮。',
      suggestion: '添加明显的开始按钮供学生启动交互。',
      target: 'html',
    });
  }

  if (!hasResetButton) {
    issues.push({
      id: `rt_issue_${++issueCounter}`,
      severity: 'medium',
      category: 'runtime',
      message: '未检测到重置按钮。',
      suggestion: '添加重置按钮供学生重新开始。',
      target: 'html',
    });
  }

  if (!hasRAF) {
    issues.push({
      id: `rt_issue_${++issueCounter}`,
      severity: 'high',
      category: 'runtime',
      message: '未检测到 requestAnimationFrame 动画循环。',
      suggestion: '使用 requestAnimationFrame 处理动画更新。',
      target: 'html',
    });
  }

  score = Math.min(100, score);
  const passed = score >= 70 && !issues.some((i) => i.severity === 'high' || i.severity === 'critical');

  return {
    agentName,
    score,
    passed,
    summary: passed
      ? `运行时检查通过（${score}/100）。`
      : `运行时检查发现 ${issues.length} 个问题（${score}/100）`,
    issues,
    durationMs: Date.now() - startTime,
  };
}
