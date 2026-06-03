import type { ExperimentAction } from './actions';

export type SubjectType = 'physics' | 'chemistry' | 'math' | 'biology';
export type RendererType =
  | 'inclined_plane'
  | 'interactive_html'
  | 'free_fall'
  | 'ohms_law'
  | 'neutralization';

export interface ExperimentEnvironment {
  gravity?: number;
  friction?: boolean;
  airResistance?: boolean;
  temperatureCelsius?: number;
  [key: string]: unknown;
}

export interface ExperimentObject {
  id: string;
  type: string;
  label: string;
  initialState: Record<string, unknown>;
  style?: Record<string, unknown>;
}

export interface ExperimentParameter {
  id: string;
  label: string;
  type: 'number' | 'boolean' | 'enum';
  defaultValue: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: string[];
  explanation?: string;
}

export interface ExperimentSimulation {
  type: 'inclined_plane_cart' | 'parallel_circuit' | 'placeholder';
  model: string;
  timeStepMs: number;
  durationSeconds: number;
  trackedMetrics: string[];
}

export type InteractiveWidgetType = 'simulation' | 'diagram' | 'game' | 'visualization3d';

export interface InteractiveWidget {
  html: string;
  widgetType: InteractiveWidgetType;
  widgetConfig: Record<string, unknown>;
  allowedMessageTypes: Array<
    'SET_WIDGET_STATE' | 'HIGHLIGHT_ELEMENT' | 'ANNOTATE_ELEMENT' | 'REVEAL_ELEMENT'
  >;
}

export interface ExplanationStep {
  id: string;
  title: string;
  narration: string;
  actionIds: string[];
}

export interface QuizQuestion {
  id: string;
  question: string;
  type: 'multiple_choice' | 'boolean' | 'short_answer';
  options?: string[];
  correctAnswer: string | number | boolean;
  explanation?: string;
}

export interface ExperimentConfig {
  id: string;
  title: string;
  subject: SubjectType;
  gradeLevel: string;
  description: string;
  learningGoals: string[];
  renderer: RendererType;
  environment: ExperimentEnvironment;
  objects: ExperimentObject[];
  parameters: ExperimentParameter[];
  simulation: ExperimentSimulation;
  interactiveWidget?: InteractiveWidget;
  actions: ExperimentAction[];
  explanationSteps: ExplanationStep[];
  quiz: QuizQuestion[];
}

export function getActionsForStep(config: ExperimentConfig, stepIndex: number): ExperimentAction[] {
  const step = config.explanationSteps[stepIndex];
  if (!step) return [];

  const byId = new Map(config.actions.map((action) => [action.id, action]));
  return step.actionIds.map((id) => byId.get(id)).filter((action): action is ExperimentAction => Boolean(action));
}
