import type { RagVisualizationBrief, RagVisualizationVariable, VisualizationType } from './types';

export interface RagVisualizationBriefInput {
  question: string;
  answerText?: string;
  subject: string;
  taskType: string;
  recommendedType?: VisualizationType;
}

export function createRagVisualizationBrief(input: RagVisualizationBriefInput): RagVisualizationBrief {
  const question = input.question.trim();
  const text = `${question}\n${input.answerText ?? ''}`;
  const recommendedType = input.recommendedType ?? inferRecommendedType(text);

  if (/平抛/i.test(text)) {
    const v0 = matchNumber(text, /(\d+(?:\.\d+)?)\s*(?:m\/s|米\/秒|mps)/i);
    const time = matchNumber(text, /(\d+(?:\.\d+)?)\s*(?:s|秒)(?:后|时)?/i);
    const g = matchNumber(text, /g\s*[=：:]?\s*(\d+(?:\.\d+)?)/i) ?? 9.8;
    const variables = compactVariables([
      numberVariable('v0', '水平初速度', v0, 'm/s', 'given'),
      numberVariable('t', '运动时间', time, 's', 'given'),
      numberVariable('g', '重力加速度', g, 'm/s^2', 'constant'),
    ]);
    return {
      originalQuestion: question,
      knowledgePoint: '平抛运动',
      scenario: '水平初速度与竖直自由落体的合成运动',
      variables,
      visualGoal: '把水平匀速运动和竖直下落过程对应到同一条轨迹上。',
      recommendedType: 'projectile_motion',
      mustShow: ['水平位移', '竖直位移', '轨迹', '题目给定时间'],
      avoidGenericDemo: true,
      confidence: 0.92,
      source: 'heuristic',
    };
  }

  if (/斜抛|抛体|projectile/i.test(text)) {
    const v0 = matchNumber(text, /(\d+(?:\.\d+)?)\s*(?:m\/s|米\/秒|mps)/i);
    const angle = matchNumber(text, /(\d+(?:\.\d+)?)\s*(?:°|度)/i);
    const g = matchNumber(text, /g\s*[=：:]?\s*(\d+(?:\.\d+)?)/i) ?? 9.8;
    return {
      originalQuestion: question,
      knowledgePoint: angle === undefined ? '抛体运动' : '斜抛运动',
      scenario: angle === undefined ? '抛体轨迹与关键运动量' : '初速度分解后的二维抛体轨迹',
      variables: compactVariables([
        numberVariable('v0', '初速度', v0, 'm/s', 'given'),
        numberVariable('theta', '抛射角', angle, 'deg', 'given'),
        numberVariable('g', '重力加速度', g, 'm/s^2', 'constant'),
      ]),
      visualGoal: '观察初速度、角度和重力如何共同决定轨迹、最大高度和水平射程。',
      recommendedType: 'projectile_motion',
      mustShow: ['轨迹', '速度分解', '最大高度', '水平射程'],
      avoidGenericDemo: true,
      confidence: 0.88,
      source: 'heuristic',
    };
  }

  if (/递归|recursive|调用栈|回溯/.test(text)) {
    const n = matchNumber(text, /n\s*[=：:]\s*(\d+)/i) ?? matchNumber(text, /(\d+)\s*层/) ?? 3;
    return {
      originalQuestion: question,
      knowledgePoint: '递归调用栈',
      scenario: '递归调用从展开到命中边界条件，再逐层回溯返回',
      variables: [numberVariable('n', '递归深度示例', n, undefined, 'example')].filter(Boolean) as RagVisualizationVariable[],
      visualGoal: '展示每一层调用帧如何入栈、暂停、返回并恢复上一层计算。',
      recommendedType: 'algorithm_trace',
      mustShow: ['调用展开', '边界条件', '回溯返回', '调用帧变化'],
      avoidGenericDemo: true,
      confidence: 0.9,
      source: 'heuristic',
    };
  }

  if (/单调栈|next\s+greater|下一个更大|更大元素|每日温度/.test(text)) {
    const inputExample = extractBracketedList(text) ?? '[2,1,2,4,3]';
    return {
      originalQuestion: question,
      knowledgePoint: '单调栈',
      scenario: '用栈保存还没有找到右侧更大元素的下标',
      variables: [{ name: 'nums', label: '输入数组', value: inputExample, role: 'given' }],
      visualGoal: '逐步展示读取元素、弹出已解决下标、写入答案和压入待解决下标。',
      recommendedType: 'algorithm_trace',
      mustShow: ['输入数组', '栈内容', '弹出条件', '输出数组'],
      avoidGenericDemo: true,
      confidence: 0.9,
      source: 'heuristic',
    };
  }

  if (/函数|f\(x\)|单调性|极值|求导|导数/.test(text)) {
    const expression = extractFunctionExpression(text);
    return {
      originalQuestion: question,
      knowledgePoint: /单调性|极值/.test(text) ? '函数单调性与极值' : '函数图像',
      scenario: expression ? `围绕 f(x)=${expression} 观察图像、导数符号和关键点` : '观察函数图像与关键点',
      variables: expression ? [{ name: 'f(x)', label: '函数表达式', value: expression, role: 'given' }] : [],
      visualGoal: '把函数表达式、导数判断和图像上的极值/截距联系起来。',
      recommendedType: 'function_graph',
      mustShow: ['函数曲线', '关键点', '单调区间'],
      avoidGenericDemo: true,
      confidence: expression ? 0.86 : 0.68,
      source: 'heuristic',
    };
  }

  if (/受力|斜面|摩擦力|支持力|重力/.test(text)) {
    return {
      originalQuestion: question,
      knowledgePoint: '受力分析',
      scenario: /斜面/.test(text) ? '物体在斜面上的受力分解' : '物体的自由体受力分析',
      variables: [],
      visualGoal: '把每个力的方向、作用对象和物理含义对应到图中。',
      recommendedType: 'force_diagram',
      mustShow: ['研究对象', '重力', '支持力', '力的方向'],
      avoidGenericDemo: true,
      confidence: 0.78,
      source: 'heuristic',
    };
  }

  return {
    originalQuestion: question,
    knowledgePoint: subjectLabel(input.subject),
    scenario: '围绕原题生成可视化辅助理解',
    variables: [],
    visualGoal: '用可视化呈现题目中的关键关系。',
    recommendedType,
    mustShow: ['原题信息', '关键关系'],
    avoidGenericDemo: true,
    confidence: 0.45,
    source: 'heuristic',
  };
}

function inferRecommendedType(text: string): VisualizationType | undefined {
  if (/平抛|斜抛|抛体|projectile/i.test(text)) return 'projectile_motion';
  if (/函数|f\(x\)|单调性|极值|求导|导数/.test(text)) return 'function_graph';
  if (/递归|调用栈|回溯|单调栈|栈|队列|BFS|DFS/.test(text)) return 'algorithm_trace';
  if (/受力|斜面|摩擦力|支持力|重力/.test(text)) return 'force_diagram';
  return undefined;
}

export function extractFunctionExpression(text: string): string | undefined {
  const match = text.match(/f\(x\)\s*=\s*([^\s,，。；;]+)/i)
    ?? text.match(/y\s*=\s*([^\s,，。；;]+)/i);
  return match?.[1]?.trim();
}

function extractBracketedList(text: string): string | undefined {
  const match = text.match(/\[([^\]]+)]/);
  return match ? `[${match[1].replace(/\s+/g, '')}]` : undefined;
}

function matchNumber(value: string, pattern: RegExp): number | undefined {
  const matched = pattern.exec(value);
  if (!matched) return undefined;
  const parsed = Number(matched[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function numberVariable(
  name: string,
  label: string,
  value: number | undefined,
  unit?: string,
  role?: string,
): RagVisualizationVariable | undefined {
  if (value === undefined) return undefined;
  return { name, label, value: String(value), unit, role };
}

function compactVariables(values: Array<RagVisualizationVariable | undefined>): RagVisualizationVariable[] {
  return values.filter(Boolean) as RagVisualizationVariable[];
}

function subjectLabel(subject: string): string {
  if (subject.includes('physics')) return '物理概念';
  if (subject.includes('computer')) return '算法概念';
  if (subject.includes('math')) return '数学概念';
  return '核心知识点';
}
