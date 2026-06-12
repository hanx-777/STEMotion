import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { cosineSimilarity, safeEmbedDocuments, safeEmbedQuery, type EmbeddingProvider } from './embeddings';
import type { KnowledgeChunk } from './knowledge_chunk_types';

interface VectorIndexRecord {
  chunkId: string;
  subject: string;
  topic: string;
  contentType: string;
  title: string;
  text: string;
  termFrequency: Record<string, number>;
  embedding?: number[];
}

interface VectorIndexData {
  subject: string;
  created_at: string;
  records: VectorIndexRecord[];
  documentFrequency: Record<string, number>;
  embeddingProvider?: string;
}

export interface VectorSearchResult {
  chunkId: string;
  score: number;
  embeddingScore: number;
}

export class VectorIndex {
  private data: VectorIndexData | null = null;

  constructor(private readonly indexPath: string) {}

  /**
   * Build vector index from KnowledgeChunks.
   */
  async build(chunks: KnowledgeChunk[], embeddingProvider?: EmbeddingProvider | null): Promise<void> {
    const embeddings = await safeEmbedDocuments(embeddingProvider ?? null, chunks.map((c) => c.text));

    const records: VectorIndexRecord[] = chunks.map((chunk, i) => ({
      chunkId: chunk.id,
      subject: chunk.subject,
      topic: chunk.topic,
      contentType: chunk.contentType,
      title: chunk.title,
      text: chunk.text,
      termFrequency: countTerms(tokenize(chunk.text)),
      ...(embeddings?.[i]?.length ? { embedding: embeddings[i] } : {}),
    }));

    const df = computeDocumentFrequency(records);

    this.data = {
      subject: chunks[0]?.subject ?? '',
      created_at: new Date().toISOString(),
      records,
      documentFrequency: df,
      embeddingProvider: embeddings ? embeddingProvider?.name : undefined,
    };

    await this.save();
  }

  /**
   * Search using TF-IDF lexical scoring.
   */
  searchLexical(query: string, topK: number): VectorSearchResult[] {
    if (!this.data) return [];
    const queryTerms = countTerms(tokenize(query));
    const queryKeys = Object.keys(queryTerms);
    if (queryKeys.length === 0) return [];

    const totalDocs = Math.max(this.data.records.length, 1);
    const scored = this.data.records.map((record) => {
      let dot = 0, queryNorm = 0, recordNorm = 0;
      for (const [term, count] of Object.entries(queryTerms)) {
        const idf = Math.log((1 + totalDocs) / (1 + (this.data!.documentFrequency[term] ?? 0))) + 1;
        const qw = count * idf;
        const rw = (record.termFrequency[term] ?? 0) * idf;
        dot += qw * rw;
        queryNorm += qw ** 2;
      }
      for (const [term, count] of Object.entries(record.termFrequency)) {
        const idf = Math.log((1 + totalDocs) / (1 + (this.data!.documentFrequency[term] ?? 0))) + 1;
        recordNorm += (count * idf) ** 2;
      }
      const cosine = queryNorm && recordNorm ? dot / (Math.sqrt(queryNorm) * Math.sqrt(recordNorm)) : 0;
      const phraseBonus = record.text.includes(query.trim()) ? 0.08 : 0;
      return { chunkId: record.chunkId, score: Math.min(1, cosine + phraseBonus), embeddingScore: 0 };
    });

    return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, topK);
  }

  /**
   * Search using embedding cosine similarity.
   */
  async searchEmbedding(query: string, topK: number, provider: EmbeddingProvider): Promise<VectorSearchResult[]> {
    if (!this.data) return [];
    const queryEmb = await safeEmbedQuery(provider, query);
    if (!queryEmb) return [];

    const scored = this.data.records
      .filter((r) => r.embedding && r.embedding.length > 0)
      .map((record) => {
        const sim = cosineSimilarity(queryEmb, record.embedding!);
        const normalized = Math.max(0, (sim + 1) / 2);
        return { chunkId: record.chunkId, score: normalized, embeddingScore: normalized };
      });

    return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, topK);
  }

  /**
   * Save index to disk.
   */
  async save(): Promise<void> {
    if (!this.data) return;
    await mkdir(dirname(this.indexPath), { recursive: true });
    await writeFile(this.indexPath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  /**
   * Load index from disk.
   */
  async load(): Promise<boolean> {
    try {
      const raw = await readFile(this.indexPath, 'utf-8');
      this.data = JSON.parse(raw) as VectorIndexData;
      return true;
    } catch {
      return false;
    }
  }

  getRecord(chunkId: string): VectorIndexRecord | undefined {
    return this.data?.records.find((r) => r.chunkId === chunkId);
  }

  get recordCount(): number {
    return this.data?.records.length ?? 0;
  }
}

function countTerms(tokens: string[]): Record<string, number> {
  return tokens.reduce<Record<string, number>>((acc, t) => { acc[t] = (acc[t] ?? 0) + 1; return acc; }, {});
}

function computeDocumentFrequency(records: VectorIndexRecord[]): Record<string, number> {
  const df: Record<string, number> = {};
  for (const record of records) {
    for (const term of Object.keys(record.termFrequency)) {
      df[term] = (df[term] ?? 0) + 1;
    }
  }
  return df;
}

/**
 * Tokenize text into terms for TF-IDF. Same logic as vector_store.ts.
 */
export function tokenize(value: string): string[] {
  const tokens: string[] = [];
  const matches = value.toLowerCase().match(/[a-z0-9]+|[一-鿿]/g) ?? [];

  for (let index = 0; index < matches.length; index++) {
    const token = matches[index];
    tokens.push(token);
    const next = matches[index + 1];
    if (isCjk(token) && next && isCjk(next)) tokens.push(`${token}${next}`);
  }

  return tokens.filter((token) => token.length > 0);
}

function isCjk(value: string): boolean {
  return /^[一-鿿]$/.test(value);
}
