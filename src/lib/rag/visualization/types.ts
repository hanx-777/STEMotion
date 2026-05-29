export type VisualizationType =
  | 'function_graph'
  | 'force_diagram'
  | 'algorithm_trace'
  | 'projectile_motion';

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
  parameters: {
    v0?: number;
    angle_deg?: number;
    g: number;
  };
}

export type VisualizationSpec =
  | FunctionGraphSpec
  | ForceDiagramSpec
  | AlgorithmTraceSpec
  | ProjectileMotionSpec;

export interface VisualizationQualityCheck {
  passed: boolean;
  score: number;
  issues: string[];
}
