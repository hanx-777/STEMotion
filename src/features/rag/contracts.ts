import type {
  RagAskInput,
  RagAskResult,
  Citation,
  RagEvidencePack,
  RagFinalResult,
  RagFormulaBlock,
  RagQualityReport,
  RagRetrievalReport,
  RagTaskType,
  RetrievedChunk,
  VisualizationHint,
} from '@/lib/rag/types';
import type { VisualizationSpec } from '@/lib/rag/visualization/types';

export type RagV1QualityMode = 'fast' | 'review' | 'highQuality';

export interface RagV1AskRequest {
  question?: string;
  subjectId?: string;
  taskType?: RagTaskType;
  retrieval?: {
    useWebSearch?: boolean;
  };
  quality?: {
    mode?: RagV1QualityMode;
  };
}

export interface RagV1Answer {
  protocol: RagAskResult['answer_protocol'];
  text: string;
  sections: NonNullable<RagAskResult['answer_sections']>;
  formulas: RagFormulaBlock[];
  finalResults: RagFinalResult[];
  disclaimer?: string;
}

export interface RagV1RetrievalReport {
  localCandidateCount: number;
  localReliableCount: number;
  webCount: number;
  topLocalScore: number;
  lexicalTopK: number;
  embeddingTopK: number;
  rerankTopK: number;
  evidenceThreshold: number;
  usedEmbedding: boolean;
  triggeredWebSearch: boolean;
  lowEvidence: boolean;
  rewrittenQueries: string[];
  keywords: string[];
}

export interface RagV1AskResponse {
  subject: {
    id: string;
    displayName: string;
  };
  taskType: RagTaskType;
  answer: RagV1Answer;
  citations: Citation[];
  evidence: {
    chunks: RetrievedChunk[];
    sourceSummary: RagAskResult['source_summary'];
    pack?: RagEvidencePack;
  };
  retrievalReport?: RagV1RetrievalReport;
  qualityReport?: RagQualityReport;
  visualizationHint?: VisualizationHint;
  visualizationSpec?: VisualizationSpec;
  warnings: string[];
}

export function toLegacyRagInput(input: RagV1AskRequest): RagAskInput {
  return {
    question: input.question ?? '',
    subject: input.subjectId,
    task_type: input.taskType,
    use_web_search: input.retrieval?.useWebSearch,
  };
}

export function toRagV1Response(result: RagAskResult): RagV1AskResponse {
  return {
    subject: {
      id: result.subject,
      displayName: result.subject_display_name,
    },
    taskType: result.task_type,
    answer: {
      protocol: result.answer_protocol ?? 'markdown_fallback',
      text: result.answer,
      sections: result.answer_sections ?? [],
      formulas: result.formula_blocks ?? [],
      finalResults: result.final_results ?? [],
      disclaimer: extractDisclaimer(result.answer),
    },
    citations: result.citations,
    evidence: {
      chunks: result.retrieved_chunks,
      sourceSummary: result.source_summary,
      pack: result.evidence_pack,
    },
    retrievalReport: result.retrieval_report ? toV1RetrievalReport(result.retrieval_report) : undefined,
    qualityReport: result.quality_report,
    visualizationHint: result.visualization_hint,
    visualizationSpec: result.visualization_spec,
    warnings: collectWarnings(result),
  };
}

export function toLegacyRagResult(result: RagV1AskResponse): RagAskResult {
  return {
    subject: result.subject.id,
    subject_display_name: result.subject.displayName,
    task_type: result.taskType,
    answer_protocol: result.answer.protocol,
    answer: result.answer.text,
    answer_sections: result.answer.sections,
    formula_blocks: result.answer.formulas,
    final_results: result.answer.finalResults,
    visualization_hint: result.visualizationHint,
    visualization_spec: result.visualizationSpec,
    citations: result.citations,
    retrieved_chunks: result.evidence.chunks,
    source_summary: result.evidence.sourceSummary,
    retrieval_report: result.retrievalReport ? toLegacyRetrievalReport(result.retrievalReport) : undefined,
    evidence_pack: result.evidence.pack,
    quality_report: result.qualityReport,
  };
}

export function toV1RetrievalReport(report: RagRetrievalReport): RagV1RetrievalReport {
  return {
    localCandidateCount: report.local_candidate_count,
    localReliableCount: report.local_reliable_count,
    webCount: report.web_count,
    topLocalScore: report.top_local_score,
    lexicalTopK: report.lexical_top_k,
    embeddingTopK: report.embedding_top_k,
    rerankTopK: report.rerank_top_k,
    evidenceThreshold: report.evidence_threshold,
    usedEmbedding: report.used_embedding,
    triggeredWebSearch: report.triggered_web_search,
    lowEvidence: report.low_evidence,
    rewrittenQueries: report.rewritten_queries,
    keywords: report.keywords,
  };
}

export function toLegacyRetrievalReport(report: RagV1RetrievalReport): RagRetrievalReport {
  return {
    local_candidate_count: report.localCandidateCount,
    local_reliable_count: report.localReliableCount,
    web_count: report.webCount,
    top_local_score: report.topLocalScore,
    lexical_top_k: report.lexicalTopK,
    embedding_top_k: report.embeddingTopK,
    rerank_top_k: report.rerankTopK,
    evidence_threshold: report.evidenceThreshold,
    used_embedding: report.usedEmbedding,
    triggered_web_search: report.triggeredWebSearch,
    low_evidence: report.lowEvidence,
    rewritten_queries: report.rewrittenQueries,
    keywords: report.keywords,
  };
}

function extractDisclaimer(answer: string): string | undefined {
  const marker = 'AI ';
  const index = answer.lastIndexOf(marker);
  return index >= 0 ? answer.slice(index).trim() : undefined;
}

function collectWarnings(result: RagAskResult): string[] {
  const warnings = result.quality_report?.checks
    .filter((check) => !check.passed && check.severity !== 'info')
    .map((check) => check.message) ?? [];
  if (result.retrieval_report?.low_evidence) {
    warnings.push('当前检索依据较弱，请结合教材和教师要求核验。');
  }
  return Array.from(new Set(warnings));
}
