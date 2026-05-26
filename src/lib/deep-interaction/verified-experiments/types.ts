import type {
  AppliedTemplateSlot,
  DeepInteractionType,
  LearningBlueprint,
  SubjectDomain,
} from '../types';
import type { InteractionAction } from '../actions/actionTypes';

export type EditableSlotType =
  | 'difficulty'
  | 'grade_level'
  | 'parameter_range'
  | 'visual_style'
  | 'teacher_questions'
  | 'quiz'
  | 'scaffolding'
  | 'layout'
  | 'language'
  | 'animation_speed';

export interface EditableSlot {
  key: string;
  label: string;
  type: EditableSlotType;
  description: string;
  defaultValue?: unknown;
  allowedValues?: string[];
  constraints?: string;
}

export interface TemplateQualityBaseline {
  subjectCorrectness: number;
  interactionCompleteness: number;
  accessibilityBaseline?: string[];
  knownLimitations?: string[];
  manuallyReviewed: boolean;
}

export interface VerifiedExperimentTemplate {
  id: string;
  title: string;
  description: string;
  subjectDomain: SubjectDomain;
  topic: string;
  aliases: string[];
  gradeRange: [number, number];
  interactionType: DeepInteractionType;
  blueprint: LearningBlueprint;
  schemaKey?: string;
  html: string;
  teacherActions?: InteractionAction[];
  editableSlots: EditableSlot[];
  protectedConstraints: string[];
  qualityBaseline: TemplateQualityBaseline;
  version: string;
  sourceType: 'original';
  licenseNote: string;
}

export interface TemplateMatchResult {
  template: VerifiedExperimentTemplate;
  score: number;
  matchedAlias: string;
  reason: string;
}

export type { AppliedTemplateSlot };
