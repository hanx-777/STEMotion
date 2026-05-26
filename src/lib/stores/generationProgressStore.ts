import { create } from 'zustand';
import type { InteractionOutline } from '@/lib/deep-interaction/events';
import type {
  FeedbackIteration,
  InteractionSessionStatus,
  LearningBlueprint,
  QualityReport,
  SchemaValidationSummary,
} from '@/lib/deep-interaction/types';

export interface GenerationLogItem {
  id: string;
  stage:
    | InteractionSessionStatus
    | 'type_selected'
    | 'blueprint'
    | 'subject_validation'
    | 'template'
    | 'outline_generated'
    | 'schema_generated'
    | 'artifact_ready'
    | 'feedback'
    | 'evaluation'
    | 'repair';
  message: string;
  progress: number;
  createdAt: string;
}

interface GenerationProgressState {
  active: boolean;
  currentStage: string;
  progress: number;
  logs: GenerationLogItem[];
  outline: InteractionOutline | null;
  schemaPreview: unknown | null;
  blueprint: LearningBlueprint | null;
  schemaValidation: SchemaValidationSummary | null;
  error: string | null;
  // Feedback loop state
  feedbackIterations: FeedbackIteration[];
  qualityReport: QualityReport | null;
  currentIteration: number;
  start: () => void;
  addLog: (item: Omit<GenerationLogItem, 'id' | 'createdAt'>) => void;
  setOutline: (outline: InteractionOutline) => void;
  setSchemaPreview: (preview: unknown) => void;
  setBlueprint: (blueprint: LearningBlueprint) => void;
  setSchemaValidation: (summary: SchemaValidationSummary) => void;
  setProgress: (progress: number, stage?: string) => void;
  addFeedbackIteration: (iteration: FeedbackIteration) => void;
  setQualityReport: (report: QualityReport) => void;
  setCurrentIteration: (iteration: number) => void;
  complete: () => void;
  fail: (message: string) => void;
  reset: () => void;
}

export const useGenerationProgressStore = create<GenerationProgressState>((set) => ({
  active: false,
  currentStage: 'idle',
  progress: 0,
  logs: [],
  outline: null,
  schemaPreview: null,
  blueprint: null,
  schemaValidation: null,
  error: null,
  feedbackIterations: [],
  qualityReport: null,
  currentIteration: 0,

  start: () => set({
    active: true,
    currentStage: 'planning',
    progress: 0,
    logs: [],
    outline: null,
    schemaPreview: null,
    blueprint: null,
    schemaValidation: null,
    error: null,
    feedbackIterations: [],
    qualityReport: null,
    currentIteration: 0,
  }),

  addLog: (item) =>
    set((state) => ({
      logs: [
        ...state.logs,
        {
          ...item,
          id: `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
          createdAt: new Date().toISOString(),
        },
      ],
      currentStage: item.stage,
      progress: item.progress,
    })),

  setOutline: (outline) => set({ outline }),
  setSchemaPreview: (schemaPreview) => set({ schemaPreview }),
  setBlueprint: (blueprint) => set({ blueprint }),
  setSchemaValidation: (schemaValidation) => set({ schemaValidation }),
  setProgress: (progress, stage) => set({ progress, ...(stage ? { currentStage: stage } : {}) }),
  addFeedbackIteration: (iteration) => set((state) => ({ feedbackIterations: [...state.feedbackIterations, iteration] })),
  setQualityReport: (qualityReport) => set({ qualityReport }),
  setCurrentIteration: (currentIteration) => set({ currentIteration }),
  complete: () => set({ active: false, currentStage: 'ready', progress: 100 }),
  fail: (error) => set({ active: false, currentStage: 'failed', progress: 100, error }),
  reset: () => set({
    active: false,
    currentStage: 'idle',
    progress: 0,
    logs: [],
    outline: null,
    schemaPreview: null,
    blueprint: null,
    schemaValidation: null,
    error: null,
    feedbackIterations: [],
    qualityReport: null,
    currentIteration: 0,
  }),
}));
