import { create } from 'zustand';
import type { ExperimentConfig } from '../schema/experiment';

interface ExperimentState {
  config: ExperimentConfig | null;
  parameters: Record<string, number | boolean | string>;
  simulationActive: boolean;
  time: number;
  
  // Actions
  loadExperiment: (config: ExperimentConfig) => void;
  setParameter: (id: string, value: number | boolean | string) => void;
  setParameters: (parameters: Record<string, number | boolean | string>) => void;
  setSimulationActive: (active: boolean) => void;
  tickTime: (delta: number) => void;
  resetSimulation: () => void;
}

export const useExperimentStore = create<ExperimentState>((set) => ({
  config: null,
  parameters: {},
  simulationActive: false,
  time: 0,

  loadExperiment: (config) => {
    const initialParams: Record<string, number | boolean | string> = {};
    
    // Defensive checks for AI-generated structural integrity
    if (config && Array.isArray(config.parameters)) {
      config.parameters.forEach(p => {
        if (p && p.id) {
          initialParams[p.id] = p.defaultValue;
        }
      });
    }
    
    set({ 
      config, 
      parameters: initialParams,
      simulationActive: false,
      time: 0
    });
  },

  setParameter: (id, value) => set((state) => ({
    parameters: { ...state.parameters, [id]: value }
  })),

  setParameters: (parameters) => set((state) => ({
    parameters: { ...state.parameters, ...parameters }
  })),

  setSimulationActive: (active) => set({ simulationActive: active }),
  
  tickTime: (delta) => set((state) => ({
    time: Math.min(state.time + delta, state.config?.simulation.durationSeconds ?? 12)
  })),
  
  resetSimulation: () => set({ time: 0, simulationActive: false })
}));
