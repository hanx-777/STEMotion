import type { VisualizationSpec, VisualizationQualityCheck } from './types';

const DANGEROUS_EVAL_PATTERNS = [
  /\beval\s*\(/,
  /\bnew\s+Function\s*\(/,
  /\bimport\s*\(/,
  /\brequire\s*\(/,
  /\bprocess\b/,
  /\bglobal\b/,
  /\bwindow\b/,
  /\bdocument\b/,
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /`/,
];

export function checkVisualizationSpec(spec: VisualizationSpec): VisualizationQualityCheck {
  const issues: string[] = [];

  if (!spec.title?.trim()) issues.push('[ERROR] 缺少标题');
  if (!spec.description?.trim()) issues.push('[ERROR] 缺少说明');

  switch (spec.type) {
    case 'function_graph':
      checkFunctionGraph(spec, issues);
      break;
    case 'force_diagram':
      checkForceDiagram(spec, issues);
      break;
    case 'algorithm_trace':
      checkAlgorithmTrace(spec, issues);
      break;
    case 'projectile_motion':
      checkProjectileMotion(spec, issues);
      break;
  }

  const errorCount = issues.filter((i) => i.startsWith('[ERROR]')).length;
  return {
    passed: errorCount === 0,
    score: Math.max(0, 100 - issues.length * 15),
    issues,
  };
}

function checkFunctionGraph(
  spec: Extract<VisualizationSpec, { type: 'function_graph' }>,
  issues: string[],
): void {
  if (!spec.expressions?.length) {
    issues.push('[ERROR] 函数图像缺少表达式');
    return;
  }

  const { domain } = spec;
  if (domain.xMin >= domain.xMax) {
    issues.push('[ERROR] 定义域无效：xMin 必须小于 xMax');
  }
  if (domain.xMax - domain.xMin > 1000) {
    issues.push('[WARNING] 定义域范围过大，可能影响渲染性能');
  }

  for (const expr of spec.expressions) {
    if (!expr.evaluator?.trim()) {
      issues.push(`[ERROR] 表达式 ${expr.id} 缺少 evaluator`);
      continue;
    }
    for (const pattern of DANGEROUS_EVAL_PATTERNS) {
      if (pattern.test(expr.evaluator)) {
        issues.push(`[ERROR] 表达式 ${expr.id} 的 evaluator 包含不安全代码`);
        break;
      }
    }
  }

  for (const point of spec.pointsOfInterest ?? []) {
    if (point.x < domain.xMin || point.x > domain.xMax) {
      issues.push(`[WARNING] 关键点 "${point.label}" 超出定义域范围`);
    }
  }
}

function checkForceDiagram(
  spec: Extract<VisualizationSpec, { type: 'force_diagram' }>,
  issues: string[],
): void {
  if (!spec.forces?.length) {
    issues.push('[ERROR] 受力图缺少力的信息');
    return;
  }

  for (const force of spec.forces) {
    if (force.angleDeg < 0 || force.angleDeg >= 360) {
      issues.push(`[WARNING] 力 "${force.label}" 角度超出 [0, 360) 范围`);
    }
  }
}

function checkAlgorithmTrace(
  spec: Extract<VisualizationSpec, { type: 'algorithm_trace' }>,
  issues: string[],
): void {
  if (!spec.steps?.length) {
    issues.push('[ERROR] 算法过程缺少步骤');
    return;
  }

  for (let i = 0; i < spec.steps.length; i++) {
    if (spec.steps[i].stepIndex !== i + 1) {
      issues.push(`[WARNING] 步骤索引不连续：期望 ${i + 1}，实际 ${spec.steps[i].stepIndex}`);
      break;
    }
  }
}

function checkProjectileMotion(
  spec: Extract<VisualizationSpec, { type: 'projectile_motion' }>,
  issues: string[],
): void {
  const { parameters } = spec;
  if (parameters.v0 !== undefined && parameters.v0 <= 0) {
    issues.push('[ERROR] 初速度 v0 必须大于 0');
  }
  if (parameters.angle_deg !== undefined && (parameters.angle_deg <= 0 || parameters.angle_deg >= 90)) {
    issues.push('[ERROR] 抛射角必须在 (0, 90) 度之间');
  }
  if (parameters.g <= 0) {
    issues.push('[ERROR] 重力加速度 g 必须大于 0');
  }
}
