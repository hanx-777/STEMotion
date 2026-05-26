# STEMotion 深度交互系统重构 — LearningBlueprint 稳定增强版 Codex 任务提示词

## 0. 任务定位

当前 STEMotion 已经具备深度交互生成、多 Agent 质量闭环、本地交互库、教师动作回放、模型 Profile 切换等能力。下一阶段的核心目标不是继续堆叠更多交互类型，而是提高生成稳定性、教学正确性、可评审性和后续可扩展性。

本次任务是对 STEMotion 深度交互生成系统进行 **第一阶段架构重构**：

> 引入 LearningBlueprint 教学中间层与 Subject Schema 学科约束系统，让 HTML 生成、教师动作生成、多 Agent 评审、QualityReport 都以结构化教学蓝图为锚点。

本阶段不进行激进的三 iframe 组件化拆分，不重写前端页面，不破坏现有 API，不改变现有 localStorage persist key。

---

## 1. 当前问题

当前深度交互生成流程存在以下问题：

1. **教学结构、交互界面、教师讲解混在 HTML 中**
   - HTML 体积大；
   - 难以定向修复；
   - 评审 Agent 只能看结果，缺少设计锚点。

2. **Pedagogy Evaluator 缺乏客观判断依据**
   - 只能让 LLM 判断“教学性好不好”；
   - 无法稳定检查“是否达成预期学习目标”；
   - 无法检查年级、认知层次、核心变量是否匹配。

3. **学科知识正确性缺少程序化约束**
   - 欧姆定律、二次函数、有丝分裂等主题容易出现看似可交互但知识不准确的问题；
   - 当前主要依赖 prompt 约束，不够稳定。

4. **RepairAgent 缺少结构化修复目标**
   - 只能根据自然语言反馈修改 HTML；
   - 无法明确知道是变量缺失、知识点错误、教学目标偏离，还是交互深度不足。

5. **后续扩展 Skill Registry、模板系统、Benchmark 缺少统一中间表示**
   - 没有稳定的教学中间层，后续很难做高频主题模板、学科 Schema、结构化评测集。

---

## 2. 本阶段重构目标

本阶段目标是：

```text
User Prompt
→ LearningDesignAgent
→ LearningBlueprint
→ SubjectSchemaValidator
→ Blueprint-aware WidgetHtmlAgent
→ Blueprint-aware TeacherActionAgent
→ Blueprint-aware Multi-Agent Feedback Loop
→ QualityReport
→ Artifact
```

具体目标：

1. 新增 `LearningBlueprint` 类型，描述教学设计中间层。
2. 新增 `Subject Schema Registry`，为高频 STEM 主题提供程序化知识约束。
3. 新增 `LearningDesignAgent`，在 HTML 生成之前先生成教学蓝图。
4. 新增 `SubjectSchemaValidator`，校验并合并学科约束。
5. 修改现有 HTML 生成 Agent，使其接收并遵守 LearningBlueprint。
6. 修改 Pedagogy Evaluator，使其以 LearningBlueprint 作为评审锚点。
7. 修改 QualityReport，增加蓝图对齐、学科正确性、变量覆盖率等结构化字段。
8. 增加 SSE 事件：`blueprint_generated`、`subject_validated`。
9. 前端增加 Blueprint 预览与生成进度展示。
10. 保持现有 API、localStorage key、follow-up 逻辑兼容。

---

## 3. 本阶段明确不做的事情

为了避免一次性重构过大，本阶段明确不做：

1. 不把 artifact 拆成 `simulation iframe`、`control iframe`、`observation iframe`。
2. 不重写整个 pipeline。
3. 不改变 `/api/deep-interaction/generate` 的外部请求和响应协议。
4. 不改变 `/api/deep-interaction/follow-up` 的现有逻辑。
5. 不改变 localStorage persist key。
6. 不删除旧版 InteractionArtifact 字段。
7. 不引入数据库、用户系统、云端 artifact library。
8. 不改 iframe sandbox 策略。
9. 不做完整 Skill Registry，只为后续预留结构。
10. 不要求一次性完成所有学科模板。

---

## 4. 推荐执行顺序

每完成一个阶段后运行：

```bash
npm run typecheck
```

最终运行：

```bash
npm run check
```

执行顺序：

1. 新增类型文件。
2. 新增 Subject Schema Registry。
3. 新增 LearningDesignAgent。
4. 新增 SubjectSchemaValidator。
5. 将 LearningBlueprint 接入现有 pipeline。
6. 修改 WidgetHtmlAgent prompt。
7. 修改 TeacherActionAgent prompt。
8. 修改 Pedagogy Evaluator。
9. 修改 QualityReport 类型和生成逻辑。
10. 修改 SSE 事件类型。
11. 修改前端进度显示和 BlueprintPreview。
12. 回归测试现有 deep-interaction、follow-up、artifact library。

---

# 第一部分：类型定义

## 1.1 新增文件：`src/lib/deep-interaction/types/blueprint.ts`

```typescript
export type SubjectDomain =
  | 'math'
  | 'physics'
  | 'chemistry'
  | 'biology'
  | 'earth_science'
  | 'computer_science'
  | 'engineering'
  | 'other';

export type BloomLevel =
  | 'remember'
  | 'understand'
  | 'apply'
  | 'analyze'
  | 'evaluate'
  | 'create';

export type ScaffoldingLevel = 'guided' | 'open' | 'inquiry';

export type VariableRole = 'independent' | 'dependent' | 'controlled';

export interface LearningVariable {
  name: string;
  symbol: string;
  unit?: string;
  role: VariableRole;
  range?: [number, number];
  defaultValue?: number | string;
  description?: string;
}

export interface KnowledgeConstraint {
  id: string;
  description: string;
  formula?: string;
  mustBeTrue: string;
  severity: 'must' | 'should';
  checkType: 'conceptual' | 'formula' | 'unit' | 'sequence' | 'variable' | 'visual';
}

export interface LearningBlueprint {
  id: string;
  topic: string;
  originalPrompt: string;
  subjectDomain: SubjectDomain;
  interactionType: 'simulation' | '3d_visualization' | 'game' | 'mind_map';
  gradeRange: [number, number];
  bloomLevel: BloomLevel;
  scaffoldingLevel: ScaffoldingLevel;
  coreVariables: LearningVariable[];
  expectedInsight: string;
  learningObjectives: string[];
  prerequisites: string[];
  knowledgeConstraints: KnowledgeConstraint[];
  suggestedVisualStructure?: string;
  estimatedDurationMinutes: number;
  createdAt: string;
}
```

---

## 1.2 修改文件：`src/lib/deep-interaction/types/index.ts`

在现有 export 末尾追加：

```typescript
export * from './blueprint';
```

如果当前文件中需要直接使用 `LearningBlueprint` 类型，不要只依赖 `export *`，应显式导入：

```typescript
import type { LearningBlueprint } from './blueprint';
```

---

## 1.3 兼容现有 Artifact 类型

找到当前 artifact 类型定义，例如 `InteractionArtifact` 或类似类型。

在不删除旧字段的前提下追加可选字段：

```typescript
import type { LearningBlueprint } from './blueprint';

export interface InteractionArtifact {
  // existing fields...
  blueprint?: LearningBlueprint;
}
```

注意：

- 只能追加字段；
- 不要删除旧字段；
- 不要改变现有 localStorage persist key；
- 旧 artifact 没有 blueprint 时，前端必须能正常显示。

---

# 第二部分：Subject Schema 系统

## 2.1 新增文件：`src/lib/deep-interaction/subject-schemas/index.ts`

```typescript
import type { KnowledgeConstraint, SubjectDomain } from '../types/blueprint';

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
    forbiddenClaims: [
      '电阻随电压增大而必然增大',
      '电流与电阻成正比',
    ],
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
    forbiddenClaims: [
      'a 只影响抛物线左右平移',
      'c 决定对称轴位置',
    ],
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
    forbiddenClaims: [
      '水平方向速度受重力直接改变',
      '竖直方向是匀速运动',
    ],
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
    forbiddenClaims: [
      '所有酸碱滴定终点 pH 都等于 7',
      '指示剂颜色变化与 pH 无关',
    ],
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
    forbiddenClaims: [
      '有丝分裂会使染色体数目减半',
      'DNA 复制发生在分裂后期',
    ],
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

function normalizeText(input: string): string {
  return input.toLowerCase().replace(/\s+/g, '');
}

export function findMatchingSubjectSchema(
  subjectDomain: SubjectDomain | string,
  topicOrPrompt: string,
): SubjectSchemaMatch | null {
  const text = normalizeText(topicOrPrompt);
  const domain = subjectDomain;

  let bestMatch: SubjectSchemaMatch | null = null;

  for (const schema of BUILT_IN_SUBJECT_SCHEMAS) {
    if (domain !== 'other' && schema.subjectDomain !== domain) {
      continue;
    }

    for (const alias of schema.aliases) {
      const normalizedAlias = normalizeText(alias);
      if (!normalizedAlias) continue;

      let score = 0;
      if (text.includes(normalizedAlias)) {
        score = normalizedAlias.length >= 4 ? 1 : 0.8;
      }

      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = {
          schema,
          score,
          matchedAlias: alias,
        };
      }
    }
  }

  return bestMatch;
}
```

---

## 2.2 新增文件：`src/lib/deep-interaction/agents/subject-schema-validator.ts`

```typescript
import type { LearningBlueprint, KnowledgeConstraint } from '../types/blueprint';
import { findMatchingSubjectSchema } from '../subject-schemas';
import { createLogger } from '../../utils/logger';

const log = createLogger('subjectSchemaValidator');

export interface BlueprintValidationResult {
  passed: boolean;
  schemaKey?: string;
  violations: string[];
  warnings: string[];
  mergedConstraints: KnowledgeConstraint[];
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toLowerCase();
}

export function validateBlueprintAgainstSchema(
  blueprint: LearningBlueprint,
): BlueprintValidationResult {
  const match = findMatchingSubjectSchema(
    blueprint.subjectDomain,
    `${blueprint.topic} ${blueprint.originalPrompt}`,
  );

  if (!match) {
    log.info('No matching subject schema found', {
      subjectDomain: blueprint.subjectDomain,
      topic: blueprint.topic,
    });

    return {
      passed: true,
      violations: [],
      warnings: ['未匹配到内置学科 Schema，仅使用 LearningBlueprint 自带知识约束。'],
      mergedConstraints: blueprint.knowledgeConstraints,
    };
  }

  const { schema } = match;
  const violations: string[] = [];
  const warnings: string[] = [];

  const existingSymbols = new Set(
    blueprint.coreVariables.map((variable) => normalizeSymbol(variable.symbol)),
  );

  if (schema.requiredVariables?.length) {
    for (const required of schema.requiredVariables) {
      if (!existingSymbols.has(normalizeSymbol(required))) {
        violations.push(`缺少必要变量：${required}`);
      }
    }
  }

  if (schema.forbiddenClaims?.length) {
    for (const claim of schema.forbiddenClaims) {
      const joined = [
        blueprint.expectedInsight,
        ...blueprint.learningObjectives,
        ...blueprint.knowledgeConstraints.map((constraint) => constraint.description),
      ].join(' ');

      if (joined.includes(claim)) {
        violations.push(`出现禁止性错误表述：${claim}`);
      }
    }
  }

  const existingConstraintIds = new Set(
    blueprint.knowledgeConstraints.map((constraint) => constraint.id),
  );

  const mergedConstraints = [
    ...schema.constraints,
    ...blueprint.knowledgeConstraints.filter(
      (constraint) => !existingConstraintIds.has(constraint.id),
    ),
  ];

  log.info('Blueprint schema validation completed', {
    blueprintId: blueprint.id,
    schemaKey: schema.key,
    passed: violations.length === 0,
    violationCount: violations.length,
  });

  return {
    passed: violations.length === 0,
    schemaKey: schema.key,
    violations,
    warnings,
    mergedConstraints,
  };
}
```

> 注意：这里的合并逻辑可以后续优化。本阶段只要求把 Subject Schema 的约束强制注入 blueprint，作为 HTML 生成和评审的硬约束。

---

# 第三部分：LearningDesignAgent

## 3.1 新增文件：`src/lib/deep-interaction/agents/learning-design-agent.ts`

根据项目现有 LLMClient 类型适配 import 路径。

```typescript
import { nanoid } from 'nanoid';
import type { LearningBlueprint } from '../types/blueprint';
import type { InteractionType } from '../types';
import type { LLMClient } from '../../generation/llm';
import { createLogger } from '../../utils/logger';

const log = createLogger('learningDesignAgent');

const SYSTEM_PROMPT = `
你是一位专业的 K-12 STEM 教学设计专家。你的任务是把用户的一句自然语言需求转化为结构化 LearningBlueprint。

你必须只输出 JSON，不要输出 Markdown，不要输出解释文字。

要求：
1. subjectDomain 必须从以下值选择：
   math, physics, chemistry, biology, earth_science, computer_science, engineering, other

2. gradeRange 必须是合理年级范围：
   小学 1-6，初中 7-9，高中 10-12。

3. bloomLevel 必须从以下值选择：
   remember, understand, apply, analyze, evaluate, create

4. scaffoldingLevel 必须从以下值选择：
   guided, open, inquiry

5. coreVariables 必须提取该主题中的关键变量：
   - independent：学生可调节的变量
   - dependent：随实验变化的观察变量
   - controlled：应保持不变的控制变量

6. expectedInsight 必须是一句话，描述学生通过交互应得出的核心结论。

7. learningObjectives 写 2-4 条，必须面向课堂学习。

8. knowledgeConstraints 写 2-5 条，描述必须正确的科学事实、公式、单位、顺序或视觉呈现。
   每条必须包含：
   - id
   - description
   - mustBeTrue
   - severity: must 或 should
   - checkType: conceptual / formula / unit / sequence / variable / visual

9. suggestedVisualStructure 简要描述建议采用的界面结构。

10. estimatedDurationMinutes 给出 3-15 分钟范围内的课堂使用时长。

输出 JSON 格式：
{
  "topic": "string",
  "subjectDomain": "math|physics|chemistry|biology|earth_science|computer_science|engineering|other",
  "interactionType": "simulation|3d_visualization|game|mind_map",
  "gradeRange": [number, number],
  "bloomLevel": "remember|understand|apply|analyze|evaluate|create",
  "scaffoldingLevel": "guided|open|inquiry",
  "coreVariables": [
    {
      "name": "string",
      "symbol": "string",
      "unit": "string",
      "role": "independent|dependent|controlled",
      "range": [number, number],
      "defaultValue": number,
      "description": "string"
    }
  ],
  "expectedInsight": "string",
  "learningObjectives": ["string"],
  "prerequisites": ["string"],
  "knowledgeConstraints": [
    {
      "id": "string",
      "description": "string",
      "formula": "string",
      "mustBeTrue": "string",
      "severity": "must|should",
      "checkType": "conceptual|formula|unit|sequence|variable|visual"
    }
  ],
  "suggestedVisualStructure": "string",
  "estimatedDurationMinutes": number
}
`.trim();

function safeParseJson(raw: string): unknown {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('LearningDesignAgent did not return JSON');
  }
  return JSON.parse(jsonMatch[0]);
}

function normalizeBlueprint(
  parsed: any,
  userPrompt: string,
  interactionType: InteractionType,
): LearningBlueprint {
  return {
    id: nanoid(),
    topic: String(parsed.topic ?? userPrompt),
    originalPrompt: userPrompt,
    subjectDomain: parsed.subjectDomain ?? 'other',
    interactionType,
    gradeRange: Array.isArray(parsed.gradeRange) ? parsed.gradeRange : [7, 9],
    bloomLevel: parsed.bloomLevel ?? 'understand',
    scaffoldingLevel: parsed.scaffoldingLevel ?? 'guided',
    coreVariables: Array.isArray(parsed.coreVariables) ? parsed.coreVariables : [],
    expectedInsight: String(parsed.expectedInsight ?? '学生能够通过交互观察并总结核心规律。'),
    learningObjectives: Array.isArray(parsed.learningObjectives) ? parsed.learningObjectives : [],
    prerequisites: Array.isArray(parsed.prerequisites) ? parsed.prerequisites : [],
    knowledgeConstraints: Array.isArray(parsed.knowledgeConstraints) ? parsed.knowledgeConstraints : [],
    suggestedVisualStructure: parsed.suggestedVisualStructure,
    estimatedDurationMinutes: Number(parsed.estimatedDurationMinutes ?? 8),
    createdAt: new Date().toISOString(),
  };
}

export async function runLearningDesignAgent(
  userPrompt: string,
  interactionType: InteractionType,
  llm: LLMClient,
): Promise<LearningBlueprint> {
  log.info('Generating LearningBlueprint', {
    userPrompt,
    interactionType,
  });

  const raw = await llm.complete({
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `用户需求：${userPrompt}\n交互类型：${interactionType}`,
      },
    ],
    temperature: 0.2,
  });

  const parsed = safeParseJson(raw);
  const blueprint = normalizeBlueprint(parsed, userPrompt, interactionType);

  log.info('LearningBlueprint generated', {
    blueprintId: blueprint.id,
    subjectDomain: blueprint.subjectDomain,
    topic: blueprint.topic,
  });

  return blueprint;
}
```

> 如果当前项目的 `llm.complete` 参数结构不同，请只适配调用签名，不改变 agent 的功能边界。

---

# 第四部分：接入现有 Pipeline

## 4.1 修改文件：`src/lib/deep-interaction/pipeline.ts`

找到当前 deep-interaction 主 pipeline。

在 HTML 生成之前加入：

```typescript
import { runLearningDesignAgent } from './agents/learning-design-agent';
import { validateBlueprintAgainstSchema } from './agents/subject-schema-validator';
```

在 pipeline 中增加阶段：

```typescript
emit('progress', { message: '正在分析教学目标与知识结构...' });

const blueprint = await runLearningDesignAgent(userPrompt, interactionType, llm);

emit('blueprint_generated', { blueprint });

const validationResult = validateBlueprintAgainstSchema(blueprint);

const finalBlueprint = {
  ...blueprint,
  knowledgeConstraints: validationResult.mergedConstraints,
};

emit('subject_validated', {
  blueprintId: finalBlueprint.id,
  passed: validationResult.passed,
  schemaKey: validationResult.schemaKey,
  violations: validationResult.violations,
  warnings: validationResult.warnings,
});
```

如果校验未通过，本阶段先不要复杂重试，只做：

1. 把 violations 追加进 HTML 生成 prompt；
2. 把 violations 追加进 QualityReport；
3. 不中断生成流程。

建议：

```typescript
const blueprintWarnings = [
  ...validationResult.violations.map((item) => `Schema violation: ${item}`),
  ...validationResult.warnings,
];
```

之后将 `finalBlueprint` 传给：

- WidgetHtmlAgent；
- TeacherActionAgent；
- Pedagogy Evaluator；
- QualityReport 生成逻辑。

---

## 4.2 不改变 route.ts

不要修改：

```text
src/app/api/deep-interaction/generate/route.ts
```

除非当前 route 对 pipeline 返回类型有严格假设，导致类型错误。

如必须修改，只允许做向后兼容适配：

```typescript
artifact.blueprint = finalBlueprint;
```

不能改变外部 API 的请求字段和 SSE 主体结构。

---

# 第五部分：修改 WidgetHtmlAgent

## 5.1 修改目标

让现有 HTML 生成 Agent 接收 `LearningBlueprint`，并在 system prompt 或 user prompt 中加入结构化约束。

如果当前函数类似：

```typescript
runWidgetHtmlAgent(outline, llm)
```

修改为：

```typescript
runWidgetHtmlAgent(outline, llm, blueprint)
```

或：

```typescript
runWidgetHtmlAgent({
  outline,
  blueprint,
  llm,
})
```

根据现有代码风格选择最小改动方式。

---

## 5.2 Prompt 增强内容

在 HTML 生成 prompt 中追加：

```typescript
function formatBlueprintForPrompt(blueprint: LearningBlueprint): string {
  return `
【教学蓝图 LearningBlueprint】

主题：${blueprint.topic}
学科：${blueprint.subjectDomain}
年级：${blueprint.gradeRange[0]}-${blueprint.gradeRange[1]} 年级
认知层次：${blueprint.bloomLevel}
支架水平：${blueprint.scaffoldingLevel}

【学习目标】
${blueprint.learningObjectives.map((item, index) => `${index + 1}. ${item}`).join('\n')}

【核心变量】
${blueprint.coreVariables
  .map((variable) => {
    const range = variable.range ? `，范围：${variable.range[0]}-${variable.range[1]}` : '';
    const unit = variable.unit ? `，单位：${variable.unit}` : '';
    return `- ${variable.name}（${variable.symbol}，${variable.role}${unit}${range}）：${variable.description ?? ''}`;
  })
  .join('\n')}

【期望洞察】
${blueprint.expectedInsight}

【必须满足的知识约束】
${blueprint.knowledgeConstraints
  .map((constraint) => {
    const formula = constraint.formula ? `，公式：${constraint.formula}` : '';
    return `- [${constraint.severity}] ${constraint.description}${formula}。校验点：${constraint.mustBeTrue}`;
  })
  .join('\n')}

【建议视觉结构】
${blueprint.suggestedVisualStructure ?? '无'}

生成的 HTML 必须围绕 expectedInsight 组织交互，不得偏离 LearningBlueprint。
`.trim();
}
```

HTML 生成要求中追加：

```text
必须满足：
1. 所有 must 级知识约束必须在交互中正确体现。
2. 核心变量中的 independent 变量应尽量提供可调控件。
3. dependent 变量应在图像、数值或观察区中可见。
4. controlled 变量如果不提供控件，也应在说明区中明确。
5. 交互必须帮助学生得出 expectedInsight。
6. 内容难度必须匹配 gradeRange 和 bloomLevel。
7. 不要生成与知识约束冲突的表述。
```

---

# 第六部分：修改 TeacherActionAgent

## 6.1 修改目标

让教师动作不再仅仅围绕 HTML 视觉元素生成，而是围绕 LearningBlueprint 的教学阶段生成。

如果当前函数类似：

```typescript
runTeacherActionAgent(html, llm)
```

修改为：

```typescript
runTeacherActionAgent(html, llm, blueprint)
```

---

## 6.2 Prompt 增强内容

追加：

```text
请根据 LearningBlueprint 设计教师动作序列。教师动作必须服务于以下目标：

1. 引导学生观察核心变量变化。
2. 帮助学生得出 expectedInsight。
3. 在适当位置提示 knowledgeConstraints 中的重要公式、单位或阶段顺序。
4. 动作难度匹配 gradeRange 与 bloomLevel。
5. 至少包含一个 pause_for_question 或 show_quiz 类型动作。
6. 不要生成与 HTML 中不存在元素强绑定的脆弱选择器；优先使用语义化 data-role 或稳定 id。
```

建议 HTML Agent 同时生成语义化标记，例如：

```html
<div data-role="simulation-main"></div>
<div data-role="control-panel"></div>
<div data-role="observation-panel"></div>
<div data-role="formula-panel"></div>
```

TeacherActionAgent 优先选择这些 `data-role`。

---

# 第七部分：修改 Pedagogy Evaluator

## 7.1 修改目标

让 Pedagogy Evaluator 以 LearningBlueprint 作为客观锚点。

如果当前函数类似：

```typescript
runPedagogyEvaluator(html, llm)
```

修改为：

```typescript
runPedagogyEvaluator(html, llm, blueprint)
```

或按照现有 evaluator 调用结构传入。

---

## 7.2 Prompt 增强内容

在 system prompt 中加入：

```text
你不只是评价这个 HTML 是否“看起来适合教学”，而是要严格对照 LearningBlueprint 进行评审。

你必须检查：

1. Expected Insight Alignment
   - 交互是否能引导学生得出 expectedInsight？
   - 如果只是展示现象但不能形成结论，应扣分。

2. Learning Objective Coverage
   - 是否覆盖 learningObjectives？
   - 是否存在目标遗漏？

3. Variable Coverage
   - independent 变量是否可调？
   - dependent 变量是否可观察？
   - controlled 变量是否被说明或固定？

4. Knowledge Constraint Satisfaction
   - must 级约束是否全部满足？
   - 公式、单位、阶段顺序是否正确？
   - 是否出现 forbidden 或明显错误表述？

5. Grade and Bloom Appropriateness
   - 难度是否匹配 gradeRange？
   - 任务深度是否匹配 bloomLevel？
   - 如果 bloomLevel 是 analyze，则不能只是播放动画；应有比较、推理或数据观察。

6. Scaffolding
   - guided 模式应有更明确引导；
   - inquiry 模式应给学生更多探索空间。
```

要求输出结构化 JSON，至少包含：

```json
{
  "score": 0.85,
  "blueprintAlignment": 0.9,
  "learningObjectiveCoverage": 0.85,
  "variableCoverage": 0.8,
  "knowledgeConstraintSatisfaction": 0.95,
  "gradeAppropriateness": 0.9,
  "bloomAppropriateness": 0.8,
  "mustFix": [],
  "suggestions": []
}
```

---

# 第八部分：修改 QualityReport

## 8.1 类型扩展

找到现有 `QualityReport` 类型，追加字段，不要删除旧字段：

```typescript
export interface QualityReport {
  // existing fields...

  blueprintAlignment?: number;
  subjectCorrectness?: number;
  variableCoverage?: number;
  learningObjectiveCoverage?: number;
  knowledgeConstraintSatisfaction?: number;

  blueprintSummary?: {
    topic: string;
    subjectDomain: string;
    gradeRange: [number, number];
    bloomLevel: string;
    expectedInsight: string;
  };

  schemaValidation?: {
    passed: boolean;
    schemaKey?: string;
    violations: string[];
    warnings: string[];
  };
}
```

---

## 8.2 QualityReport 生成逻辑

在生成最终 `qualityReport` 时追加：

```typescript
qualityReport.blueprintSummary = {
  topic: finalBlueprint.topic,
  subjectDomain: finalBlueprint.subjectDomain,
  gradeRange: finalBlueprint.gradeRange,
  bloomLevel: finalBlueprint.bloomLevel,
  expectedInsight: finalBlueprint.expectedInsight,
};

qualityReport.schemaValidation = {
  passed: validationResult.passed,
  schemaKey: validationResult.schemaKey,
  violations: validationResult.violations,
  warnings: validationResult.warnings,
};
```

如果 Pedagogy Evaluator 返回相关分数，则映射：

```typescript
qualityReport.blueprintAlignment = pedagogyResult.blueprintAlignment;
qualityReport.variableCoverage = pedagogyResult.variableCoverage;
qualityReport.learningObjectiveCoverage = pedagogyResult.learningObjectiveCoverage;
qualityReport.knowledgeConstraintSatisfaction = pedagogyResult.knowledgeConstraintSatisfaction;
qualityReport.subjectCorrectness = pedagogyResult.knowledgeConstraintSatisfaction;
```

---

# 第九部分：SSE 事件类型扩展

## 9.1 修改文件：`src/lib/deep-interaction/events.ts`

在现有 `SSEEventType` union 中追加：

```typescript
| 'blueprint_generated'
| 'subject_validated'
```

在 payload map 中追加：

```typescript
import type { LearningBlueprint } from './types/blueprint';

blueprint_generated: {
  blueprint: LearningBlueprint;
};

subject_validated: {
  blueprintId: string;
  passed: boolean;
  schemaKey?: string;
  violations: string[];
  warnings: string[];
};
```

如当前事件类型结构不同，请按现有风格添加同等字段。

---

# 第十部分：前端适配

## 10.1 新增组件：`src/components/deep-interaction/BlueprintPreview.tsx`

```tsx
import type { LearningBlueprint } from '@/lib/deep-interaction/types';

interface BlueprintPreviewProps {
  blueprint?: LearningBlueprint | null;
}

const bloomLabelMap: Record<string, string> = {
  remember: '记忆',
  understand: '理解',
  apply: '应用',
  analyze: '分析',
  evaluate: '评价',
  create: '创造',
};

const scaffoldingLabelMap: Record<string, string> = {
  guided: '强引导',
  open: '开放探索',
  inquiry: '探究式',
};

export function BlueprintPreview({ blueprint }: BlueprintPreviewProps) {
  if (!blueprint) return null;

  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-semibold text-blue-900">📋 教学蓝图</h3>
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
          {blueprint.subjectDomain}
        </span>
      </div>

      <div className="space-y-1 text-slate-700">
        <p>
          <span className="font-medium">主题：</span>
          {blueprint.topic}
        </p>
        <p>
          <span className="font-medium">年级：</span>
          {blueprint.gradeRange[0]}-{blueprint.gradeRange[1]} 年级
        </p>
        <p>
          <span className="font-medium">认知层次：</span>
          {bloomLabelMap[blueprint.bloomLevel] ?? blueprint.bloomLevel}
        </p>
        <p>
          <span className="font-medium">支架水平：</span>
          {scaffoldingLabelMap[blueprint.scaffoldingLevel] ?? blueprint.scaffoldingLevel}
        </p>
        <p>
          <span className="font-medium">核心洞察：</span>
          {blueprint.expectedInsight}
        </p>
      </div>

      {blueprint.coreVariables.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 font-medium text-slate-800">核心变量</div>
          <div className="flex flex-wrap gap-1">
            {blueprint.coreVariables.map((variable) => (
              <span
                key={`${variable.symbol}-${variable.role}`}
                className="rounded-full border border-blue-200 bg-white px-2 py-0.5 text-xs text-slate-700"
              >
                {variable.name}({variable.symbol}) · {variable.role}
              </span>
            ))}
          </div>
        </div>
      )}

      {blueprint.knowledgeConstraints.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-blue-800">
            查看知识约束（{blueprint.knowledgeConstraints.length}）
          </summary>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-600">
            {blueprint.knowledgeConstraints.slice(0, 5).map((constraint) => (
              <li key={constraint.id}>{constraint.description}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
```

---

## 10.2 修改 GenerationProgress

在现有进度阶段中追加：

```typescript
const PIPELINE_STAGES = [
  { event: 'session_created', label: '创建会话', icon: '🧭' },
  { event: 'type_selected', label: '识别类型', icon: '🎯' },
  { event: 'blueprint_generated', label: '教学蓝图', icon: '📋' },
  { event: 'subject_validated', label: '知识校验', icon: '✅' },
  { event: 'outline_generated', label: '生成大纲', icon: '🧩' },
  { event: 'schema_generated', label: '结构生成', icon: '🏗️' },
  { event: 'validation_started', label: '安全校验', icon: '🛡️' },
  { event: 'feedback_started', label: '质量评审', icon: '🔍' },
  { event: 'feedback_completed', label: '评审完成', icon: '🧪' },
  { event: 'artifact_ready', label: '生成完成', icon: '🎉' },
];
```

根据现有组件结构做最小改动。

---

## 10.3 前端保存 blueprint

当收到 SSE：

```typescript
blueprint_generated
```

时，将 blueprint 暂存到当前 generation/session state。

当收到：

```typescript
artifact_ready
```

时，如果后端 artifact 已包含 blueprint，直接保存；如果没有，但前端暂存了 blueprint，则补充到 artifact 上：

```typescript
const artifactWithBlueprint = {
  ...artifact,
  blueprint: artifact.blueprint ?? currentBlueprint,
};
```

注意：

- 不要改变 persist key；
- 旧 artifact 没有 blueprint 时不能报错；
- Artifact list 卡片可选展示 subjectDomain/topic，但不要强依赖。

---

# 第十一部分：Follow-up 兼容

本阶段不改 follow-up 主逻辑。

但是为了避免 follow-up 破坏 blueprint 约束，可以在 follow-up prompt 中轻量追加：

```text
如果当前 artifact 附带 LearningBlueprint，请保持修改后的 HTML 继续满足：
1. expectedInsight 不变；
2. must 级 knowledgeConstraints 不被破坏；
3. coreVariables 对应控件和观察结果不被删除；
4. 不要引入与学科知识冲突的表述。
```

如果当前 follow-up 接口拿不到 blueprint，则跳过，不要强行改数据结构。

---

# 第十二部分：测试任务

## 12.1 必须通过的命令

```bash
npm run typecheck
npm run check
```

如果项目中 `npm run check` 已经包含 lint、typecheck、build，则最终只需：

```bash
npm run check
```

---

## 12.2 手动测试 Prompt 1：欧姆定律

输入：

```text
生成一个面向初中物理教学的欧姆定律交互实验，学生可以调节电压和电阻，观察电流变化。
```

预期：

1. 生成 LearningBlueprint。
2. subjectDomain 为 `physics`。
3. 匹配 `physics:ohms_law` Schema。
4. coreVariables 至少包含 I、U、R。
5. knowledgeConstraints 包含 `I = U / R`。
6. HTML 中有电压、电阻控制。
7. 电流随电压增大而增大，随电阻增大而减小。
8. QualityReport 中出现 blueprintAlignment、subjectCorrectness、variableCoverage。
9. 页面能正常预览 artifact。
10. 本地交互库能保存 artifact。

---

## 12.3 手动测试 Prompt 2：二次函数

输入：

```text
生成一个高中数学二次函数参数探索器，可以调节 a、b、c，观察抛物线变化。
```

预期：

1. subjectDomain 为 `math`。
2. 匹配 `math:quadratic_function` Schema。
3. coreVariables 包含 a、b、c。
4. 知识约束包含 `y = ax² + bx + c` 和 `x = -b / (2a)`。
5. 图像随 a、b、c 变化合理。
6. 页面展示或说明对称轴。
7. Pedagogy Evaluator 能检查图像是否支持 expectedInsight。

---

## 12.4 手动测试 Prompt 3：有丝分裂

输入：

```text
生成一个高中生物有丝分裂过程动画，展示前期、中期、后期、末期。
```

预期：

1. subjectDomain 为 `biology`。
2. 匹配 `biology:cell_division` Schema。
3. knowledgeConstraints 包含阶段顺序。
4. HTML 按正确顺序展示有丝分裂阶段。
5. 不出现“有丝分裂使染色体数目减半”这类错误表述。
6. 教师动作能引导学生观察染色体行为变化。

---

# 第十三部分：验收标准

本阶段完成后，项目应满足以下标准：

## 13.1 架构验收

- [ ] 新增 LearningBlueprint 类型。
- [ ] 新增 Subject Schema Registry。
- [ ] 新增 LearningDesignAgent。
- [ ] 新增 SubjectSchemaValidator。
- [ ] pipeline 中 HTML 生成前会生成 blueprint。
- [ ] WidgetHtmlAgent 会接收 blueprint。
- [ ] Pedagogy Evaluator 会接收 blueprint。
- [ ] artifact 可选保存 blueprint。
- [ ] 旧 artifact 兼容。

## 13.2 功能验收

- [ ] 深度交互生成流程仍可正常完成。
- [ ] SSE 中出现 blueprint_generated。
- [ ] SSE 中出现 subject_validated。
- [ ] 前端能展示教学蓝图。
- [ ] QualityReport 包含蓝图相关字段。
- [ ] 本地交互库能保存和打开新 artifact。
- [ ] follow-up 仍能使用。

## 13.3 稳定性验收

- [ ] `npm run typecheck` 通过。
- [ ] `npm run check` 通过。
- [ ] 欧姆定律测试通过。
- [ ] 二次函数测试通过。
- [ ] 有丝分裂测试通过。
- [ ] 旧 artifact 不因缺少 blueprint 报错。

---

# 第十四部分：注意事项

1. **严格保持向后兼容**
   - 所有新增字段都应是可选或有 fallback。
   - 不要破坏旧数据。

2. **不要过度抽象**
   - 本阶段只做 LearningBlueprint 和 Subject Schema。
   - Skill Registry、三 iframe 组件化、多模式 artifact 放到后续阶段。

3. **LLM JSON 输出必须安全解析**
   - 不要直接假设模型只输出 JSON。
   - 使用 JSON 提取和 fallback。
   - 出错时给出可诊断日志。

4. **Subject Schema 匹配必须支持中文**
   - aliases 必须包含中文关键词。
   - 不要只做英文 topic 匹配。

5. **Pedagogy Evaluator 不要只给自然语言建议**
   - 必须输出结构化评分。
   - 至少包含 blueprintAlignment、variableCoverage、knowledgeConstraintSatisfaction。

6. **QualityReport 不要重构过度**
   - 在现有结构上追加字段。
   - 不要替换旧结构。

7. **follow-up 不做大改**
   - 只做轻量 prompt 约束。
   - 不重新跑完整 multi-agent loop。

8. **日志要清晰**
   - LearningDesignAgent、SubjectSchemaValidator、pipeline 阶段应有明确日志。
   - 方便定位是蓝图生成失败、schema 校验失败，还是 HTML 生成失败。

---

# 第十五部分：后续阶段预留

本阶段完成后，下一阶段可以继续做：

## Phase 2：TeacherGuide 结构化教师脚本

```text
LearningBlueprint
→ TeacherGuide
→ TeachingStage
→ TeacherAction
→ 教师模式 artifact
```

## Phase 3：高频主题模板

```text
欧姆定律模板
二次函数模板
酸碱滴定模板
有丝分裂模板
抛体运动模板
孟德尔遗传模板
```

## Phase 4：Skill Registry

```text
Subject Skill
Interaction Skill
UI Skill
Pedagogy Skill
Validation Skill
```

## Phase 5：组件化生成

```text
simulation module
control module
observation module
teacher overlay
assessment module
```

注意：组件化生成建议先在单 HTML 内部使用 `data-role` 模块划分，等协议稳定后再考虑多 iframe 物理隔离。

---

# 第十六部分：给 Codex 的最终执行摘要

请按以下原则执行本次重构：

```text
目标：引入 LearningBlueprint 和 Subject Schema，让 STEMotion 的深度交互生成从 prompt-first 升级为 blueprint-aware generation。

优先保证：
1. 不破坏现有 deep-interaction 生成流程；
2. 不破坏 follow-up；
3. 不破坏本地 artifact library；
4. 不改变 route 外部接口；
5. 不改变 localStorage persist key；
6. npm run check 必须通过。

本次只做：
- LearningBlueprint 类型；
- Subject Schema Registry；
- LearningDesignAgent；
- SubjectSchemaValidator；
- pipeline 接入；
- WidgetHtmlAgent blueprint-aware；
- Pedagogy Evaluator blueprint-aware；
- QualityReport 增加蓝图字段；
- SSE 增加 blueprint_generated 和 subject_validated；
- 前端 BlueprintPreview。

本次不做：
- 三 iframe 组件拆分；
- 云端存储；
- 完整 Skill Registry；
- 多模式 artifact；
- 大规模 UI 重写。
```

---

# 第十七部分：推荐 Git 提交拆分

建议分 5 个 commit：

```bash
git add src/lib/deep-interaction/types
git commit -m "feat: add learning blueprint types"

git add src/lib/deep-interaction/subject-schemas src/lib/deep-interaction/agents/learning-design-agent.ts src/lib/deep-interaction/agents/subject-schema-validator.ts
git commit -m "feat: add learning design agent and subject schema validation"

git add src/lib/deep-interaction/pipeline.ts src/lib/deep-interaction/agents
git commit -m "feat: integrate blueprint into deep interaction pipeline"

git add src/lib/deep-interaction/evaluators src/lib/deep-interaction/events.ts
git commit -m "feat: make evaluation and events blueprint-aware"

git add src/components/deep-interaction src/lib/stores
git commit -m "feat: display learning blueprint in deep interaction UI"
```

---

# 第十八部分：完成后的项目表述

完成本阶段后，README 或汇报中可以这样描述：

> STEMotion 引入了 LearningBlueprint 教学中间层，将用户自然语言需求先转化为结构化教学蓝图，再驱动交互生成、教师动作生成和多 Agent 质量评审。系统进一步通过 Subject Schema Registry 对高频 STEM 主题注入公式、变量、单位和阶段顺序等学科约束，使生成结果不再仅依赖大模型自由发挥，而是具备可检查、可修复、可评测的教学结构基础。

更简短的版本：

> STEMotion 从 prompt-first HTML generation 升级为 blueprint-aware interactive learning artifact generation。

