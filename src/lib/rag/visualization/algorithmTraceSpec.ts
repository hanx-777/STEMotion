import type { AlgorithmTraceSpec, RagVisualizationBrief } from './types';

export function generateAlgorithmTraceSpecFromText(
  question: string,
  answerText = '',
  brief?: RagVisualizationBrief,
): AlgorithmTraceSpec {
  const text = `${question}\n${answerText}`;
  const isStack = /栈|stack/i.test(text);
  const isQueue = /队列|queue/i.test(text);
  const isMonotonicStack = /单调栈|monotonic\s*stack/i.test(text);
  const isNextGreater = /下一个更大|下个更大|next\s+greater|next\s+larger|更大元素|更高温|每日温度/i.test(text);
  const isRecursion = /递归|recursive|调用栈|回溯/i.test(text) || brief?.knowledgePoint === '递归调用栈';

  let dataStructure: AlgorithmTraceSpec['dataStructure'] = 'array';
  if (isStack) dataStructure = 'stack';
  else if (isQueue) dataStructure = 'queue';

  const inputValues = extractNumericInput(question) ?? extractNumericInput(answerText);
  const effectiveInput = inputValues ?? defaultAlgorithmInput(dataStructure);

  if (isRecursion) {
    return withBriefContext(generateRecursionCallStackSpec(text, brief), brief);
  }

  if (isMonotonicStack || (isStack && isNextGreater)) {
    return withBriefContext(generateNextGreaterElementSpec(effectiveInput), brief);
  }

  if (dataStructure === 'stack') {
    return withBriefContext(generateStackOperationSpec(effectiveInput), brief);
  }

  if (dataStructure === 'queue') {
    return withBriefContext(generateQueueOperationSpec(effectiveInput), brief);
  }

  return withBriefContext({
    type: 'algorithm_trace',
    title: '算法过程演示',
    description: `${dataStructure} 数据结构的操作过程`,
    algorithmName: 'algorithm_trace',
    dataStructure,
    inputExample: formatArray(effectiveInput),
    steps: [{
      stepIndex: 1,
      operation: '初始化',
      state: { input: effectiveInput, [dataStructure]: [] },
      explanation: '初始化数据结构',
    }, {
      stepIndex: 2,
      operation: '读取输入',
      state: { input: effectiveInput, [dataStructure]: effectiveInput },
      highlight: ['input', dataStructure],
      explanation: '将题目输入转换为可跟踪的状态序列。',
    }],
  }, brief);
}

export function normalizeAlgorithmTraceSpec(spec: AlgorithmTraceSpec): AlgorithmTraceSpec {
  if (!isWeakAlgorithmTraceSpec(spec)) return spec;

  const text = `${spec.title}\n${spec.description}\n${spec.algorithmName}\n${spec.inputExample}`;
  const input = extractNumericInput(spec.inputExample) ?? defaultAlgorithmInput(spec.dataStructure);

  if (/递归|recursive|调用栈|回溯/i.test(text)) {
    return withBriefContext(generateRecursionCallStackSpec(text, spec.brief), spec.brief);
  }
  if (/单调栈|monotonic/i.test(text)) {
    return withBriefContext(generateNextGreaterElementSpec(input), spec.brief);
  }
  if (spec.dataStructure === 'stack') return withBriefContext(generateStackOperationSpec(input), spec.brief);
  if (spec.dataStructure === 'queue') return withBriefContext(generateQueueOperationSpec(input), spec.brief);
  return generateAlgorithmTraceSpecFromText(text, '', spec.brief);
}

function isWeakAlgorithmTraceSpec(spec: AlgorithmTraceSpec): boolean {
  return (
    !spec.inputExample?.trim()
    || /示例输入|placeholder/i.test(spec.inputExample)
    || spec.steps.length < 2
    || spec.steps.every((step) => /初始化|init/i.test(step.operation))
  );
}

function generateNextGreaterElementSpec(input: number[]): AlgorithmTraceSpec {
  const stack: number[] = [];
  const output = Array<number>(input.length).fill(-1);
  const steps: AlgorithmTraceSpec['steps'] = [];

  const pushStep = (
    operation: string,
    state: Record<string, unknown>,
    explanation: string,
    highlight: string[] = [],
  ) => {
    steps.push({
      stepIndex: steps.length + 1,
      operation,
      state,
      highlight,
      explanation,
    });
  };

  const stateFor = (extra: Record<string, unknown> = {}) => ({
    input,
    stack: stack.map((index) => `${index}:${input[index]}`),
    output: [...output],
    ...extra,
  });

  pushStep(
    '初始化',
    stateFor({ rule: '栈内保持从栈底到栈顶单调不增，output 初始为 -1。' }),
    '准备一个栈保存“还没找到右侧更大元素”的下标。',
    ['stack', 'output'],
  );

  for (let i = 0; i < input.length; i += 1) {
    const current = input[i];
    pushStep(
      `读取 ${current}`,
      stateFor({ i, current }),
      `检查 nums[${i}] = ${current}。如果它大于栈顶元素，就可以为栈顶下标确定答案。`,
      ['i', 'current'],
    );

    while (stack.length > 0 && current > input[stack[stack.length - 1]]) {
      const resolvedIndex = stack.pop()!;
      output[resolvedIndex] = current;
      pushStep(
        `弹出 ${input[resolvedIndex]}`,
        stateFor({ i, current, resolvedIndex }),
        `${current} > ${input[resolvedIndex]}，所以 output[${resolvedIndex}] = ${current}。`,
        ['stack', 'output'],
      );
    }

    stack.push(i);
    pushStep(
      `压入 ${current}`,
      stateFor({ i, current }),
      `下标 ${i} 仍需要等待右侧更大的元素，压入栈中继续跟踪。`,
      ['stack'],
    );
  }

  pushStep(
    '完成',
    stateFor({ unresolved: stack.map((index) => `${index}:${input[index]}`) }),
    stack.length > 0
      ? '栈中剩余元素右侧没有更大值，对应 output 保持 -1。'
      : '所有元素都已经找到右侧更大值。',
    ['stack', 'output'],
  );

  return {
    type: 'algorithm_trace',
    title: '单调栈：下一个更大元素',
    description: '逐步展示读取元素、弹出已解决下标、压入待解决下标的完整过程。',
    algorithmName: 'monotonic_stack_next_greater',
    dataStructure: 'stack',
    inputExample: formatArray(input),
    steps,
  };
}

function generateStackOperationSpec(input: number[]): AlgorithmTraceSpec {
  const stack: number[] = [];
  const steps: AlgorithmTraceSpec['steps'] = [{
    stepIndex: 1,
    operation: '初始化',
    state: { input, stack: [] },
    highlight: ['stack'],
    explanation: '创建空栈，准备按输入顺序执行 push。',
  }];

  for (const value of input) {
    stack.push(value);
    steps.push({
      stepIndex: steps.length + 1,
      operation: `push ${value}`,
      state: { input, stack: [...stack], top: value },
      highlight: ['stack', 'top'],
      explanation: `${value} 入栈，新的栈顶为 ${value}。`,
    });
  }

  return {
    type: 'algorithm_trace',
    title: '栈操作过程演示',
    description: '展示栈的后进先出状态变化。',
    algorithmName: 'stack_operations',
    dataStructure: 'stack',
    inputExample: formatArray(input),
    steps,
  };
}

function generateQueueOperationSpec(input: number[]): AlgorithmTraceSpec {
  const queue: number[] = [];
  const steps: AlgorithmTraceSpec['steps'] = [{
    stepIndex: 1,
    operation: '初始化',
    state: { input, queue: [] },
    highlight: ['queue'],
    explanation: '创建空队列，准备按输入顺序执行 enqueue。',
  }];

  for (const value of input) {
    queue.push(value);
    steps.push({
      stepIndex: steps.length + 1,
      operation: `enqueue ${value}`,
      state: { input, queue: [...queue], front: queue[0], rear: value },
      highlight: ['queue', 'rear'],
      explanation: `${value} 入队，队尾更新为 ${value}。`,
    });
  }

  return {
    type: 'algorithm_trace',
    title: '队列操作过程演示',
    description: '展示队列的先进先出状态变化。',
    algorithmName: 'queue_operations',
    dataStructure: 'queue',
    inputExample: formatArray(input),
    steps,
  };
}

function generateRecursionCallStackSpec(text: string, brief?: RagVisualizationBrief): AlgorithmTraceSpec {
  const n = matchSingleNumber(text, /n\s*[=：:]\s*(\d+)/i)
    ?? matchSingleNumber(text, /(\d+)\s*层/)
    ?? briefNumber(brief, 'n')
    ?? 3;
  const maxDepth = Math.max(1, Math.min(6, Math.floor(n)));
  const callStack: string[] = [];
  const steps: AlgorithmTraceSpec['steps'] = [];

  const pushStep = (
    operation: string,
    explanation: string,
    highlight: string[] = ['callStack'],
    extra: Record<string, unknown> = {},
  ) => {
    steps.push({
      stepIndex: steps.length + 1,
      operation,
      state: {
        input: `n=${maxDepth}`,
        callStack: [...callStack],
        ...extra,
      },
      highlight,
      explanation,
    });
  };

  pushStep(
    '初始化递归任务',
    `选择 n=${maxDepth} 作为演示输入，观察调用帧如何进入和离开调用栈。`,
    ['input', 'callStack'],
    { phase: '准备展开' },
  );

  for (let current = maxDepth; current >= 0; current -= 1) {
    callStack.push(`f(${current})`);
    pushStep(
      `调用展开 f(${current})`,
      current === 0
        ? '到达边界条件，当前调用不再继续产生新的子调用。'
        : `f(${current}) 暂停等待 f(${current - 1}) 的返回结果。`,
      ['callStack', 'current'],
      { current, phase: current === 0 ? '边界条件' : '向下递归' },
    );
  }

  for (let current = 0; current <= maxDepth; current += 1) {
    const returning = callStack.pop();
    pushStep(
      `回溯返回 ${returning}`,
      current === maxDepth
        ? '最外层调用拿到最终结果，递归过程结束。'
        : `f(${current}) 返回后，控制权交还给上一层调用帧。`,
      ['callStack', 'returnValue'],
      { current, phase: '回溯返回', returnValue: `f(${current}) 已完成` },
    );
  }

  return {
    type: 'algorithm_trace',
    title: '递归调用栈：展开与回溯',
    description: '逐步展示递归调用帧入栈、命中边界条件、再逐层返回的过程。',
    algorithmName: 'recursion_call_stack',
    dataStructure: 'stack',
    inputExample: `n=${maxDepth}`,
    steps,
  };
}

function extractNumericInput(text: string): number[] | undefined {
  for (const match of text.matchAll(/\[([^\]]+)]/g)) {
    const values = parseNumberList(match[1]);
    if (values) return values;
  }

  const labeled = text.match(/(?:输入|数组|序列|nums?|arr(?:ay)?|temperatures?)\s*[：:=]?\s*([-\d.,，、\s]+)/i);
  return labeled ? parseNumberList(labeled[1]) : undefined;
}

function parseNumberList(raw: string): number[] | undefined {
  const values = raw
    .replace(/[，、]/g, ',')
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map(Number);

  if (values.length < 2 || values.some((value) => !Number.isFinite(value))) {
    return undefined;
  }
  return values;
}

function matchSingleNumber(value: string, pattern: RegExp): number | undefined {
  const matched = pattern.exec(value);
  if (!matched) return undefined;
  const parsed = Number(matched[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function briefNumber(brief: RagVisualizationBrief | undefined, name: string): number | undefined {
  const raw = brief?.variables.find((variable) => variable.name === name)?.value;
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function defaultAlgorithmInput(dataStructure: AlgorithmTraceSpec['dataStructure']): number[] {
  if (dataStructure === 'queue') return [3, 1, 4, 2];
  return [2, 1, 2, 4, 3];
}

function formatArray(values: number[]): string {
  return `[${values.join(',')}]`;
}

function withBriefContext(spec: AlgorithmTraceSpec, brief: RagVisualizationBrief | undefined): AlgorithmTraceSpec {
  if (!brief) return spec;
  return {
    ...spec,
    title: spec.algorithmName === 'recursion_call_stack'
      ? '递归调用栈：展开与回溯'
      : spec.title,
    description: brief.visualGoal || spec.description,
    contextTitle: brief.knowledgePoint,
    knowledgePoint: brief.knowledgePoint,
    scenario: brief.scenario,
    variables: brief.variables,
    visualGoal: brief.visualGoal,
    brief,
  };
}
