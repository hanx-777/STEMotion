import type {
  AgentEvaluation,
  DeepInteractionType,
  FeedbackLoopResult,
  InteractionArtifact,
  InteractionSession,
  InteractionSessionStatus,
  JudgeDecision,
  LearningBlueprint,
  QualityReport,
  SchemaValidationSummary,
} from './types';

export interface InteractionOutline {
  title: string;
  steps: string[];
}

export type DeepInteractionStreamEvent =
  | { type: 'session_created'; session: InteractionSession; progress: number }
  | {
      type: 'progress';
      stage: InteractionSessionStatus;
      message: string;
      progress: number;
    }
  | {
      type: 'type_selected';
      interactionType: DeepInteractionType;
      message: string;
      progress: number;
    }
  | { type: 'blueprint_generated'; blueprint: LearningBlueprint; progress: number }
  | ({ type: 'subject_validated'; blueprintId: string; progress: number } & SchemaValidationSummary)
  | { type: 'template_matched'; templateId: string; title: string; score: number; reason: string; progress: number }
  | { type: 'template_customized'; templateId: string; appliedSlotCount: number; warnings: string[]; progress: number }
  | { type: 'outline_generated'; outline: InteractionOutline; progress: number }
  | { type: 'schema_generated'; schemaPreview: unknown; progress: number }
  | { type: 'validation_started'; message: string; progress: number }
  | { type: 'artifact_ready'; artifact: InteractionArtifact; progress: number }
  | {
      type: 'artifact_quality_updated';
      artifactId: string;
      qualityReport: QualityReport;
      feedbackLoop: FeedbackLoopResult;
      finalScore: number;
      changeLog: string[];
      progress: number;
    }
  | {
      type: 'error';
      message: string;
      progress: number;
      diagnostics?: { missing?: string[]; repairAttempts?: number };
    }
  // Feedback loop events
  | { type: 'feedback_started'; message: string; progress: number }
  | { type: 'feedback_iteration_started'; iteration: number; maxIterations: number; message: string; progress: number }
  | { type: 'evaluator_started'; iteration: number; agentName: string; message: string; progress: number }
  | { type: 'evaluator_completed'; iteration: number; evaluation: AgentEvaluation; progress: number }
  | { type: 'judge_decision'; iteration: number; decision: JudgeDecision; progress: number }
  | { type: 'repair_started'; iteration: number; target: string; message: string; progress: number }
  | { type: 'repair_completed'; iteration: number; changeLog: string[]; progress: number }
  | { type: 'feedback_completed'; result: FeedbackLoopResult; qualityReport: QualityReport; progress: number };
