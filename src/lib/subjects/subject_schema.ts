export interface SubjectRetrievalConfig {
  top_k: number;
  score_threshold: number;
  enable_web_search: boolean;
  web_top_k: number;
  lexical_top_k?: number;
  embedding_top_k?: number;
  rerank_top_k?: number;
  evidence_threshold?: number;
  enable_embedding?: boolean;
}

export interface SubjectSkillConfig {
  name: string;
  display_name: string;
  description: string;
  default_language: string;
  knowledge_base_path: string;
  system_prompt_path: string;
  answer_template_path: string;
  retrieval: SubjectRetrievalConfig;
  tools: string[];
  answer_requirements: string[];
}

export interface SubjectInfo {
  name: string;
  display_name: string;
  description: string;
  default_language: string;
  retrieval: SubjectRetrievalConfig;
  tools: string[];
  answer_requirements: string[];
  knowledge_status?: {
    file_count: number;
    chunk_count: number;
    indexed: boolean;
    manifest_updated_at?: string;
  };
}

export interface SubjectDefinition extends SubjectInfo {
  skill_dir: string;
  knowledge_base_path: string;
  system_prompt_path: string;
  answer_template_path: string;
  system_prompt: string;
  answer_template: string;
}
