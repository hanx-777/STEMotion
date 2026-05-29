import type {
  VisualizationDecision,
  VisualizationSpec,
  ProjectileMotionSpec,
  FunctionGraphSpec,
  ForceDiagramSpec,
  AlgorithmTraceSpec,
} from './types';

export function generateVisualizationSpec(input: {
  decision: VisualizationDecision;
  question: string;
  answerText?: string;
}): VisualizationSpec | undefined {
  if (!input.decision.shouldVisualize || !input.decision.visualizationType) {
    return undefined;
  }

  switch (input.decision.visualizationType) {
    case 'projectile_motion':
      return generateProjectileSpec(input.decision);
    case 'function_graph':
      return generateFunctionGraphSpec(input.decision, input.question, input.answerText ?? '');
    case 'force_diagram':
      return generateForceDiagramSpec(input.decision, input.question, input.answerText ?? '');
    case 'algorithm_trace':
      return generateAlgorithmTraceSpec(input.decision, input.question, input.answerText ?? '');
    default:
      return undefined;
  }
}

function generateProjectileSpec(decision: VisualizationDecision): ProjectileMotionSpec {
  const params = decision.extractedParameters;
  return {
    type: 'projectile_motion',
    title: '抛体运动轨迹',
    description: `初速度 ${params.v0 ?? '?'}m/s，抛射角 ${params.angle_deg ?? '?'}°`,
    parameters: {
      v0: typeof params.v0 === 'number' ? params.v0 : undefined,
      angle_deg: typeof params.angle_deg === 'number' ? params.angle_deg : undefined,
      g: typeof params.g === 'number' ? params.g : 9.8,
    },
  };
}

function generateFunctionGraphSpec(
  decision: VisualizationDecision,
  question: string,
  answerText: string,
): FunctionGraphSpec | undefined {
  const exprMatch = question.match(/f\(x\)\s*=\s*([^\s,，。]+)/i)
    || question.match(/y\s*=\s*([^\s,，。]+)/i);
  if (!exprMatch) return undefined;

  const rawExpr = exprMatch[1];
  const evaluator = latexToEvaluator(rawExpr);
  if (!evaluator) return undefined;

  return {
    type: 'function_graph',
    title: `函数 ${rawExpr} 的图像`,
    description: '基于题目分析的函数图像',
    expressions: [{
      id: 'f1',
      label: `f(x) = ${rawExpr}`,
      latex: rawExpr,
      evaluator,
      color: '#2563eb',
    }],
    domain: { xMin: -3, xMax: 3 },
    pointsOfInterest: extractKeyPoints(answerText),
    gridVisible: true,
  };
}

function latexToEvaluator(latex: string): string | undefined {
  let expr = latex.trim();
  expr = expr.replace(/e\^{([^}]+)}/g, (_, inner) => `Math.exp(${inner.replace(/x/g, 'x')})`);
  expr = expr.replace(/\\sqrt{([^}]+)}/g, 'Math.sqrt($1)');
  expr = expr.replace(/\\frac{([^}]+)}{([^}]+)}/g, '($1)/($2)');
  expr = expr.replace(/\\sin/g, 'Math.sin');
  expr = expr.replace(/\\cos/g, 'Math.cos');
  expr = expr.replace(/\\tan/g, 'Math.tan');
  expr = expr.replace(/\\ln/g, 'Math.log');
  expr = expr.replace(/\\pi/g, 'Math.PI');
  expr = expr.replace(/\^({([^}]+)}|(\w+))/g, (_, _full, braced, simple) => {
    const exp = braced ?? simple;
    return `**(${exp})`;
  });
  expr = expr.replace(/\*/g, '*');

  if (/[;`\\]/.test(expr) || /\beval\b/.test(expr) || /\bFunction\b/.test(expr)) {
    return undefined;
  }
  return expr;
}

function extractKeyPoints(answerText: string): FunctionGraphSpec['pointsOfInterest'] {
  const points: FunctionGraphSpec['pointsOfInterest'] = [];
  const extremumMatch = answerText.match(/极[大值小值]+.*?x\s*=\s*([-\d.]+)/g);
  if (extremumMatch) {
    for (const m of extremumMatch.slice(0, 3)) {
      const xMatch = m.match(/x\s*=\s*([-\d.]+)/);
      if (xMatch) {
        points.push({ x: Number(xMatch[1]), y: 0, label: '极值点', type: 'extremum' });
      }
    }
  }
  return points;
}

function generateForceDiagramSpec(
  decision: VisualizationDecision,
  question: string,
  answerText: string,
): ForceDiagramSpec | undefined {
  void decision;
  const isIncline = /斜面|incline/i.test(question) || /斜面/i.test(answerText);
  const angleMatch = question.match(/(\d+(?:\.\d+)?)\s*(?:°|度)/);
  const angleDeg = angleMatch ? Number(angleMatch[1]) : undefined;

  const forces: ForceDiagramSpec['forces'] = [
    { id: 'gravity', label: '重力', symbol: 'mg', magnitude: 'mg', angleDeg: 270, color: '#dc2626', explanation: '竖直向下' },
  ];

  if (isIncline) {
    forces.push(
      { id: 'normal', label: '支持力', symbol: 'N', magnitude: 'N', angleDeg: 90 - (angleDeg ?? 0), color: '#2563eb', explanation: '垂直斜面向上' },
      { id: 'friction', label: '摩擦力', symbol: 'f', magnitude: 'f', angleDeg: (angleDeg ?? 0), color: '#f59e0b', explanation: '沿斜面向上' },
    );
  } else {
    forces.push(
      { id: 'normal', label: '支持力', symbol: 'N', magnitude: 'N', angleDeg: 90, color: '#2563eb', explanation: '垂直向上' },
    );
  }

  return {
    type: 'force_diagram',
    title: isIncline ? '斜面受力分析' : '受力分析',
    description: isIncline ? `斜面倾角 ${angleDeg ?? '?'}°` : '物体受力示意图',
    scene: isIncline ? 'incline' : 'horizontal',
    objectLabel: '物体',
    angleDeg,
    forces,
  };
}

function generateAlgorithmTraceSpec(
  decision: VisualizationDecision,
  question: string,
  answerText: string,
): AlgorithmTraceSpec | undefined {
  void decision;
  const isStack = /栈|stack/i.test(question) || /栈|stack/i.test(answerText);
  const isQueue = /队列|queue/i.test(question) || /队列|queue/i.test(answerText);

  let dataStructure: AlgorithmTraceSpec['dataStructure'] = 'array';
  if (isStack) dataStructure = 'stack';
  else if (isQueue) dataStructure = 'queue';

  const inputMatch = question.match(/\[([^\]]+)\]/);
  const inputExample = inputMatch ? `[${inputMatch[1]}]` : '[示例输入]';

  return {
    type: 'algorithm_trace',
    title: isStack ? '单调栈过程演示' : isQueue ? '队列过程演示' : '算法过程演示',
    description: `${dataStructure} 数据结构的操作过程`,
    algorithmName: isStack ? 'monotonic_stack' : isQueue ? 'queue_operations' : 'algorithm',
    dataStructure,
    inputExample,
    steps: [{
      stepIndex: 1,
      operation: '初始化',
      state: { [dataStructure]: [], output: [] },
      explanation: '初始化数据结构',
    }],
  };
}
