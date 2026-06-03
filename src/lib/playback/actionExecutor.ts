import type { ExperimentAction } from '../schema/actions';
import { useAssistantStore } from '../stores/assistantStore';
import { useExperimentStore } from '../stores/experimentStore';
import { usePlaybackStore } from '../stores/playbackStore';
import { useWidgetIframeStore } from '../stores/widgetIframeStore';

class ExperimentActionExecutor {
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  async execute(action: ExperimentAction, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(new DOMException('Action cancelled', 'AbortError'));

    this.applyAction(action);
    const speed = usePlaybackStore.getState().speed;
    const duration = Math.max(120, (action.duration ?? 500) / speed);

    return this.wait(duration, signal);
  }

  cancel() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private applyAction(action: ExperimentAction) {
    const playbackStore = usePlaybackStore.getState();
    const experimentStore = useExperimentStore.getState();
    const assistantStore = useAssistantStore.getState();
    const widgetStore = useWidgetIframeStore.getState();
    const config = experimentStore.config;

    const sendWidgetState = (state: Record<string, unknown>) => {
      if (config?.renderer === 'interactive_html') {
        widgetStore.sendMessage('SET_WIDGET_STATE', { state }, config.id);
      }
    };

    switch (action.type) {
      case 'speech':
        assistantStore.setNarration(action.text);
        assistantStore.addMessage({ role: 'assistant', content: action.text });
        break;

      case 'highlight_object':
        playbackStore.highlightObject(action.objectId);
        break;

      case 'highlight_formula':
        playbackStore.highlightFormula(action.formulaId);
        break;

      case 'set_parameter':
        experimentStore.setParameter(action.parameterId, action.value);
        break;

      case 'start_simulation':
        experimentStore.setSimulationActive(true);
        playbackStore.setStatus('playing');
        sendWidgetState({ running: true });
        break;

      case 'pause_simulation':
        experimentStore.setSimulationActive(false);
        sendWidgetState({ running: false });
        break;

      case 'reset_simulation':
        experimentStore.resetSimulation();
        if (config?.interactiveWidget?.widgetConfig.defaultState) {
          sendWidgetState(config.interactiveWidget.widgetConfig.defaultState as Record<string, unknown>);
        }
        break;

      case 'show_formula':
        assistantStore.addFormula(action.formulaId, action.latex, action.title);
        playbackStore.highlightFormula(action.formulaId);
        break;

      case 'show_metric':
        playbackStore.showMetric(action.metricId);
        assistantStore.setNarration(`正在观察指标：${action.label}`);
        break;

      case 'show_quiz':
        playbackStore.showQuiz(action.quizId);
        assistantStore.setNarration('请完成右侧课堂检查题，确认你已经理解变量之间的关系。');
        break;

      case 'compare_result':
        playbackStore.setComparisonNote(`比较 ${action.targetIds.join(' / ')} 后可以看到：变量关系需要回到模型公式中解释。`);
        assistantStore.setNarration('比较结果已经更新。请观察当前指标与公式之间的关系。');
        break;

      case 'set_widget_state':
        widgetStore.sendMessage('SET_WIDGET_STATE', { state: action.state }, config?.id);
        break;

      case 'highlight_widget_element':
        widgetStore.sendMessage('HIGHLIGHT_ELEMENT', { target: action.target, content: action.content }, config?.id);
        break;

      case 'annotate_widget_element':
        widgetStore.sendMessage('ANNOTATE_ELEMENT', { target: action.target, content: action.content }, config?.id);
        assistantStore.setNarration(action.content);
        break;

      case 'reveal_widget_element':
        widgetStore.sendMessage('REVEAL_ELEMENT', { target: action.target }, config?.id);
        break;
    }
  }

  private wait(duration: number, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
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

export const actionExecutor = new ExperimentActionExecutor();
