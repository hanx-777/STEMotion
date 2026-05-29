// Re-export structured chunk types for convenience
export type { KnowledgeChunk, ChunkContentType, ChunkLevel, SubjectRagConfig } from './knowledge_chunk_types';
export type { VisualizationSpec, VisualizationType, VisualizationDecision } from './visualization/types';

export interface RagDocumentMetadata {
  source: string;
  subject: string;
  file_name: string;
  page?: number;
  chunk_id?: string;
  created_at: string;
}

export interface RagDocument {
  content: string;
  metadata: RagDocumentMetadata;
}

export interface RagChunk {
  content: string;
  metadata: RagDocumentMetadata & { chunk_id: string };
}

export interface RetrievedChunk {
  content: string;
  score: number;
  metadata: RagDocumentMetadata & {
    chunk_id: string;
    source_type?: 'local' | 'web';
    title?: string;
    url?: string;
    snippet?: string;
    retrieval_method?: 'lexical' | 'embedding' | 'hybrid' | 'web';
    lexical_score?: number;
    embedding_score?: number;
    normalized_score?: number;
  };
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source_type: 'web';
}

export type Citation =
  | {
      source_type: 'local';
      source: string;
      page?: number;
      chunk_id: string;
      subject: string;
      file_name: string;
    }
  | {
      source_type: 'web';
      title: string;
      url: string;
      snippet: string;
    };

export interface SourceSummary {
  local_count: number;
  web_count: number;
}

export type RagTaskType = 'knowledge_qa' | 'step_solution' | 'misconception_diagnosis' | 'teacher_prep';

export interface AnswerSection {
  id: string;
  title: string;
  content: string;
}

export type RagAnswerProtocol = 'json' | 'markdown_fallback';

export interface RagFormulaBlock {
  id: string;
  label?: string;
  latex: string;
  explanation?: string;
  citation_refs?: string[];
}

export interface RagFinalResult {
  label: string;
  value: string;
  unit?: string;
  citation_refs?: string[];
}

export interface RagAnswerEnvelope {
  sections: AnswerSection[];
  formula_blocks?: RagFormulaBlock[];
  citation_refs?: string[];
  final_results?: RagFinalResult[];
  pitfalls?: string[];
  visualization_hint?: VisualizationHint;
  disclaimer?: string;
}

export interface RagRetrievalReport {
  local_candidate_count: number;
  local_reliable_count: number;
  web_count: number;
  top_local_score: number;
  lexical_top_k: number;
  embedding_top_k: number;
  rerank_top_k: number;
  evidence_threshold: number;
  used_embedding: boolean;
  triggered_web_search: boolean;
  low_evidence: boolean;
  rewritten_queries: string[];
  keywords: string[];
}

export interface RagEvidenceBlock {
  ref: string;
  source_type: 'local' | 'web';
  source: string;
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface RagEvidencePack {
  subject: string;
  question: string;
  task_type: RagTaskType;
  no_evidence: boolean;
  local_blocks: RagEvidenceBlock[];
  web_blocks: RagEvidenceBlock[];
  guidance: string;
}

export interface VisualizationHint {
  type: 'projectile_motion';
  parameters: {
    v0?: number;
    angle_deg?: number;
    g: number;
  };
}

export type RagQualitySeverity = 'info' | 'warning' | 'error' | 'critical';
export type RagQualityDecision = 'accept' | 'accept_with_warnings' | 'revise' | 'reject';

export interface RagQualityCheck {
  name: string;
  passed: boolean;
  message: string;
  severity: RagQualitySeverity;
}

export interface RagQualityReport {
  passed: boolean;
  score: number;
  checks: RagQualityCheck[];
  decision?: RagQualityDecision;
  agent_reviews?: RagAgentReview[];
  revision_trace?: RagRevisionTrace[];
}

export interface RagAgentIssue {
  severity: RagQualitySeverity;
  message: string;
  suggestion?: string;
}

export interface RagAgentReview {
  agent_name: string;
  score: number;
  passed: boolean;
  summary: string;
  issues: RagAgentIssue[];
}

export interface RagRevisionTrace {
  round: number;
  reason: string;
  applied: boolean;
  changes: string[];
}

export interface RagAskInput {
  question: string;
  subject?: string;
  use_web_search?: boolean;
  task_type?: RagTaskType;
}

export interface RagAskResult {
  subject: string;
  subject_display_name: string;
  task_type: RagTaskType;
  answer_protocol?: RagAnswerProtocol;
  answer: string;
  answer_sections?: AnswerSection[];
  formula_blocks?: RagFormulaBlock[];
  final_results?: RagFinalResult[];
  visualization_hint?: VisualizationHint;
  visualization_spec?: import('./visualization/types').VisualizationSpec;
  citations: Citation[];
  retrieved_chunks: RetrievedChunk[];
  source_summary: SourceSummary;
  retrieval_report?: RagRetrievalReport;
  evidence_pack?: RagEvidencePack;
  quality_report?: RagQualityReport;
}
