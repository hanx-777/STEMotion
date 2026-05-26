import { getActionsForStep } from '../schema/experiment';
import { useAssistantStore } from '../stores/assistantStore';
import { useExperimentStore } from '../stores/experimentStore';
import { usePlaybackStore } from '../stores/playbackStore';
import { useWidgetIframeStore } from '../stores/widgetIframeStore';
import { actionExecutor } from './actionExecutor';
import { createLogger } from '@/lib/logger';

const log = createLogger('playback');

class ExperimentPlaybackEngine {
  private abortController: AbortController | null = null;
  private running = false;

  async play() {
    const config = useExperimentStore.getState().config;
    if (!config || this.running) return;

    this.abortController = new AbortController();
    this.running = true;
    usePlaybackStore.getState().setStatus('playing');

    try {
      while (usePlaybackStore.getState().currentStepIndex < config.explanationSteps.length) {
        if (usePlaybackStore.getState().status !== 'playing') break;

        const stepIndex = usePlaybackStore.getState().currentStepIndex;
        const step = config.explanationSteps[stepIndex];
        const actions = getActionsForStep(config, stepIndex);

        useAssistantStore.getState().setNarration(step.narration);

        while (usePlaybackStore.getState().currentActionIndex < actions.length) {
          if (usePlaybackStore.getState().status !== 'playing') break;

          const actionIndex = usePlaybackStore.getState().currentActionIndex;
          await actionExecutor.execute(actions[actionIndex], this.abortController.signal);
          usePlaybackStore.getState().setAction(actionIndex + 1);
        }

        if (usePlaybackStore.getState().status !== 'playing') break;
        usePlaybackStore.getState().setStep(stepIndex + 1);
      }

      const playback = usePlaybackStore.getState();
      if (playback.status === 'playing' && playback.currentStepIndex >= config.explanationSteps.length) {
        usePlaybackStore.getState().setStatus('completed');
        useExperimentStore.getState().setSimulationActive(false);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        log.error('Playback error', error);
        usePlaybackStore.getState().setStatus('paused');
      }
    } finally {
      this.running = false;
      this.abortController = null;
    }
  }

  pause() {
    const config = useExperimentStore.getState().config;
    usePlaybackStore.getState().setStatus('paused');
    useExperimentStore.getState().setSimulationActive(false);
    if (config?.renderer === 'interactive_html') {
      useWidgetIframeStore.getState().sendMessage('SET_WIDGET_STATE', { state: { running: false } }, config.id);
    }
    this.abortController?.abort();
    actionExecutor.cancel();
    this.running = false;
  }

  reset() {
    const config = useExperimentStore.getState().config;
    this.pause();
    usePlaybackStore.getState().reset();
    useExperimentStore.getState().resetSimulation();
    useAssistantStore.getState().reset();
    if (config?.interactiveWidget?.widgetConfig.defaultState) {
      useWidgetIframeStore
        .getState()
        .sendMessage(
          'SET_WIDGET_STATE',
          { state: config.interactiveWidget.widgetConfig.defaultState as Record<string, unknown> },
          config.id,
        );
    }
  }

  nextStep() {
    const config = useExperimentStore.getState().config;
    if (!config) return;

    this.pause();
    const nextIndex = Math.min(usePlaybackStore.getState().currentStepIndex + 1, config.explanationSteps.length - 1);
    usePlaybackStore.getState().setStep(nextIndex);
    useAssistantStore.getState().setNarration(config.explanationSteps[nextIndex]?.narration ?? null);
  }

  previousStep() {
    const config = useExperimentStore.getState().config;
    if (!config) return;

    this.pause();
    const previousIndex = Math.max(usePlaybackStore.getState().currentStepIndex - 1, 0);
    usePlaybackStore.getState().setStep(previousIndex);
    useAssistantStore.getState().setNarration(config.explanationSteps[previousIndex]?.narration ?? null);
  }

  enterLiveMode() {
    this.pause();
    usePlaybackStore.getState().setStatus('live');
    useExperimentStore.getState().setSimulationActive(true);
  }
}

export const playbackEngine = new ExperimentPlaybackEngine();
