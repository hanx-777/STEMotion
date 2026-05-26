import { create } from 'zustand';

export type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'completed' | 'live';

interface PlaybackState {
  status: PlaybackStatus;
  currentStepIndex: number;
  currentActionIndex: number;
  highlightedObjects: string[];
  highlightedFormulaId: string | null;
  visibleMetricIds: string[];
  activeQuizId: string | null;
  comparisonNote: string | null;
  speed: number;

  setStatus: (status: PlaybackStatus) => void;
  setStep: (stepIndex: number) => void;
  setAction: (actionIndex: number) => void;
  highlightObject: (objectId: string) => void;
  highlightFormula: (formulaId: string | null) => void;
  showMetric: (metricId: string) => void;
  showQuiz: (quizId: string | null) => void;
  setComparisonNote: (note: string | null) => void;
  setSpeed: (speed: number) => void;
  clearHighlights: () => void;
  reset: () => void;
}

export const usePlaybackStore = create<PlaybackState>((set) => ({
  status: 'idle',
  currentStepIndex: 0,
  currentActionIndex: 0,
  highlightedObjects: [],
  highlightedFormulaId: null,
  visibleMetricIds: [],
  activeQuizId: null,
  comparisonNote: null,
  speed: 1,

  setStatus: (status) => set({ status }),
  setStep: (stepIndex) => set({ currentStepIndex: Math.max(0, stepIndex), currentActionIndex: 0 }),
  setAction: (actionIndex) => set({ currentActionIndex: Math.max(0, actionIndex) }),
  highlightObject: (objectId) => set({ highlightedObjects: [objectId] }),
  highlightFormula: (formulaId) => set({ highlightedFormulaId: formulaId }),
  showMetric: (metricId) =>
    set((state) => ({
      visibleMetricIds: state.visibleMetricIds.includes(metricId)
        ? state.visibleMetricIds
        : [...state.visibleMetricIds, metricId],
    })),
  showQuiz: (quizId) => set({ activeQuizId: quizId }),
  setComparisonNote: (note) => set({ comparisonNote: note }),
  setSpeed: (speed) => set({ speed }),
  clearHighlights: () => set({ highlightedObjects: [], highlightedFormulaId: null }),
  reset: () =>
    set({
      status: 'idle',
      currentStepIndex: 0,
      currentActionIndex: 0,
      highlightedObjects: [],
      highlightedFormulaId: null,
      visibleMetricIds: [],
      activeQuizId: null,
      comparisonNote: null,
      speed: 1,
    }),
}));
