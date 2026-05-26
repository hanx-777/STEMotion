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

export interface VisualizationHint {
  type: 'projectile_motion';
  parameters: {
    v0?: number;
    angle_deg?: number;
    g: number;
  };
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
  answer: string;
  answer_sections?: AnswerSection[];
  visualization_hint?: VisualizationHint;
  citations: Citation[];
  retrieved_chunks: RetrievedChunk[];
  source_summary: SourceSummary;
}
