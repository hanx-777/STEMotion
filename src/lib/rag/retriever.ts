import { join } from 'path';
import { readFile, writeFile } from 'fs/promises';
import { getVectorStoreDir } from '@/lib/config/settings';
import { SubjectManager } from '@/lib/subjects/subject_manager';
import { loadDocumentsFromKnowledgeBase } from './document_loader';
import { splitDocuments } from './text_splitter';
import { createEmbeddingProviderFromEnv } from './embeddings';
import type { RagQueryPlan } from './query_planner';
import { LocalVectorStore } from './vector_store';
import type { RagRetrievalReport, RetrievedChunk } from './types';
import { HybridRetriever } from './hybrid_retriever';
import { buildContextBlocks, type ContextBlock } from './context_builder';
import { planRagQuery } from './query_planner';

export interface IngestResult {
  subject: string;
  document_count: number;
  chunk_count: number;
  index_path: string;
  manifest_path: string;
}

export interface KnowledgeBaseManifest {
  subject: string;
  file_count: number;
  chunk_count: number;
  indexed: boolean;
  manifest_updated_at: string;
  index_path: string;
  embedding_provider?: string;
}

export async function ingestSubjectKnowledge(subjectName: string, manager = new SubjectManager()): Promise<IngestResult> {
  const subject = await manager.getSubject(await manager.validateSubject(subjectName));
  const documents = await loadDocumentsFromKnowledgeBase(subject.name, subject.knowledge_base_path);
  const chunks = splitDocuments(documents);
  const indexPath = getSubjectIndexPath(subject.name);
  const embeddingProvider = subject.retrieval.enable_embedding ? createEmbeddingProviderFromEnv() : null;
  await new LocalVectorStore(indexPath).save(subject.name, chunks, { embeddingProvider });
  const manifestPath = getSubjectManifestPath(subject.name);
  await writeKnowledgeManifest(manifestPath, {
    subject: subject.name,
    file_count: documents.length,
    chunk_count: chunks.length,
    indexed: true,
    manifest_updated_at: new Date().toISOString(),
    index_path: indexPath,
    embedding_provider: embeddingProvider?.name,
  });

  return {
    subject: subject.name,
    document_count: documents.length,
    chunk_count: chunks.length,
    index_path: indexPath,
    manifest_path: manifestPath,
  };
}

export async function retrieveLocalChunks(
  query: string,
  subjectName: string,
  manager = new SubjectManager(),
): Promise<RetrievedChunk[]> {
  const subject = await manager.getSubject(await manager.validateSubject(subjectName));
  const indexPath = getSubjectIndexPath(subject.name);
  const store = new LocalVectorStore(indexPath);

  try {
    return await store.search(query, subject.retrieval.top_k);
  } catch {
    await ingestSubjectKnowledge(subject.name, manager);
    return store.search(query, subject.retrieval.top_k);
  }
}

export async function retrieveHybridChunks(
  plan: RagQueryPlan,
  subjectName: string,
  manager = new SubjectManager(),
): Promise<{ chunks: RetrievedChunk[]; report: RagRetrievalReport }> {
  const subject = await manager.getSubject(await manager.validateSubject(subjectName));
  const indexPath = getSubjectIndexPath(subject.name);
  const store = new LocalVectorStore(indexPath);
  const embeddingProvider = subject.retrieval.enable_embedding ? createEmbeddingProviderFromEnv() : null;
  const lexicalTopK = subject.retrieval.lexical_top_k ?? subject.retrieval.top_k;
  const embeddingTopK = subject.retrieval.embedding_top_k ?? subject.retrieval.top_k;
  const rerankTopK = subject.retrieval.rerank_top_k ?? subject.retrieval.top_k;
  const evidenceThreshold = subject.retrieval.evidence_threshold ?? subject.retrieval.score_threshold;

  try {
    const chunks = await searchAcrossQueries(store, plan.rewritten_queries, {
      lexicalTopK,
      embeddingTopK,
      rerankTopK,
      embeddingProvider,
    });
    return {
      chunks,
      report: buildRetrievalReport({
        chunks,
        lexicalTopK,
        embeddingTopK,
        rerankTopK,
        evidenceThreshold,
        usedEmbedding: chunks.some((chunk) => (chunk.metadata.embedding_score ?? 0) > 0),
        plan,
      }),
    };
  } catch {
    await ingestSubjectKnowledge(subject.name, manager);
    const chunks = await searchAcrossQueries(store, plan.rewritten_queries, {
      lexicalTopK,
      embeddingTopK,
      rerankTopK,
      embeddingProvider,
    });
    return {
      chunks,
      report: buildRetrievalReport({
        chunks,
        lexicalTopK,
        embeddingTopK,
        rerankTopK,
        evidenceThreshold,
        usedEmbedding: chunks.some((chunk) => (chunk.metadata.embedding_score ?? 0) > 0),
        plan,
      }),
    };
  }
}

function getSubjectIndexPath(subject: string): string {
  return join(getVectorStoreDir(), `${subject}.json`);
}

export function getSubjectManifestPath(subject: string): string {
  return join(getVectorStoreDir(), `${subject}.manifest.json`);
}

export async function readKnowledgeManifest(subject: string): Promise<KnowledgeBaseManifest> {
  try {
    return JSON.parse(await readFile(getSubjectManifestPath(subject), 'utf-8')) as KnowledgeBaseManifest;
  } catch {
    return {
      subject,
      file_count: 0,
      chunk_count: 0,
      indexed: false,
      manifest_updated_at: '',
      index_path: getSubjectIndexPath(subject),
      embedding_provider: undefined,
    };
  }
}

async function writeKnowledgeManifest(path: string, manifest: KnowledgeBaseManifest): Promise<void> {
  await writeFile(path, JSON.stringify(manifest, null, 2), 'utf-8');
}

async function searchAcrossQueries(
  store: LocalVectorStore,
  queries: string[],
  options: {
    lexicalTopK: number;
    embeddingTopK: number;
    rerankTopK: number;
    embeddingProvider: ReturnType<typeof createEmbeddingProviderFromEnv> | null;
  },
): Promise<RetrievedChunk[]> {
  const merged = new Map<string, RetrievedChunk>();
  for (const query of queries.length > 0 ? queries : ['']) {
    if (!query.trim()) continue;
    const chunks = await store.searchHybrid(query, options);
    for (const chunk of chunks) {
      const key = chunk.metadata.chunk_id;
      const existing = merged.get(key);
      if (!existing || chunk.score > existing.score) {
        merged.set(key, chunk);
      }
    }
  }
  return [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, options.rerankTopK);
}

function buildRetrievalReport({
  chunks,
  lexicalTopK,
  embeddingTopK,
  rerankTopK,
  evidenceThreshold,
  usedEmbedding,
  plan,
}: {
  chunks: RetrievedChunk[];
  lexicalTopK: number;
  embeddingTopK: number;
  rerankTopK: number;
  evidenceThreshold: number;
  usedEmbedding: boolean;
  plan: RagQueryPlan;
}): RagRetrievalReport {
  const topLocalScore = chunks[0]?.score ?? 0;
  const reliableCount = chunks.filter((chunk) => chunk.score >= evidenceThreshold).length;
  return {
    local_candidate_count: chunks.length,
    local_reliable_count: reliableCount,
    web_count: 0,
    top_local_score: topLocalScore,
    lexical_top_k: lexicalTopK,
    embedding_top_k: embeddingTopK,
    rerank_top_k: rerankTopK,
    evidence_threshold: evidenceThreshold,
    used_embedding: usedEmbedding,
    triggered_web_search: false,
    low_evidence: reliableCount === 0,
    rewritten_queries: plan.rewritten_queries,
    keywords: plan.keywords,
  };
}

/**
 * New retrieval path using HybridRetriever with processed chunks.
 * Falls back to old path if processed chunks don't exist.
 */
export async function retrieveWithNewPipeline(
  question: string,
  subjectName: string,
  manager = new SubjectManager(),
  options: { topK?: number } = {},
): Promise<{ contextBlocks: ContextBlock[]; chunks: RetrievedChunk[] }> {
  const subject = await manager.getSubject(await manager.validateSubject(subjectName));
  const kbPath = subject.knowledge_base_path;
  const retriever = new HybridRetriever(kbPath, subject.name);

  const loaded = await retriever.load();
  if (!loaded) {
    // Fallback to old pipeline
    const plan = planRagQuery(question, 'knowledge_qa');
    const { chunks } = await retrieveHybridChunks(plan, subjectName, manager);
    return { contextBlocks: [], chunks };
  }

  const results = await retriever.retrieve(question, { topK: options.topK ?? subject.retrieval.top_k });
  const contextBlocks = buildContextBlocks(results);

  // Convert to RetrievedChunk format for backward compat
  const methodMap: Record<string, 'lexical' | 'embedding' | 'hybrid'> = {
    keyword: 'lexical',
    vector: 'embedding',
    hybrid: 'hybrid',
  };
  const chunks: RetrievedChunk[] = results.map((r) => ({
    content: r.chunk.text,
    score: r.score,
    metadata: {
      source: r.chunk.sourceFile,
      subject: r.chunk.subject,
      file_name: r.chunk.sourceFile.split('/').pop() ?? '',
      created_at: r.chunk.createdAt,
      chunk_id: r.chunk.id,
      source_type: 'local' as const,
      title: r.chunk.title,
      retrieval_method: methodMap[r.retrievalMethod] ?? 'lexical',
      lexical_score: r.keywordScore,
      embedding_score: r.vectorScore,
      normalized_score: r.score,
    },
  }));

  return { contextBlocks, chunks };
}
