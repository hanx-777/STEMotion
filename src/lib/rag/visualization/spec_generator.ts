import type {
  VisualizationDecision,
  VisualizationSpec,
  ProjectileMotionSpec,
  FunctionGraphSpec,
  ForceDiagramSpec,
  InteractiveHtmlSpec,
  RagVisualizationBrief,
} from './types';
import { generateInteractiveHtml, type HtmlGenerationInput } from './htmlGenerator';
import { detectMissingParameters } from './clarificationAgent';
import { generateAlgorithmTraceSpecFromText } from './algorithmTraceSpec';
import { extractFunctionExpression } from './briefAgent';

export async function generateVisualizationSpec(input: {
  decision: VisualizationDecision;
  question: string;
  answerText?: string;
  formulaBlocks?: Array<{ latex: string; explanation?: string }>;
  finalResults?: Array<{ label: string; value: string; unit?: string }>;
  brief?: RagVisualizationBrief;
}): Promise<VisualizationSpec | undefined> {
  if (!input.decision.shouldVisualize || !input.decision.visualizationType) {
    return undefined;
  }

  switch (input.decision.visualizationType) {
    case 'projectile_motion':
      return generateProjectileSpec(input.decision, input.question, input.answerText ?? '', input.brief);
    case 'function_graph':
      return generateFunctionGraphSpec(input.decision, input.question, input.answerText ?? '', input.brief);
    case 'force_diagram':
      return generateForceDiagramSpec(input.decision, input.question, input.answerText ?? '', input.brief);
    case 'algorithm_trace':
      return generateAlgorithmTraceSpecFromText(input.question, input.answerText ?? '', input.brief);
    case 'interactive_html':
      return generateInteractiveHtmlSpec(input);
    default:
      return undefined;
  }
}

async function generateInteractiveHtmlSpec(input: {
  decision: VisualizationDecision;
  question: string;
  answerText?: string;
  formulaBlocks?: Array<{ latex: string; explanation?: string }>;
  finalResults?: Array<{ label: string; value: string; unit?: string }>;
  brief?: RagVisualizationBrief;
}): Promise<InteractiveHtmlSpec> {
  const { decision, question, answerText = '' } = input;

  // Check for missing parameters
  const clarificationQuestions = detectMissingParameters(
    decision.visualizationType || 'custom',
    decision.extractedParameters
  );

  if (clarificationQuestions.length > 0) {
    // Return spec with clarification needed
    return {
      type: 'interactive_html',
      title: `${decision.visualizationType || '可视化'}演示`,
      description: '需要补充参数信息',
      html: '',
      interactionType: mapToInteractionType(decision.visualizationType),
      parameters: decision.extractedParameters,
      clarificationNeeded: {
        questions: clarificationQuestions,
      },
    };
  }

  // Generate HTML
  const htmlInput: HtmlGenerationInput = {
    question,
    answerText,
    visualizationType: decision.visualizationType || 'custom',
    extractedParameters: decision.extractedParameters,
    formulaBlocks: input.formulaBlocks,
    finalResults: input.finalResults,
    brief: input.brief,
  };

  const html = await generateInteractiveHtml(htmlInput);

  return {
    type: 'interactive_html',
    title: `${decision.visualizationType || '可视化'}演示`,
    description: decision.reason,
    html,
    interactionType: mapToInteractionType(decision.visualizationType),
    parameters: decision.extractedParameters,
  };
}

function mapToInteractionType(vizType: string | undefined): InteractiveHtmlSpec['interactionType'] {
  if (vizType === 'projectile_motion' || vizType === 'force_diagram') return 'physics_simulation';
  if (vizType === 'function_graph') return 'math_visualization';
  if (vizType === 'algorithm_trace') return 'algorithm_demo';
  return 'custom';
}

function generateProjectileSpec(
  decision: VisualizationDecision,
  question: string,
  answerText: string,
  brief?: RagVisualizationBrief,
): ProjectileMotionSpec {
  const text = `${question}\n${answerText}`;
  const params = decision.extractedParameters;
  const v0 = typeof params.v0 === 'number' ? params.v0 : numberFromBrief(brief, 'v0');
  const angle = typeof params.angle_deg === 'number' ? params.angle_deg : numberFromBrief(brief, 'theta');
  const g = typeof params.g === 'number' ? params.g : numberFromBrief(brief, 'g') ?? 9.8;
  const time = numberFromBrief(brief, 't') ?? matchNumber(text, /(\d+(?:\.\d+)?)\s*(?:s|秒)(?:后|时)?/i);
  const isHorizontal = /平抛/i.test(text) || brief?.knowledgePoint === '平抛运动';
  const x = v0 !== undefined && time !== undefined ? round(v0 * time) : undefined;
  const y = time !== undefined ? round(0.5 * g * time * time) : undefined;
  const description = isHorizontal
    ? [
        v0 !== undefined ? `水平初速度 ${v0}m/s` : '水平初速度待观察',
        time !== undefined ? `时间 ${time}s` : '观察不同时间',
        '竖直方向由重力决定',
      ].join('，')
    : [
        v0 !== undefined ? `初速度 ${v0}m/s` : '初速度待观察',
        angle !== undefined ? `抛射角 ${angle}°` : undefined,
        '观察轨迹和关键运动量',
      ].filter(Boolean).join('，');

  return {
    type: 'projectile_motion',
    title: brief?.knowledgePoint ? `${brief.knowledgePoint}轨迹` : (isHorizontal ? '平抛运动轨迹' : '抛体运动轨迹'),
    description,
    contextTitle: brief?.knowledgePoint,
    knowledgePoint: brief?.knowledgePoint,
    scenario: brief?.scenario,
    variables: brief?.variables,
    visualGoal: brief?.visualGoal,
    brief,
    motionType: isHorizontal ? 'horizontal' : angle !== undefined ? 'angled' : 'generic',
    parameters: {
      v0,
      angle_deg: angle,
      g,
      time_s: time,
      x_m: x,
      y_m: y,
    },
  };
}

function generateFunctionGraphSpec(
  decision: VisualizationDecision,
  question: string,
  answerText: string,
  brief?: RagVisualizationBrief,
): FunctionGraphSpec | undefined {
  void decision;

  const rawExpr = extractFunctionExpression(question) ?? extractFunctionExpression(answerText);
  if (!rawExpr) return undefined;
  const evaluator = latexToEvaluator(rawExpr);
  if (!evaluator) return undefined;
  const pointsOfInterest = extractKeyPoints(answerText, rawExpr);

  return {
    type: 'function_graph',
    title: brief?.knowledgePoint ? `${brief.knowledgePoint}: f(x)=${rawExpr}` : `函数 ${rawExpr} 的图像`,
    description: brief?.visualGoal ?? '基于题目分析的函数图像',
    contextTitle: brief?.knowledgePoint,
    knowledgePoint: brief?.knowledgePoint,
    scenario: brief?.scenario,
    variables: brief?.variables,
    visualGoal: brief?.visualGoal,
    brief,
    expressions: [{
      id: 'f1',
      label: `f(x) = ${rawExpr}`,
      latex: rawExpr,
      evaluator,
      color: '#2563eb',
    }],
    domain: { xMin: -3, xMax: 3 },
    pointsOfInterest,
    intervals: extractIntervals(answerText, rawExpr),
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
  expr = expr.replace(/(\d)(x|Math\.)/g, '$1*$2');
  expr = expr.replace(/x(?=Math\.)/g, 'x*');
  expr = expr.replace(/\)(?=(x|Math\.|\d))/g, ')*');

  if (/[;`\\]/.test(expr) || /\beval\b/.test(expr) || /\bFunction\b/.test(expr)) {
    return undefined;
  }
  return expr;
}

function extractKeyPoints(answerText: string, rawExpr?: string): FunctionGraphSpec['pointsOfInterest'] {
  if (rawExpr === 'xe^{-x^2}' || /±\s*1\s*\/\s*√2|\\sqrt\{2}/.test(answerText)) {
    const x0 = 1 / Math.sqrt(2);
    const y0 = x0 * Math.exp(-x0 * x0);
    return [
      { x: -x0, y: -y0, label: '极小值点', type: 'extremum' },
      { x: x0, y: y0, label: '极大值点', type: 'extremum' },
      { x: 0, y: 0, label: '零点', type: 'intercept' },
    ];
  }

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

function extractIntervals(answerText: string, rawExpr?: string): FunctionGraphSpec['intervals'] {
  if (rawExpr === 'xe^{-x^2}' || /±\s*1\s*\/\s*√2|\\sqrt\{2}/.test(answerText)) {
    const x0 = 1 / Math.sqrt(2);
    return [
      { from: -3, to: -x0, property: 'decreasing', label: '递减' },
      { from: -x0, to: x0, property: 'increasing', label: '递增' },
      { from: x0, to: 3, property: 'decreasing', label: '递减' },
    ];
  }
  return undefined;
}

function generateForceDiagramSpec(
  decision: VisualizationDecision,
  question: string,
  answerText: string,
  brief?: RagVisualizationBrief,
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
    contextTitle: brief?.knowledgePoint,
    knowledgePoint: brief?.knowledgePoint,
    scenario: brief?.scenario,
    variables: brief?.variables,
    visualGoal: brief?.visualGoal,
    brief,
    scene: isIncline ? 'incline' : 'horizontal',
    objectLabel: '物体',
    angleDeg,
    forces,
  };
}

function numberFromBrief(brief: RagVisualizationBrief | undefined, name: string): number | undefined {
  const raw = brief?.variables.find((variable) => variable.name === name)?.value;
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function matchNumber(value: string, pattern: RegExp): number | undefined {
  const matched = pattern.exec(value);
  if (!matched) return undefined;
  const parsed = Number(matched[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
