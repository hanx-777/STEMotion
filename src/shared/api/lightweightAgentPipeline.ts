export type GenerationMode = 'fast' | 'balanced' | 'highQuality';

export type PlannerOutput = {
  taskType: string;
  coreGoal: string;
  outputForm: 'answer' | 'artifact' | 'answer_with_artifact' | 'code' | 'other';
  keyLogic: string[];
  structure: string[];
  needsSpecialist: boolean;
  specialistReason?: string;
};

export type LightweightReview = {
  status: 'pass' | 'revise' | 'fail';
  score: number;
  mustFix: Array<{
    area: 'logic' | 'citation' | 'runtime' | 'ui' | 'ux' | 'safety' | 'other';
    severity: 'critical' | 'high' | 'medium';
    problem: string;
    fix: string;
  }>;
  niceToHave: string[];
  finalDecision: 'publish' | 'revise_once' | 'reject';
};

export type FinalQualityDecision = {
  answerPassed: boolean;
  artifactPassed?: boolean;
  overallPassed: boolean;
  decision: 'publish' | 'revise_once' | 'reject';
  blockingReasons: string[];
};
