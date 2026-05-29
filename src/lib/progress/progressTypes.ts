export type ProgressStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'completed'
  | 'skipped'
  | 'warning'
  | 'error';

export interface ProgressStage {
  id: string;
  title: string;
  description: string;
  status: ProgressStatus;
  startedAt?: number;
  completedAt?: number;
  detail?: string;
}

export interface ProgressModel {
  mode: 'rag' | 'deep_interaction';
  currentStageId?: string;
  stages: ProgressStage[];
  message: string;
  isIndeterminate?: boolean;
  elapsed?: number;
  summary?: Record<string, string | number>;
}
