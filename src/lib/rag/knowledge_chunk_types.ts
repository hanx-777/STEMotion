/**
 * Structured knowledge chunk types for the refactored RAG system.
 */

export type ChunkContentType =
  | 'definition'
  | 'formula'
  | 'derivation'
  | 'example'
  | 'common_mistake'
  | 'application'
  | 'code'
  | 'summary'
  | 'mixed';

export type ChunkLevel = 'basic' | 'intermediate' | 'advanced';

export interface KnowledgeChunk {
  /** Stable ID: `{subject}.{topic}.{contentType}.{seq}` e.g. `advanced_math.derivative_basic.definition.001` */
  id: string;
  subject: string;
  /** Topic derived from source filename (without extension) */
  topic: string;
  /** Relative path from knowledge_base root, e.g. `sources/derivative_basic.md` */
  sourceFile: string;
  sourceType: 'markdown' | 'pdf' | 'json' | 'manual';
  /** Section title (heading text) */
  title: string;
  /** Hierarchical section path, e.g. `["导数", "求导法则", "复合函数求导"]` */
  sectionPath: string[];
  level: ChunkLevel;
  contentType: ChunkContentType;
  /** Extracted or annotated keywords */
  keywords: string[];
  /** Prerequisites — other topic IDs this chunk depends on */
  prerequisites: string[];
  /** The actual text content of this chunk */
  text: string;
  /** Extracted LaTeX formulas (if any) */
  formulas?: string[];
  /** Programming language for code chunks */
  codeLanguage?: string;
  /** IDs of related chunks (same topic, adjacent sections) */
  relatedChunkIds?: string[];
  /** Approximate token count (chars / 1.5 for CJK) */
  tokenCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SubjectRagConfig {
  subject: string;
  displayName: string;
  language: string;
  chunking: {
    targetTokens: number;
    maxTokens: number;
    minTokens: number;
  };
  retrieval: {
    topK: number;
    keywordWeight: number;
    vectorWeight: number;
    subjectWeight: number;
    titleBoost: number;
    contentTypeBoost: number;
  };
}

export const DEFAULT_RAG_CONFIG: Omit<SubjectRagConfig, 'subject' | 'displayName'> = {
  language: 'zh-CN',
  chunking: {
    targetTokens: 500,
    maxTokens: 900,
    minTokens: 120,
  },
  retrieval: {
    topK: 8,
    keywordWeight: 0.35,
    vectorWeight: 0.45,
    subjectWeight: 0.1,
    titleBoost: 0.05,
    contentTypeBoost: 0.05,
  },
};

/**
 * Estimate token count. CJK chars count as ~1.5 tokens, Latin words as ~1 token.
 */
export function estimateTokenCount(text: string): number {
  const cjk = (text.match(/[一-鿿]/g) ?? []).length;
  const latin = (text.match(/[a-zA-Z0-9]+/g) ?? []).length;
  return Math.round(cjk * 1.5 + latin);
}

/**
 * Generate a stable chunk ID from structured parts.
 */
export function makeChunkId(subject: string, topic: string, contentType: ChunkContentType, seq: number): string {
  return `${subject}.${topic}.${contentType}.${String(seq).padStart(3, '0')}`;
}
