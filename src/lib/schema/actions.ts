export type ActionType =
  | 'speech'
  | 'highlight_object'
  | 'highlight_formula'
  | 'set_parameter'
  | 'start_simulation'
  | 'pause_simulation'
  | 'reset_simulation'
  | 'show_formula'
  | 'show_metric'
  | 'show_quiz'
  | 'compare_result'
  | 'set_widget_state'
  | 'highlight_widget_element'
  | 'annotate_widget_element'
  | 'reveal_widget_element';

export interface BaseAction {
  id: string;
  type: ActionType;
  duration?: number; // duration in ms, if applicable
}

export interface SpeechAction extends BaseAction {
  type: 'speech';
  text: string;
  audioUrl?: string; // Optional: for future TTS
}

export interface HighlightObjectAction extends BaseAction {
  type: 'highlight_object';
  objectId: string;
  color?: string;
}

export interface HighlightFormulaAction extends BaseAction {
  type: 'highlight_formula';
  formulaId: string;
}

export interface SetParameterAction extends BaseAction {
  type: 'set_parameter';
  parameterId: string;
  value: number | string | boolean;
}

export interface StartSimulationAction extends BaseAction {
  type: 'start_simulation';
}

export interface PauseSimulationAction extends BaseAction {
  type: 'pause_simulation';
}

export interface ResetSimulationAction extends BaseAction {
  type: 'reset_simulation';
}

export interface ShowFormulaAction extends BaseAction {
  type: 'show_formula';
  formulaId: string;
  latex: string;
  title?: string;
}

export interface ShowMetricAction extends BaseAction {
  type: 'show_metric';
  metricId: string;
  label: string;
}

export interface ShowQuizAction extends BaseAction {
  type: 'show_quiz';
  quizId: string;
}

export interface CompareResultAction extends BaseAction {
  type: 'compare_result';
  targetIds: string[];
}

export interface SetWidgetStateAction extends BaseAction {
  type: 'set_widget_state';
  state: Record<string, unknown>;
}

export interface HighlightWidgetElementAction extends BaseAction {
  type: 'highlight_widget_element';
  target: string;
  content?: string;
}

export interface AnnotateWidgetElementAction extends BaseAction {
  type: 'annotate_widget_element';
  target: string;
  content: string;
}

export interface RevealWidgetElementAction extends BaseAction {
  type: 'reveal_widget_element';
  target: string;
}

export type ExperimentAction =
  | SpeechAction
  | HighlightObjectAction
  | HighlightFormulaAction
  | SetParameterAction
  | StartSimulationAction
  | PauseSimulationAction
  | ResetSimulationAction
  | ShowFormulaAction
  | ShowMetricAction
  | ShowQuizAction
  | CompareResultAction
  | SetWidgetStateAction
  | HighlightWidgetElementAction
  | AnnotateWidgetElementAction
  | RevealWidgetElementAction;
