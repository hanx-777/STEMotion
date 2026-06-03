import { create } from 'zustand';
import type { DeepInteractionType } from '@/lib/deep-interaction/types';
import type { PlaybackStatus } from '@/lib/deep-interaction/playback/playbackTypes';

interface DeepInteractionUIState {
  selectedTypeFilter: DeepInteractionType | 'all';
  playbackStatus: PlaybackStatus;
  currentStepIndex: number;
  highlightedObjectId: string | null;
  highlightedFormulaId: string | null;
  focusedNodeId: string | null;
  revealedNodeIds: string[];
  activeQuizId: string | null;
  visibleMetricIds: string[];
  parameterOverrides: Record<string, number | string | boolean>;
  simulationRunning: boolean;
  simulationResetSignal: number;
  playbackSpeed: number;
  pendingPrompt: string;
  setTypeFilter: (filter: DeepInteractionType | 'all') => void;
  setPlaybackStatus: (status: PlaybackStatus) => void;
  setCurrentStepIndex: (index: number) => void;
  setHighlightObject: (id: string | null) => void;
  setHighlightFormula: (id: string | null) => void;
  setFocusedNode: (id: string | null) => void;
  revealNode: (id: string) => void;
  setActiveQuiz: (id: string | null) => void;
  showMetric: (id: string) => void;
  setParameterOverride: (id: string, value: number | string | boolean) => void;
  setSimulationRunning: (running: boolean) => void;
  resetSimulation: () => void;
  setPlaybackSpeed: (speed: number) => void;
  resetPlayback: () => void;
  setPendingPrompt: (prompt: string) => void;
}

export const useDeepInteractionUIStore = create<DeepInteractionUIState>((set) => ({
  selectedTypeFilter: 'simulation',
  playbackStatus: 'idle',
  currentStepIndex: 0,
  highlightedObjectId: null,
  highlightedFormulaId: null,
  focusedNodeId: null,
  revealedNodeIds: [],
  activeQuizId: null,
  visibleMetricIds: [],
  parameterOverrides: {},
  simulationRunning: false,
  simulationResetSignal: 0,
  playbackSpeed: 1,
  pendingPrompt: '',

  setTypeFilter: (selectedTypeFilter) => set({ selectedTypeFilter }),
  setPlaybackStatus: (playbackStatus) => set({ playbackStatus }),
  setCurrentStepIndex: (currentStepIndex) => set({ currentStepIndex: Math.max(0, currentStepIndex) }),
  setHighlightObject: (highlightedObjectId) => set({ highlightedObjectId }),
  setHighlightFormula: (highlightedFormulaId) => set({ highlightedFormulaId }),
  setFocusedNode: (focusedNodeId) => set({ focusedNodeId }),
  revealNode: (id) =>
    set((state) => ({
      revealedNodeIds: state.revealedNodeIds.includes(id) ? state.revealedNodeIds : [...state.revealedNodeIds, id],
    })),
  setActiveQuiz: (activeQuizId) => set({ activeQuizId }),
  showMetric: (id) =>
    set((state) => ({
      visibleMetricIds: state.visibleMetricIds.includes(id) ? state.visibleMetricIds : [...state.visibleMetricIds, id],
    })),
  setParameterOverride: (id, value) =>
    set((state) => ({ parameterOverrides: { ...state.parameterOverrides, [id]: value } })),
  setSimulationRunning: (simulationRunning) => set({ simulationRunning }),
  resetSimulation: () =>
    set((state) => ({
      simulationRunning: false,
      simulationResetSignal: state.simulationResetSignal + 1,
    })),
  setPlaybackSpeed: (playbackSpeed) => set({ playbackSpeed }),
  resetPlayback: () =>
    set({
      playbackStatus: 'idle',
      currentStepIndex: 0,
      highlightedObjectId: null,
      highlightedFormulaId: null,
      focusedNodeId: null,
      revealedNodeIds: [],
      activeQuizId: null,
      visibleMetricIds: [],
      parameterOverrides: {},
      simulationRunning: false,
    }),
  setPendingPrompt: (pendingPrompt) => set({ pendingPrompt }),
}));
