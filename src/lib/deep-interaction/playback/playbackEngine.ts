import type { InteractionArtifact } from '../types';
import { useDeepInteractionUIStore } from '@/lib/stores/deepInteractionUIStore';
import { interactionActionExecutor } from '../actions/actionExecutor';

class InteractionPlaybackEngine {
  private abortController: AbortController | null = null;
  private running = false;

  async play(artifact: InteractionArtifact | null): Promise<void> {
    if (!artifact || this.running) return;

    const steps = artifact.schema.explanationSteps;
    if (steps.length === 0) return;

    this.abortController = new AbortController();
    this.running = true;
    useDeepInteractionUIStore.getState().setPlaybackStatus('playing');

    try {
      while (useDeepInteractionUIStore.getState().currentStepIndex < steps.length) {
        if (useDeepInteractionUIStore.getState().playbackStatus !== 'playing') break;

        const stepIndex = useDeepInteractionUIStore.getState().currentStepIndex;
        const step = steps[stepIndex];
        const actions = step.actions ?? [];

        for (const action of actions) {
          if (useDeepInteractionUIStore.getState().playbackStatus !== 'playing') break;
          await interactionActionExecutor.execute(action, this.abortController.signal);
        }

        if (useDeepInteractionUIStore.getState().playbackStatus !== 'playing') break;
        useDeepInteractionUIStore.getState().setCurrentStepIndex(stepIndex + 1);
      }

      const ui = useDeepInteractionUIStore.getState();
      if (ui.playbackStatus === 'playing' && ui.currentStepIndex >= steps.length) {
        ui.setPlaybackStatus('completed');
        ui.setSimulationRunning(false);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        useDeepInteractionUIStore.getState().setPlaybackStatus('paused');
      }
    } finally {
      this.abortController = null;
      this.running = false;
    }
  }

  pause(): void {
    useDeepInteractionUIStore.getState().setPlaybackStatus('paused');
    useDeepInteractionUIStore.getState().setSimulationRunning(false);
    this.abortController?.abort();
    interactionActionExecutor.cancel();
    this.running = false;
  }

  reset(): void {
    this.pause();
    const ui = useDeepInteractionUIStore.getState();
    ui.resetPlayback();
    ui.resetSimulation();
  }

  nextStep(artifact: InteractionArtifact | null): void {
    if (!artifact) return;
    this.pause();
    const next = Math.min(
      useDeepInteractionUIStore.getState().currentStepIndex + 1,
      Math.max(artifact.schema.explanationSteps.length - 1, 0),
    );
    useDeepInteractionUIStore.getState().setCurrentStepIndex(next);
  }

  previousStep(): void {
    this.pause();
    const previous = Math.max(useDeepInteractionUIStore.getState().currentStepIndex - 1, 0);
    useDeepInteractionUIStore.getState().setCurrentStepIndex(previous);
  }

  enterLiveMode(): void {
    this.pause();
    useDeepInteractionUIStore.getState().setPlaybackStatus('live');
  }
}

export const interactionPlaybackEngine = new InteractionPlaybackEngine();
