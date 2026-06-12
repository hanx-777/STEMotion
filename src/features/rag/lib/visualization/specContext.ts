import type {
  AlgorithmTraceSpec,
  ForceDiagramSpec,
  FunctionGraphSpec,
  InteractiveHtmlSpec,
  ProjectileMotionSpec,
  RagVisualizationVariable,
  VisualizationSpec,
  VisualizationType,
} from './types';

const MAX_VARIABLES = 8;
const MAX_PARAMETERS = 12;
const MAX_SAMPLE_STEPS = 4;
const MAX_FORCES = 8;
const MAX_EXPRESSIONS = 4;
const MAX_POINTS = 6;
const MAX_TEXT_LENGTH = 220;

export interface CompactVisualizationSpecContext {
  type: VisualizationType;
  title: string;
  description: string;
  contextTitle?: string;
  knowledgePoint?: string;
  scenario?: string;
  visualGoal?: string;
  variables?: RagVisualizationVariable[];
  parameters?: Record<string, unknown>;
  algorithmName?: string;
  dataStructure?: string;
  inputExample?: string;
  stepCount?: number;
  sampleSteps?: Array<{
    stepIndex: number;
    operation: string;
    explanation: string;
    stateKeys: string[];
    highlight?: string[];
  }>;
  omittedStepCount?: number;
  expressions?: Array<{
    id: string;
    label: string;
    latex: string;
  }>;
  domain?: FunctionGraphSpec['domain'];
  pointsOfInterest?: FunctionGraphSpec['pointsOfInterest'];
  scene?: ForceDiagramSpec['scene'];
  objectLabel?: string;
  forces?: Array<{
    id: string;
    label: string;
    symbol: string;
    magnitude: string;
    angleDeg: number;
  }>;
  motionType?: ProjectileMotionSpec['motionType'];
  interactionType?: InteractiveHtmlSpec['interactionType'];
  htmlSummary?: {
    length: number;
    hasVisualization: boolean;
    hasControls: boolean;
    hasMetrics: boolean;
  };
}

export function buildCompactVisualizationSpecContext(
  spec?: VisualizationSpec | null,
): CompactVisualizationSpecContext | null {
  if (!spec) return null;

  const base: CompactVisualizationSpecContext = {
    type: spec.type,
    title: truncateText(spec.title),
    description: truncateText(spec.description),
    ...(spec.contextTitle ? { contextTitle: truncateText(spec.contextTitle) } : {}),
    ...(spec.knowledgePoint ? { knowledgePoint: truncateText(spec.knowledgePoint) } : {}),
    ...(spec.scenario ? { scenario: truncateText(spec.scenario) } : {}),
    ...(spec.visualGoal ? { visualGoal: truncateText(spec.visualGoal) } : {}),
    ...(spec.variables?.length ? { variables: spec.variables.slice(0, MAX_VARIABLES).map(compactVariable) } : {}),
  };

  if (spec.type === 'algorithm_trace') return compactAlgorithmTrace(spec, base);
  if (spec.type === 'projectile_motion') return compactProjectileMotion(spec, base);
  if (spec.type === 'function_graph') return compactFunctionGraph(spec, base);
  if (spec.type === 'force_diagram') return compactForceDiagram(spec, base);
  return compactInteractiveHtml(spec, base);
}

export function formatCompactVisualizationSpecContext(
  context: CompactVisualizationSpecContext | null,
): string {
  return context ? JSON.stringify(context, null, 2) : '无';
}

function compactAlgorithmTrace(
  spec: AlgorithmTraceSpec,
  base: CompactVisualizationSpecContext,
): CompactVisualizationSpecContext {
  const sampleSteps = spec.steps.slice(0, MAX_SAMPLE_STEPS).map((step) => ({
    stepIndex: step.stepIndex,
    operation: truncateText(step.operation),
    explanation: truncateText(step.explanation),
    stateKeys: Object.keys(step.state).slice(0, MAX_PARAMETERS),
    ...(step.highlight?.length ? { highlight: step.highlight.slice(0, MAX_PARAMETERS).map(truncateText) } : {}),
  }));

  return {
    ...base,
    algorithmName: truncateText(spec.algorithmName),
    dataStructure: spec.dataStructure,
    inputExample: truncateText(spec.inputExample),
    stepCount: spec.steps.length,
    sampleSteps,
    omittedStepCount: Math.max(0, spec.steps.length - sampleSteps.length),
  };
}

function compactProjectileMotion(
  spec: ProjectileMotionSpec,
  base: CompactVisualizationSpecContext,
): CompactVisualizationSpecContext {
  return {
    ...base,
    ...(spec.motionType ? { motionType: spec.motionType } : {}),
    parameters: compactRecord(spec.parameters),
  };
}

function compactFunctionGraph(
  spec: FunctionGraphSpec,
  base: CompactVisualizationSpecContext,
): CompactVisualizationSpecContext {
  return {
    ...base,
    expressions: spec.expressions.slice(0, MAX_EXPRESSIONS).map((expression) => ({
      id: truncateText(expression.id),
      label: truncateText(expression.label),
      latex: truncateText(expression.latex),
    })),
    domain: spec.domain,
    pointsOfInterest: spec.pointsOfInterest.slice(0, MAX_POINTS),
  };
}

function compactForceDiagram(
  spec: ForceDiagramSpec,
  base: CompactVisualizationSpecContext,
): CompactVisualizationSpecContext {
  return {
    ...base,
    scene: spec.scene,
    objectLabel: truncateText(spec.objectLabel),
    ...(typeof spec.angleDeg === 'number' ? { parameters: { angleDeg: spec.angleDeg } } : {}),
    forces: spec.forces.slice(0, MAX_FORCES).map((force) => ({
      id: truncateText(force.id),
      label: truncateText(force.label),
      symbol: truncateText(force.symbol),
      magnitude: truncateText(force.magnitude),
      angleDeg: force.angleDeg,
    })),
  };
}

function compactInteractiveHtml(
  spec: InteractiveHtmlSpec,
  base: CompactVisualizationSpecContext,
): CompactVisualizationSpecContext {
  return {
    ...base,
    interactionType: spec.interactionType,
    parameters: compactRecord(spec.parameters),
    htmlSummary: {
      length: spec.html.length,
      hasVisualization: /id=["']visualization["']/.test(spec.html),
      hasControls: /id=["']controls["']/.test(spec.html),
      hasMetrics: /id=["']metrics["']/.test(spec.html),
    },
  };
}

function compactVariable(variable: RagVisualizationVariable): RagVisualizationVariable {
  return {
    name: truncateText(variable.name),
    label: truncateText(variable.label),
    value: truncateText(variable.value),
    ...(variable.unit ? { unit: truncateText(variable.unit) } : {}),
    ...(variable.role ? { role: truncateText(variable.role) } : {}),
  };
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record)
      .slice(0, MAX_PARAMETERS)
      .map(([key, value]) => [truncateText(key), compactValue(value)]),
  );
}

function compactValue(value: unknown): unknown {
  if (typeof value === 'string') return truncateText(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, MAX_PARAMETERS).map(compactValue);
  if (value && typeof value === 'object') return Object.keys(value as Record<string, unknown>).slice(0, MAX_PARAMETERS);
  return String(value);
}

function truncateText(value: string): string {
  if (value.length <= MAX_TEXT_LENGTH) return value;
  return `${value.slice(0, MAX_TEXT_LENGTH - 1)}…`;
}
