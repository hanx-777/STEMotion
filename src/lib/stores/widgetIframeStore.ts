import { create } from 'zustand';

type WidgetMessageSender = (type: string, payload: Record<string, unknown>) => void;

interface WidgetIframeState {
  sendMessageByExperiment: Record<string, WidgetMessageSender>;
  activeExperimentId: string | null;
  registerIframe: (experimentId: string, sender: WidgetMessageSender | null) => void;
  setActiveExperiment: (experimentId: string | null) => void;
  sendMessage: (type: string, payload?: Record<string, unknown>, experimentId?: string) => void;
}

export const useWidgetIframeStore = create<WidgetIframeState>((set, get) => ({
  sendMessageByExperiment: {},
  activeExperimentId: null,

  registerIframe: (experimentId, sender) =>
    set((state) => {
      const next = { ...state.sendMessageByExperiment };
      if (sender) {
        next[experimentId] = sender;
      } else {
        delete next[experimentId];
      }
      return { sendMessageByExperiment: next };
    }),

  setActiveExperiment: (experimentId) => set({ activeExperimentId: experimentId }),

  sendMessage: (type, payload = {}, experimentId) => {
    const state = get();
    const targetId = experimentId ?? state.activeExperimentId;
    if (!targetId) return;

    state.sendMessageByExperiment[targetId]?.(type, payload);
  },
}));
