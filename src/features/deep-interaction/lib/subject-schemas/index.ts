import type { KnowledgeConstraint, SubjectDomain } from '../types';

export interface SubjectSchema {
  key: string;
  subjectDomain: SubjectDomain;
  topic: string;
  aliases: string[];
  constraints: KnowledgeConstraint[];
  requiredVariables?: string[];
  forbiddenClaims?: string[];
}

export interface SubjectSchemaMatch {
  schema: SubjectSchema;
  score: number;
  matchedAlias: string;
}

export const BUILT_IN_SUBJECT_SCHEMAS: SubjectSchema[] = [
  {
    key: 'physics:ohms_law',
    subjectDomain: 'physics',
    topic: '欧姆定律',
    aliases: ['欧姆定律', '电流电压电阻', '电路电流', 'Ohm', "Ohm's law", 'ohms law'],
    requiredVariables: ['I', 'U', 'R'],
    forbiddenClaims: ['电阻随电压增大而必然增大', '电流与电阻成正比'],
    constraints: [
      {
        id: 'ohm-1',
        description: '电流等于电压除以电阻',
        formula: 'I = U / R',
        mustBeTrue: '在模拟中，电流 I 必须等于电压 U 除以电阻 R',
        severity: 'must',
        checkType: 'formula',
      },
      {
        id: 'ohm-2',
        description: '电压单位为伏特，电阻单位为欧姆，电流单位为安培',
        mustBeTrue: '所有变量单位必须正确标注为 V、Ω、A',
        severity: 'must',
        checkType: 'unit',
      },
      {
        id: 'ohm-3',
        description: '在电阻不变时，电流与电压成正比；在电压不变时，电流与电阻成反比',
        mustBeTrue: '交互应能体现 I 与 U 正相关、I 与 R 负相关',
        severity: 'should',
        checkType: 'conceptual',
      },
    ],
  },
  {
    key: 'math:quadratic_function',
    subjectDomain: 'math',
    topic: '二次函数',
    aliases: ['二次函数', '抛物线', 'quadratic function', 'parabola'],
    requiredVariables: ['a', 'b', 'c'],
    forbiddenClaims: ['a 只影响抛物线左右平移', 'c 决定对称轴位置'],
    constraints: [
      {
        id: 'quad-1',
        description: '二次函数标准形式为 y = ax² + bx + c',
        formula: 'y = ax^2 + bx + c',
        mustBeTrue: '函数表达式、图像和参数控制必须保持一致',
        severity: 'must',
        checkType: 'formula',
      },
      {
        id: 'quad-2',
        description: '抛物线对称轴为 x = -b / (2a)',
        formula: 'x = -b / (2a)',
        mustBeTrue: '图像中对称轴位置必须正确',
        severity: 'must',
        checkType: 'formula',
      },
      {
        id: 'quad-3',
        description: 'a 的正负决定开口方向，|a| 影响开口大小',
        mustBeTrue: '调节 a 时，图像开口方向和宽窄变化必须正确',
        severity: 'must',
        checkType: 'visual',
      },
    ],
  },
  {
    key: 'physics:projectile_motion',
    subjectDomain: 'physics',
    topic: '抛体运动',
    aliases: ['抛体运动', '平抛运动', '斜抛运动', 'projectile motion'],
    requiredVariables: ['v0', 'g', 't'],
    forbiddenClaims: ['水平方向速度受重力直接改变', '竖直方向是匀速运动'],
    constraints: [
      {
        id: 'proj-1',
        description: '忽略空气阻力时，水平方向为匀速直线运动',
        mustBeTrue: '水平方向速度应保持不变',
        severity: 'must',
        checkType: 'conceptual',
      },
      {
        id: 'proj-2',
        description: '竖直方向为受重力加速度影响的变速运动',
        formula: 'g ≈ 9.8 m/s²',
        mustBeTrue: '竖直方向必须体现重力加速度影响',
        severity: 'must',
        checkType: 'formula',
      },
    ],
  },
  {
    key: 'chemistry:acid_base_titration',
    subjectDomain: 'chemistry',
    topic: '酸碱滴定',
    aliases: ['酸碱滴定', '中和滴定', '滴定实验', 'acid base titration', 'titration'],
    requiredVariables: ['pH'],
    forbiddenClaims: ['所有酸碱滴定终点 pH 都等于 7', '指示剂颜色变化与 pH 无关'],
    constraints: [
      {
        id: 'titration-1',
        description: '酸碱滴定需要通过 pH 变化或指示剂颜色变化判断终点',
        mustBeTrue: '交互中必须展示 pH 或指示剂颜色变化',
        severity: 'must',
        checkType: 'visual',
      },
      {
        id: 'titration-2',
        description: '强酸强碱完全中和附近 pH 接近 7',
        mustBeTrue: '若设定为强酸强碱滴定，等量点附近 pH 应接近 7',
        severity: 'must',
        checkType: 'conceptual',
      },
    ],
  },
  {
    key: 'biology:cell_division',
    subjectDomain: 'biology',
    topic: '有丝分裂',
    aliases: ['有丝分裂', '细胞分裂', 'mitosis', 'cell division'],
    requiredVariables: [],
    forbiddenClaims: ['有丝分裂会使染色体数目减半', 'DNA 复制发生在分裂后期'],
    constraints: [
      {
        id: 'cell-1',
        description: '有丝分裂包括前期、中期、后期、末期等阶段',
        mustBeTrue: '必须按照正确顺序展示主要阶段',
        severity: 'must',
        checkType: 'sequence',
      },
      {
        id: 'cell-2',
        description: '有丝分裂形成的两个子细胞通常遗传物质相同',
        mustBeTrue: '不能错误表述为染色体数目减半',
        severity: 'must',
        checkType: 'conceptual',
      },
    ],
  },
];

export function findMatchingSubjectSchema(
  subjectDomain: SubjectDomain | string,
  topicOrPrompt: string,
): SubjectSchemaMatch | null {
  const text = normalizeText(topicOrPrompt);
  const domain = subjectDomain === 'general' ? 'other' : subjectDomain;
  let bestMatch: SubjectSchemaMatch | null = null;

  for (const schema of BUILT_IN_SUBJECT_SCHEMAS) {
    if (domain !== 'other' && schema.subjectDomain !== domain) continue;

    for (const alias of schema.aliases) {
      const normalizedAlias = normalizeText(alias);
      if (!normalizedAlias) continue;

      const score = text.includes(normalizedAlias)
        ? normalizedAlias.length >= 4 ? 1 : 0.8
        : 0;

      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { schema, score, matchedAlias: alias };
      }
    }
  }

  return bestMatch;
}

function normalizeText(input: string): string {
  return input.toLowerCase().replace(/\s+/g, '');
}
