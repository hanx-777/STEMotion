import type { LlmGenerateOptions } from '@/lib/generation/llmClient';
import type {
  AnswerSection,
  Citation,
  RagAnswerProtocol,
  RagEvidencePack,
  RagQualityReport,
  RagTaskType,
  RagFinalResult,
  RagFormulaBlock,
  RagRetrievalReport,
  RetrievedChunk,
  VisualizationHint,
} from '../types';

export type RagMultiAgentMode = 'off' | 'review' | 'review_and_revise' | 'high_quality';

export type RagAgentGenerator = (options: LlmGenerateOptions) => Promise<string>;

export interface RagMultiAgentContext {
  question: string;
  subject: string;
  subjectDisplayName: string;
  taskType: RagTaskType;
  answer: string;
  answerSections: AnswerSection[];
  answerProtocol: RagAnswerProtocol;
  formulaBlocks: RagFormulaBlock[];
  finalResults: RagFinalResult[];
  citations: Citation[];
  retrievedChunks: RetrievedChunk[];
  visualizationHint?: VisualizationHint;
  retrievalReport: RagRetrievalReport;
  evidencePack: RagEvidencePack;
  deterministicReport: RagQualityReport;
}

export interface RagMultiAgentOptions {
  mode?: RagMultiAgentMode;
  reviewGenerator: RagAgentGenerator;
  revisionGenerator: RagAgentGenerator;
  finalizeAnswer?: (answer: string) => string;
  rebuildAnswerSections: (answer: string) => AnswerSection[];
  rerunDeterministicReview: (answer: string, answerSections: AnswerSection[]) => RagQualityReport;
}

export interface RagMultiAgentResult {
  answer: string;
  answerSections: AnswerSection[];
  answerProtocol: RagAnswerProtocol;
  formulaBlocks: RagFormulaBlock[];
  finalResults: RagFinalResult[];
  qualityReport: RagQualityReport;
}
