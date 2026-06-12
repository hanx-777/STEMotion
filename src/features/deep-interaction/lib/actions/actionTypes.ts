export type InteractionActionType =
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
  | 'focus_node'
  | 'reveal_node'
  | 'set_widget_state'
  | 'highlight_widget_element'
  | 'annotate_widget_element'
  | 'reveal_widget_element';

export interface BaseInteractionAction {
  id: string;
  type: InteractionActionType;
  durationMs?: number;
}

export interface SpeechInteractionAction extends BaseInteractionAction {
  type: 'speech';
  text: string;
}

export interface HighlightObjectInteractionAction extends BaseInteractionAction {
  type: 'highlight_object';
  objectId: string;
}

export interface HighlightFormulaInteractionAction extends BaseInteractionAction {
  type: 'highlight_formula';
  formulaId: string;
}

export interface SetParameterInteractionAction extends BaseInteractionAction {
  type: 'set_parameter';
  parameterId: string;
  value: number | string | boolean;
}

export interface StartSimulationInteractionAction extends BaseInteractionAction {
  type: 'start_simulation';
}

export interface PauseSimulationInteractionAction extends BaseInteractionAction {
  type: 'pause_simulation';
}

export interface ResetSimulationInteractionAction extends BaseInteractionAction {
  type: 'reset_simulation';
}

export interface ShowFormulaInteractionAction extends BaseInteractionAction {
  type: 'show_formula';
  formulaId: string;
}

export interface ShowMetricInteractionAction extends BaseInteractionAction {
  type: 'show_metric';
  metricId: string;
}

export interface ShowQuizInteractionAction extends BaseInteractionAction {
  type: 'show_quiz';
  quizId: string;
}

export interface CompareResultInteractionAction extends BaseInteractionAction {
  type: 'compare_result';
  targetIds: string[];
}

export interface FocusNodeInteractionAction extends BaseInteractionAction {
  type: 'focus_node';
  nodeId: string;
}

export interface RevealNodeInteractionAction extends BaseInteractionAction {
  type: 'reveal_node';
  nodeId: string;
}

export interface SetWidgetStateInteractionAction extends BaseInteractionAction {
  type: 'set_widget_state';
  state: Record<string, unknown>;
}

export interface HighlightWidgetElementInteractionAction extends BaseInteractionAction {
  type: 'highlight_widget_element';
  target: string;
  content?: string;
}

export interface AnnotateWidgetElementInteractionAction extends BaseInteractionAction {
  type: 'annotate_widget_element';
  target: string;
  content: string;
}

export interface RevealWidgetElementInteractionAction extends BaseInteractionAction {
  type: 'reveal_widget_element';
  target: string;
}

export type InteractionAction =
  | SpeechInteractionAction
  | HighlightObjectInteractionAction
  | HighlightFormulaInteractionAction
  | SetParameterInteractionAction
  | StartSimulationInteractionAction
  | PauseSimulationInteractionAction
  | ResetSimulationInteractionAction
  | ShowFormulaInteractionAction
  | ShowMetricInteractionAction
  | ShowQuizInteractionAction
  | CompareResultInteractionAction
  | FocusNodeInteractionAction
  | RevealNodeInteractionAction
  | SetWidgetStateInteractionAction
  | HighlightWidgetElementInteractionAction
  | AnnotateWidgetElementInteractionAction
  | RevealWidgetElementInteractionAction;
