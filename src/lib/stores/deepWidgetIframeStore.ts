import { create } from 'zustand';

type WidgetMessageSender = (type: string, payload: Record<string, unknown>) => void;

interface DeepWidgetIframeState {
  sendMessageByArtifact: Record<string, WidgetMessageSender>;
  activeArtifactId: string | null;
  registerIframe: (artifactId: string, sender: WidgetMessageSender | null) => void;
  setActiveArtifact: (artifactId: string | null) => void;
  sendMessage: (type: string, payload?: Record<string, unknown>, artifactId?: string) => void;
}

export const useDeepWidgetIframeStore = create<DeepWidgetIframeState>((set, get) => ({
  sendMessageByArtifact: {},
  activeArtifactId: null,

  registerIframe: (artifactId, sender) =>
    set((state) => {
      const next = { ...state.sendMessageByArtifact };
      if (sender) next[artifactId] = sender;
      else delete next[artifactId];
      return { sendMessageByArtifact: next };
    }),

  setActiveArtifact: (activeArtifactId) => set({ activeArtifactId }),

  sendMessage: (type, payload = {}, artifactId) => {
    const state = get();
    const targetId = artifactId ?? state.activeArtifactId;
    if (!targetId) return;
    state.sendMessageByArtifact[targetId]?.(type, payload);
  },
}));
