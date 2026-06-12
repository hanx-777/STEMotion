/**
 * Round 002B — Lightweight RAG Visualization Multi-Agent Types & Functions
 *
 * 5-agent structure:
 *   Task Planner → Domain Modeler → (optional) Specialist Verifier → Visualization Mapper → UI Builder
 *
 * Design principle: Agents are pure adapters over the existing pipeline data.
 * No extra LLM calls are required; they produce typed intermediate outputs that
 * are injected into the HTML generation prompt.
 */

import type { GenerationMode } from '@/shared/api/lightweightAgentPipeline';
import type { RagVisualizationGenerationPlan } from './types';

// ─── Intermediate Output Types (Task 1) ────────────────────────────────────────

export type RagVisualizationTaskPlan = {
  taskType: string;
  subjectId?: string;
  coreGoal: string;
  targetUser?: string;
  outputForm: 'answer' | 'artifact' | 'answer_with_artifact';
  mainVisualFocus: string;
  needsSpecialist: boolean;
  specialistReason?: string;
  generationLog: string[];
};

export type RagDomainModel = {
  domain: string;
  variables: Array<{
    name: string;
    label?: string;
    role: 'given' | 'derived' | 'control' | 'state' | 'output';
    unit?: string;
  }>;
  formulasOrRules: string[];
  states: string[];
  edgeCases: string[];
  specialistNotes?: string[];
};

export type RagVisualizationMapping = {
  visualObjects: string[];
  stateToVisualMapping: Array<{
    stateOrVariable: string;
    visualEncoding: string;
  }>;
  animationSteps: string[];
  metricsOrLabels: string[];
  interactionModel: string[];
};

export type RagUILayoutPlan = {
  mainStage: string;
  sidePanel: string;
  bottomOrTabs: string;
  responsiveStrategy: string;
  firstScreenChecklist: string[];
};

export type RagLightweightVisualizationPlan = {
  taskPlan: RagVisualizationTaskPlan;
  domainModel: RagDomainModel;
  visualizationMapping: RagVisualizationMapping;
  layoutPlan: RagUILayoutPlan;
};

// ─── Input shape for all agents ────────────────────────────────────────────────

export interface LightweightAgentInput {
  question: string;
  subject: string;
  taskType: string;
  answerText?: string;
  formulaBlocks?: Array<{ latex: string; explanation?: string }>;
  finalResults?: Array<{ label: string; value: string; unit?: string }>;
  plan?: RagVisualizationGenerationPlan;
}

// ─── Agent 2.1: Task Planner ────────────────────────────────────────────────────

export function buildRagVisualizationTaskPlan(
  input: LightweightAgentInput,
): RagVisualizationTaskPlan {
  const needsSpecialist = isComplexSpecialistDomain(input.subject, input.taskType, input.question);

  return {
    taskType: input.taskType,
    subjectId: input.subject,
    coreGoal: input.plan?.knowledgePoint
      || extractCoreGoal(input.question),
    targetUser: inferTargetUser(input.taskType),
    outputForm: 'answer_with_artifact',
    mainVisualFocus: input.plan?.visualObjects?.[0]
      || inferVisualFocus(input.question, input.subject),
    needsSpecialist,
    specialistReason: needsSpecialist ? describeSpecialistReason(input.subject, input.taskType) : undefined,
    generationLog: [
      'Defining the task scope',
      'Modeling the core concept',
      'Mapping logic to visual states',
      'Designing controls and layout',
      'Validating edge cases',
    ],
  };
}

// ─── Agent 2.2: Domain Modeler ──────────────────────────────────────────────────

export function buildRagDomainModel(
  input: LightweightAgentInput,
  taskPlan: RagVisualizationTaskPlan,
): RagDomainModel {
  const domain = resolveDomain(input.subject, input.taskType);
  const planVars = input.plan?.variables ?? [];

  const variables = planVars.map((v) => ({
    name: v.name,
    label: v.label,
    role: inferVariableRole(v.role ?? ''),
    unit: v.unit,
  }));

  // Augment with formula-derived variables if plan has none
  if (variables.length === 0 && input.formulaBlocks?.length) {
    for (const fb of input.formulaBlocks.slice(0, 4)) {
          extractLatexVars(fb.latex).forEach((name) => {
        if (!variables.find((v) => v.name === name)) {
          variables.push({ name, label: name, role: 'derived', unit: undefined });
        }
      });
    }
  }

  return {
    domain,
    variables,
    formulasOrRules: input.formulaBlocks?.map((f) => f.latex).slice(0, 8) ?? [],
    states: input.plan?.animationRequirements?.slice(0, 6) ?? defaultStates(domain),
    edgeCases: defaultEdgeCases(domain),
    specialistNotes: taskPlan.needsSpecialist
      ? taskPlan.specialistReason ? [taskPlan.specialistReason] : []
      : undefined,
  };
}

// ─── Agent 2.3: Optional Specialist Verifier ───────────────────────────────────

/**
 * Specialist is a pure synchronous enrichment of domainModel.
 * fast mode: ALWAYS skip (hard rule, regardless of needsSpecialist flag).
 * balanced mode: only if taskPlan.needsSpecialist is true.
 * highQuality mode: always run.
 */
export function maybeRunSpecialistVerifier(
  input: LightweightAgentInput,
  taskPlan: RagVisualizationTaskPlan,
  domainModel: RagDomainModel,
  mode: GenerationMode,
): RagDomainModel {
  // fast mode: hard skip — Specialist is NEVER activated
  if (mode === 'fast') return domainModel;
  // highQuality: always activate; balanced: only when task is specialist-grade
  const shouldRun = mode === 'highQuality' || taskPlan.needsSpecialist;
  if (!shouldRun) return domainModel;

  const notes = buildSpecialistNotes(domainModel.domain, input);
  return {
    ...domainModel,
    specialistNotes: [...(domainModel.specialistNotes ?? []), ...notes],
  };
}

// ─── Agent 2.4: Visualization Mapper ───────────────────────────────────────────

export function buildRagVisualizationMapping(
  input: LightweightAgentInput,
  _taskPlan: RagVisualizationTaskPlan,
  domainModel: RagDomainModel,
): RagVisualizationMapping {
  const plan = input.plan;

  const visualObjects = plan?.visualObjects?.slice(0, 8)
    ?? domainModel.variables.slice(0, 4).map((v) => v.label ?? v.name);

  const stateToVisualMapping = domainModel.variables.slice(0, 6).map((v) => ({
    stateOrVariable: v.label ?? v.name,
    visualEncoding: inferVisualEncoding(v, domainModel.domain),
  }));

  const animationSteps = plan?.animationRequirements?.slice(0, 6)
    ?? domainModel.states.slice(0, 4).map((s) => `Show state: ${s}`);

  const metricsOrLabels = [
    ...(plan?.metrics?.slice(0, 4) ?? []),
    ...(input.finalResults?.map((r) => `${r.label}: ${r.value}${r.unit ?? ''}`).slice(0, 4) ?? []),
  ];

  const interactionModel = plan?.controls?.slice(0, 6)
    ?? defaultInteractions(domainModel.domain);

  return {
    visualObjects,
    stateToVisualMapping,
    animationSteps,
    metricsOrLabels,
    interactionModel,
  };
}

// ─── Agent 2.5: UI Builder Plan ─────────────────────────────────────────────────

export function buildRagUILayoutPlan(
  _input: LightweightAgentInput,
  _taskPlan: RagVisualizationTaskPlan,
  mapping: RagVisualizationMapping,
): RagUILayoutPlan {
  return {
    mainStage: 'Canvas/SVG visualization area — min 65% of available width, problem-specific objects and animation',
    sidePanel: `Compact controls (sliders/buttons) + metrics display — 25-35% of width. Contains: ${mapping.interactionModel.slice(0, 3).join(', ')}`,
    bottomOrTabs: 'Collapsed by default: original question text, formulas derivation, citations, learning goals',
    responsiveStrategy: 'Below 768px: stack vertically (visualization on top, controls below). No horizontal overflow.',
    firstScreenChecklist: [
      '核心可视化在首屏可见（不需要滚动）',
      '主舞台占可用宽度 ≥65%',
      '侧栏/控件面板占 25-35%',
      '控件（滑块/按钮）在首屏内可交互',
      `关键指标 [${mapping.metricsOrLabels.slice(0, 2).join(', ') || '计算结果'}] 可见`,
      '说明文字、题目原文、推导折叠到 details/tab 中',
      '无嵌套滚动容器',
      '窄屏自动切换上下布局',
    ],
  };
}

// ─── Orchestrator: build complete lightweight plan ──────────────────────────────

export function buildRagLightweightVisualizationPlan(
  input: LightweightAgentInput,
  mode: GenerationMode,
): RagLightweightVisualizationPlan {
  const taskPlan = buildRagVisualizationTaskPlan(input);
  const rawDomainModel = buildRagDomainModel(input, taskPlan);
  const domainModel = maybeRunSpecialistVerifier(input, taskPlan, rawDomainModel, mode);
  const visualizationMapping = buildRagVisualizationMapping(input, taskPlan, domainModel);
  const layoutPlan = buildRagUILayoutPlan(input, taskPlan, visualizationMapping);

  return { taskPlan, domainModel, visualizationMapping, layoutPlan };
}

// ─── Prompt injection helper ────────────────────────────────────────────────────

/**
 * Formats the lightweight plan into a compact prompt block for HTML generation.
 * Injected into the user prompt of htmlGenerator.ts and auditPipeline.ts.
 */
export function formatLightweightPlanForPrompt(plan: RagLightweightVisualizationPlan): string {
  const { taskPlan, domainModel, visualizationMapping, layoutPlan } = plan;

  const domainVars = domainModel.variables
    .slice(0, 8)
    .map((v) => `${v.label ?? v.name}${v.unit ? ` (${v.unit})` : ''} [${v.role}]`)
    .join(', ');

  const stateMap = visualizationMapping.stateToVisualMapping
    .slice(0, 6)
    .map((m) => `${m.stateOrVariable} → ${m.visualEncoding}`)
    .join('; ');

  const interactionLines = visualizationMapping.interactionModel
    .slice(0, 5)
    .map((item) => `- ${item}`)
    .join('\n');

  const layoutConstraints = [
    '- main stage >= 65% of available width',
    '- side panel 25%-35% (controls + metrics only)',
    '- first screen shows core visualization without scrolling',
    '- explanations, formulas, citations collapsed in details/tabs',
    '- avoid nested scroll containers',
    '- responsive: stack vertically on narrow screens (< 768px)',
  ].join('\n');

  return `## Lightweight Agent Plan (Round 002B)

**domain_model:**
- domain: ${domainModel.domain}
- variables: ${domainVars || 'derive from question'}
- formulas/rules: ${domainModel.formulasOrRules.slice(0, 4).join(' | ') || 'derive from question'}
- states: ${domainModel.states.slice(0, 4).join(' → ') || 'define from problem'}
- edge cases: ${domainModel.edgeCases.slice(0, 3).join(', ')}
${domainModel.specialistNotes?.length ? `- specialist notes: ${domainModel.specialistNotes.join('; ')}` : ''}

**visual_state_mapping:**
- objects: ${visualizationMapping.visualObjects.join(', ')}
- state mappings: ${stateMap}
- animation steps: ${visualizationMapping.animationSteps.slice(0, 4).join(' → ')}
- metrics/labels: ${visualizationMapping.metricsOrLabels.slice(0, 4).join(', ')}

**interaction_model:**
${interactionLines}

**layout_contract:**
${layoutConstraints}
- first screen checklist: ${layoutPlan.firstScreenChecklist.slice(0, 3).join(' | ')}

**task context:**
- coreGoal: ${taskPlan.coreGoal}
- mainVisualFocus: ${taskPlan.mainVisualFocus}
- outputForm: ${taskPlan.outputForm}`;
}

// ─── Private helpers ────────────────────────────────────────────────────────────

function isComplexSpecialistDomain(subject: string, taskType: string, question: string): boolean {
  const specialistSubjects = ['physics', 'math', 'algorithm', 'network', 'machine_learning', 'chemistry'];
  const lq = question.toLowerCase();
  const specialistKeywords = ['conservation', 'collision', 'gradient', 'convergence', 'tcp', 'bst',
    'backpropagation', 'equilibrium', 'titration', 'handshake'];
  return specialistSubjects.some((s) => subject?.includes(s))
    || specialistKeywords.some((kw) => lq.includes(kw))
    || taskType === 'step_solution';
}

function describeSpecialistReason(subject: string, taskType: string): string {
  if (subject?.includes('physics')) return 'Physics domain: validate conservation laws, forces, and coordinate setup.';
  if (subject?.includes('math')) return 'Math domain: validate function domain, special points, and formula correctness.';
  if (subject?.includes('algorithm') || subject?.includes('data_structure')) return 'CS domain: validate data structure states and algorithm correctness.';
  if (subject?.includes('network')) return 'Network domain: validate protocol state machine and packet flow.';
  if (subject?.includes('machine_learning')) return 'ML domain: validate gradient direction, convergence conditions, and loss surface.';
  if (subject?.includes('chemistry')) return 'Chemistry domain: validate reaction rules, equivalence point, and concentration variables.';
  return `Domain specialist needed for ${taskType} task.`;
}

function resolveDomain(subject: string, taskType: string): string {
  if (subject?.includes('physics')) return 'physics';
  if (subject?.includes('math')) return 'math';
  if (subject?.includes('algorithm') || subject?.includes('data_structure') || taskType?.includes('algorithm')) return 'algorithm';
  if (subject?.includes('network') || taskType?.includes('network')) return 'computer_network';
  if (subject?.includes('machine_learning')) return 'machine_learning';
  if (subject?.includes('chemistry')) return 'chemistry';
  if (subject?.includes('biology')) return 'biology';
  if (subject?.includes('geography')) return 'geography';
  if (subject?.includes('economics')) return 'economics';
  return 'generic';
}

function defaultStates(domain: string): string[] {
  const states: Record<string, string[]> = {
    physics: ['initial state', 'motion phase', 'peak/collision', 'final state'],
    math: ['base case', 'transformation', 'result/root'],
    algorithm: ['initial', 'comparison/operation', 'state transition', 'terminal'],
    computer_network: ['CLOSED', 'SYN_SENT', 'ESTABLISHED', 'FIN_WAIT'],
    machine_learning: ['initialization', 'forward pass', 'gradient computation', 'weight update', 'convergence check'],
    chemistry: ['before reaction', 'during reaction', 'equivalence point', 'after reaction'],
    generic: ['initial', 'processing', 'result'],
  };
  return states[domain] ?? states['generic'];
}

function defaultEdgeCases(domain: string): string[] {
  const cases: Record<string, string[]> = {
    physics: ['v = 0 boundary', 'angle = 0° or 90°', 'energy conservation check'],
    math: ['x = 0', 'asymptotes', 'discontinuities'],
    algorithm: ['empty input', 'single element', 'already sorted/balanced'],
    computer_network: ['packet loss', 'timeout retransmission', 'duplicate ACK'],
    machine_learning: ['learning rate too large (diverge)', 'learning rate too small (slow)', 'local minimum'],
    chemistry: ['excess reagent', 'limiting reagent', 'equivalence point'],
    generic: ['empty input', 'boundary values', 'error state'],
  };
  return cases[domain] ?? cases['generic'];
}

function defaultInteractions(domain: string): string[] {
  const interactions: Record<string, string[]> = {
    physics: ['Slider: initial velocity (v₀)', 'Slider: angle (θ°)', 'Button: Start / Reset', 'Live metrics: H_max, Range, t_flight'],
    math: ['Slider: parameter value', 'Button: plot / reset', 'Toggle: show roots/extrema', 'Live: f(x) value at cursor'],
    algorithm: ['Button: Step forward', 'Button: Run all / Reset', 'Highlight: active node/index', 'Counter: comparisons'],
    computer_network: ['Button: Send SYN / Reset', 'Step-through: protocol timeline', 'Highlight: active packet', 'State label: current phase'],
    machine_learning: ['Slider: learning rate', 'Button: Step / Run all / Reset', 'Plot: loss curve', 'Metrics: current loss, iteration'],
    chemistry: ['Slider: volume added (mL)', 'Button: Reset', 'Live: pH / concentration', 'Color: beaker changes with pH'],
    generic: ['Slider: main parameter', 'Button: Start / Reset', 'Live: key metric'],
  };
  return interactions[domain] ?? interactions['generic'];
}

function inferVariableRole(role: string): RagDomainModel['variables'][number]['role'] {
  const r = role.toLowerCase();
  if (r.includes('given') || r.includes('input')) return 'given';
  if (r.includes('derived') || r.includes('calculated')) return 'derived';
  if (r.includes('control') || r.includes('slider')) return 'control';
  if (r.includes('state')) return 'state';
  if (r.includes('output') || r.includes('result')) return 'output';
  return 'derived';
}

function inferVisualEncoding(
  v: RagDomainModel['variables'][number],
  domain: string,
): string {
  const name = (v.label ?? v.name).toLowerCase();
  if (name.includes('velocity') || (name === 'v' && domain === 'physics')) return 'arrow length and direction';
  if (name.includes('height') || name === 'h') return 'vertical position / track height';
  if (name.includes('angle') || name.includes('θ') || name.includes('theta')) return 'angle of trajectory arrow';
  if (name.includes('ph')) return 'curve y-coordinate and beaker color gradient';
  if (name.includes('force') || name === 'f') return 'arrow magnitude and direction';
  if (name.includes('energy') || name === 'e') return 'bar chart height or color intensity';
  if (name.includes('node') || name.includes('path')) return 'highlighted node and edge path';
  if (name.includes('loss') || name.includes('gradient')) return 'point on loss surface / curve y-value';
  return `${v.label ?? v.name} encoded as visual dimension`;
}

function inferVisualFocus(question: string, subject: string): string {
  const lq = question.toLowerCase();
  if (lq.includes('projectile') || lq.includes('斜抛') || lq.includes('trajectory')) return 'projectile trajectory with velocity arrows';
  if (lq.includes('collision') || lq.includes('碰撞')) return 'collision phases with momentum arrows';
  if (lq.includes('tcp') || lq.includes('handshake') || lq.includes('三次握手')) return 'client-server message sequence diagram';
  if (lq.includes('bst') || lq.includes('binary search tree') || lq.includes('二叉搜索树')) return 'BST node tree with highlighted comparison path';
  if (lq.includes('gradient') || lq.includes('backprop') || lq.includes('loss')) return 'loss surface with gradient descent steps';
  if (lq.includes('ph') || lq.includes('titration') || lq.includes('滴定')) return 'pH curve and color-changing beaker';
  if (subject?.includes('math') || lq.includes('function') || lq.includes('curve') || lq.includes('函数')) return 'function graph with labeled key points';
  return 'core concept visualization';
}

function extractCoreGoal(question: string): string {
  return question.slice(0, 120).replace(/\s+/g, ' ').trim()
    || 'Visualize the core concept from the problem';
}

function inferTargetUser(taskType: string): string {
  if (taskType?.includes('teacher')) return 'teacher';
  return 'student';
}

function extractLatexVars(latex: string): string[] {
  const matches = latex.match(/\b([a-zA-Z_]\w{0,3})\b/g) ?? [];
  const exclude = new Set(['sin', 'cos', 'tan', 'log', 'ln', 'sqrt', 'frac', 'int', 'sum', 'lim',
    'pm', 'cdot', 'text', 'the', 'for', 'and', 'max', 'min']);
  return [...new Set(matches.filter((m) => !exclude.has(m.toLowerCase())))].slice(0, 6);
}

function buildSpecialistNotes(domain: string, input: LightweightAgentInput): string[] {
  const notes: string[] = [];
  if (domain === 'physics') {
    notes.push('Verify conservation laws hold across all states.');
    notes.push('Confirm coordinate system is consistent (x right, y up).');
  } else if (domain === 'math') {
    notes.push('Confirm function domain is correctly bounded.');
    notes.push('Check special points (roots, extrema, asymptotes) are shown.');
  } else if (domain === 'algorithm') {
    notes.push('Validate data structure state at each operation step.');
    notes.push('Confirm terminal condition is clearly shown.');
  } else if (domain === 'computer_network') {
    notes.push('Verify protocol state machine is complete (all states shown).');
    notes.push('Ensure packet loss / retransmission edge cases are represented.');
  } else if (domain === 'machine_learning') {
    notes.push('Verify gradient direction is correct (descending on convex loss).');
    notes.push('Show both convergence and divergence branches for learning rate.');
  }
  if (input.formulaBlocks?.length) {
    notes.push(`Key formulas to preserve: ${input.formulaBlocks.slice(0, 2).map((f) => f.latex).join('; ')}`);
  }
  return notes;
}
