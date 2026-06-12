import { useDeepInteractionUIStore } from '@/lib/stores/deepInteractionUIStore';
import { useDeepWidgetIframeStore } from '@/lib/stores/deepWidgetIframeStore';
import type { InteractionAction } from './actionTypes';

class InteractionActionExecutor {
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  async execute(action: InteractionAction, signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
      throw new DOMException('Action cancelled', 'AbortError');
    }

    this.apply(action);
    const speed = useDeepInteractionUIStore.getState().playbackSpeed;
    await this.wait(Math.max(120, (action.durationMs ?? 700) / speed), signal);
  }

  cancel(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private apply(action: InteractionAction): void {
    const ui = useDeepInteractionUIStore.getState();

    switch (action.type) {
      case 'speech':
        return;
      case 'highlight_object':
        ui.setHighlightObject(action.objectId);
        return;
      case 'highlight_formula':
        ui.setHighlightFormula(action.formulaId);
        return;
      case 'set_parameter':
        ui.setParameterOverride(action.parameterId, action.value);
        return;
      case 'start_simulation':
        ui.setSimulationRunning(true);
        return;
      case 'pause_simulation':
        ui.setSimulationRunning(false);
        return;
      case 'reset_simulation':
        ui.resetSimulation();
        return;
      case 'show_formula':
        ui.setHighlightFormula(action.formulaId);
        return;
      case 'show_metric':
        ui.showMetric(action.metricId);
        return;
      case 'show_quiz':
        ui.setActiveQuiz(action.quizId);
        return;
      case 'compare_result':
        return;
      case 'focus_node':
        ui.setFocusedNode(action.nodeId);
        return;
      case 'reveal_node':
        ui.revealNode(action.nodeId);
        return;
      case 'set_widget_state':
        useDeepWidgetIframeStore.getState().sendMessage('SET_WIDGET_STATE', { state: action.state });
        return;
      case 'highlight_widget_element':
        useDeepWidgetIframeStore.getState().sendMessage('HIGHLIGHT_ELEMENT', {
          target: action.target,
          content: action.content,
        });
        return;
      case 'annotate_widget_element':
        useDeepWidgetIframeStore.getState().sendMessage('ANNOTATE_ELEMENT', {
          target: action.target,
          content: action.content,
        });
        return;
      case 'reveal_widget_element':
        useDeepWidgetIframeStore.getState().sendMessage('REVEAL_ELEMENT', { target: action.target });
        return;
    }
  }

  private wait(duration: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const abort = () => {
        this.cancel();
        signal.removeEventListener('abort', abort);
        reject(new DOMException('Action cancelled', 'AbortError'));
      };

      signal.addEventListener('abort', abort);
      this.timeoutId = setTimeout(() => {
        signal.removeEventListener('abort', abort);
        this.timeoutId = null;
        resolve();
      }, duration);
    });
  }
}

export const interactionActionExecutor = new InteractionActionExecutor();
