export type VisualizationType =
  | 'function_graph'
  | 'force_diagram'
  | 'algorithm_trace'
  | 'projectile_motion'
  | 'interactive_html';

export interface RagVisualizationVariable {
  name: string;
  label: string;
  value: string;
  unit?: string;
  role?: string;
}

export interface RagVisualizationBrief {
  originalQuestion: string;
  knowledgePoint: string;
  scenario: string;
  variables: RagVisualizationVariable[];
  visualGoal: string;
  recommendedType?: VisualizationType;
  mustShow: string[];
  avoidGenericDemo: boolean;
  confidence: number;
  source: 'heuristic' | 'llm';
}

export interface RagVisualizationNarrationStep {
  title: string;
  narration: string;
}

export interface RagVisualizationGenerationPlan {
  shouldGenerate: boolean;
  problemRestatement: string;
  knowledgePoint: string;
  variables: RagVisualizationVariable[];
  visualObjects: string[];
  controls: string[];
  metrics: string[];
  animationRequirements: string[];
  successCriteria: string[];
  rightPanelNarration: RagVisualizationNarrationStep[];
  recommendedType?: VisualizationType;
  confidence: number;
}

export interface VisualizationDecision {
  shouldVisualize: boolean;
  visualizationType?: VisualizationType;
  confidence: number;
  reason: string;
  extractedParameters: Record<string, unknown>;
}

export interface BaseVisualizationSpec {
  type: VisualizationType;
  title: string;
  description: string;
  sourceSectionId?: string;
  contextTitle?: string;
  knowledgePoint?: string;
  scenario?: string;
  variables?: RagVisualizationVariable[];
  visualGoal?: string;
  brief?: RagVisualizationBrief;
}

export interface FunctionGraphSpec extends BaseVisualizationSpec {
  type: 'function_graph';
  expressions: Array<{
    id: string;
    label: string;
    latex: string;
    evaluator: string;
    color?: string;
  }>;
  domain: { xMin: number; xMax: number; yMin?: number; yMax?: number };
  pointsOfInterest: Array<{
    x: number;
    y: number;
    label: string;
    type: 'extremum' | 'inflection' | 'intercept' | 'custom';
  }>;
  intervals?: Array<{
    from: number;
    to: number;
    property: 'increasing' | 'decreasing' | 'concave_up' | 'concave_down';
    label: string;
  }>;
  gridVisible?: boolean;
}

export interface ForceDiagramSpec extends BaseVisualizationSpec {
  type: 'force_diagram';
  scene: 'horizontal' | 'incline' | 'pulley' | 'free_body';
  objectLabel: string;
  angleDeg?: number;
  forces: Array<{
    id: string;
    label: string;
    symbol: string;
    magnitude: string;
    angleDeg: number;
    color?: string;
    explanation: string;
  }>;
  annotations?: Array<{ text: string; x: number; y: number }>;
}

export interface AlgorithmTraceSpec extends BaseVisualizationSpec {
  type: 'algorithm_trace';
  algorithmName: string;
  dataStructure: 'stack' | 'queue' | 'array' | 'tree' | 'graph';
  inputExample: string;
  steps: Array<{
    stepIndex: number;
    operation: string;
    state: Record<string, unknown>;
    highlight?: string[];
    explanation: string;
  }>;
}

export interface ProjectileMotionSpec extends BaseVisualizationSpec {
  type: 'projectile_motion';
  motionType?: 'horizontal' | 'angled' | 'generic';
  parameters: {
    v0?: number;
    angle_deg?: number;
    g: number;
    time_s?: number;
    x_m?: number;
    y_m?: number;
  };
}

export interface InteractiveHtmlSpec extends BaseVisualizationSpec {
  type: 'interactive_html';
  html: string;
  interactionType: 'physics_simulation' | 'math_visualization' | 'algorithm_demo' | 'custom';
  parameters: Record<string, unknown>;
  clarificationNeeded?: {
    questions: Array<{
      id: string;
      question: string;
      type: 'number' | 'choice' | 'text';
      options?: string[];
      defaultValue?: unknown;
    }>;
  };
}

export type VisualizationSpec =
  | FunctionGraphSpec
  | ForceDiagramSpec
  | AlgorithmTraceSpec
  | ProjectileMotionSpec
  | InteractiveHtmlSpec;

export interface VisualizationQualityCheck {
  passed: boolean;
  score: number;
  issues: string[];
}
