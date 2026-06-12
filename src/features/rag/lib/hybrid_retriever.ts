import { readFile } from 'fs/promises';
import { join } from 'path';
import type { KnowledgeChunk } from './knowledge_chunk_types';
import { KeywordIndex } from './keyword_index';
import { VectorIndex } from './vector_index';
import { createEmbeddingProviderFromEnv } from './embeddings';
import type { EmbeddingProvider } from './embeddings';

export interface RetrievalResult {
  chunk: KnowledgeChunk;
  score: number;
  keywordScore: number;
  vectorScore: number;
  titleBoost: number;
  contentTypeBoost: number;
  retrievalMethod: 'keyword' | 'vector' | 'hybrid';
}

export interface HybridRetrieverOptions {
  topK?: number;
  keywordWeight?: number;
  vectorWeight?: number;
  titleBoost?: number;
  contentTypeBoost?: number;
  embeddingProvider?: EmbeddingProvider | null;
}

const DEFAULT_WEIGHTS = {
  topK: 8,
  keywordWeight: 0.35,
  vectorWeight: 0.45,
  titleBoost: 0.05,
  contentTypeBoost: 0.05,
};

export class HybridRetriever {
  private keywordIndex: KeywordIndex;
  private vectorIndex: VectorIndex;
  private chunks: Map<string, KnowledgeChunk> = new Map();
  private loaded = false;

  constructor(
    private readonly knowledgeBasePath: string,
    private readonly subject: string,
  ) {
    const indexDir = join(knowledgeBasePath, 'index');
    this.keywordIndex = new KeywordIndex(join(indexDir, 'keyword.json'));
    this.vectorIndex = new VectorIndex(join(indexDir, 'vector.json'));
  }

  /**
   * Load chunks and indexes from disk.
   */
  async load(): Promise<boolean> {
    if (this.loaded) return true;

    // Load chunks from chunks.jsonl
    const jsonlPath = join(this.knowledgeBasePath, 'processed', 'chunks.jsonl');
    try {
      const raw = await readFile(jsonlPath, 'utf-8');
      const lines = raw.split('\n').filter((l) => l.trim());
      for (const line of lines) {
        const chunk = JSON.parse(line) as KnowledgeChunk;
        this.chunks.set(chunk.id, chunk);
      }
    } catch {
      return false;
    }

    // Load indexes
    const kwLoaded = await this.keywordIndex.load();
    const vecLoaded = await this.vectorIndex.load();

    this.loaded = kwLoaded || vecLoaded;
    return this.loaded;
  }

  /**
   * Retrieve chunks using hybrid keyword + vector search with reranking.
   */
  async retrieve(
    query: string,
    options: HybridRetrieverOptions = {},
  ): Promise<RetrievalResult[]> {
    const opts = { ...DEFAULT_WEIGHTS, ...options };

    if (!this.loaded) {
      const ok = await this.load();
      if (!ok) return [];
    }

    // Keyword search (MiniSearch) with TF-IDF fallback
    const kwResults = this.keywordIndex.search(query, opts.topK * 2);
    const kwMap = new Map<string, number>();

    if (kwResults.length > 0) {
      const maxKwScore = Math.max(...kwResults.map((r) => r.score), 1);
      for (const r of kwResults) {
        kwMap.set(r.chunkId, r.score / maxKwScore); // normalize to [0,1]
      }
    } else {
      // Fallback: use vector index's TF-IDF search for keyword matching
      const tfidfResults = this.vectorIndex.searchLexical(query, opts.topK * 2);
      for (const r of tfidfResults) {
        kwMap.set(r.chunkId, r.score); // TF-IDF scores are already in [0,1]
      }
    }

    // Vector search
    const embeddingProvider = options.embeddingProvider ?? createEmbeddingProviderFromEnv();
    const vecResults = embeddingProvider
      ? await this.vectorIndex.searchEmbedding(query, opts.topK * 2, embeddingProvider)
      : [];
    const vecMap = new Map<string, number>();
    for (const r of vecResults) {
      vecMap.set(r.chunkId, r.score);
    }

    // Merge candidates
    const candidateIds = new Set([...kwMap.keys(), ...vecMap.keys()]);
    const results: RetrievalResult[] = [];

    for (const chunkId of candidateIds) {
      const chunk = this.chunks.get(chunkId);
      if (!chunk) continue;

      const kwScore = kwMap.get(chunkId) ?? 0;
      const vecScore = vecMap.get(chunkId) ?? 0;

      // Title boost: if query terms appear in the chunk title
      const titleBoost = computeTitleBoost(query, chunk.title);

      // Content type boost based on query intent
      const contentTypeBoost = computeContentTypeBoost(query, chunk.contentType);

      // Determine retrieval method
      const hasKw = kwScore > 0;
      const hasVec = vecScore > 0;
      const method: RetrievalResult['retrievalMethod'] = hasKw && hasVec ? 'hybrid' : hasVec ? 'vector' : 'keyword';

      // Weighted score
      let score = Math.min(1,
        opts.keywordWeight * kwScore +
        opts.vectorWeight * vecScore +
        opts.titleBoost * titleBoost +
        opts.contentTypeBoost * contentTypeBoost
      );

      // Normalize score to match old pipeline range (roughly [0.15, 0.5] for typical results)
      // This ensures backward compatibility with existing score_threshold values
      if (score > 0 && score < 0.5) {
        score = Math.min(1, score * 2.5);
      }

      results.push({
        chunk,
        score: Number(score.toFixed(4)),
        keywordScore: kwScore,
        vectorScore: vecScore,
        titleBoost,
        contentTypeBoost,
        retrievalMethod: method,
      });
    }

    // Sort by score descending, return top K
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.topK);
  }
}

/**
 * Boost if query terms appear in the title.
 */
function computeTitleBoost(query: string, title: string): number {
  const queryTerms = query.toLowerCase().match(/[一-鿿]{2,}|[a-z0-9]+/g) ?? [];
  const titleLower = title.toLowerCase();
  let matches = 0;
  for (const term of queryTerms) {
    if (titleLower.includes(term)) matches++;
  }
  return queryTerms.length > 0 ? matches / queryTerms.length : 0;
}

/**
 * Boost content type based on query intent signals.
 */
function computeContentTypeBoost(query: string, contentType: string): number {
  const q = query.toLowerCase();

  if (/公式|formula|表达式|怎么算|计算/.test(q) && contentType === 'formula') return 1;
  if (/什么是|定义|definition|概念|meaning|指的是/.test(q) && contentType === 'definition') return 1;
  if (/推导|证明|为什么|how.*derive|proof|过程/.test(q) && contentType === 'derivation') return 1;
  if (/例题|example|怎么做|sample|练习|举个/.test(q) && contentType === 'example') return 1;
  if (/代码|code|怎么写|实现|implement|c\+\+|编程/.test(q) && contentType === 'code') return 1;
  if (/错误|误区|易错|mistake|error|注意/.test(q) && contentType === 'common_mistake') return 1;

  return 0;
}
