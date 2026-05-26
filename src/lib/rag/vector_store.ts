import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname } from 'path';
import type { RagChunk, RetrievedChunk } from './types';

interface VectorStoreRecord {
  content: string;
  metadata: RagChunk['metadata'];
  term_frequency: Record<string, number>;
}

interface VectorStoreIndex {
  subject: string;
  created_at: string;
  records: VectorStoreRecord[];
  document_frequency: Record<string, number>;
}

export class LocalVectorStore {
  constructor(private readonly indexPath: string) {}

  async save(subject: string, chunks: RagChunk[]): Promise<void> {
    const records = chunks.map((chunk) => ({
      content: chunk.content,
      metadata: chunk.metadata,
      term_frequency: countTerms(tokenize(chunk.content)),
    }));
    const document_frequency = computeDocumentFrequency(records);
    const index: VectorStoreIndex = {
      subject,
      created_at: new Date().toISOString(),
      records,
      document_frequency,
    };

    await mkdir(dirname(this.indexPath), { recursive: true });
    await writeFile(this.indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  async search(query: string, topK: number): Promise<RetrievedChunk[]> {
    const index = await this.load();
    const queryTerms = countTerms(tokenize(query));
    const queryKeys = Object.keys(queryTerms);
    if (queryKeys.length === 0) return [];

    const scored = index.records.map((record) => ({
      content: record.content,
      metadata: {
        ...record.metadata,
        source_type: 'local' as const,
      },
      score: scoreRecord(query, queryTerms, record, index),
    }));

    return scored
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  private async load(): Promise<VectorStoreIndex> {
    return JSON.parse(await readFile(this.indexPath, 'utf-8')) as VectorStoreIndex;
  }
}

export function tokenize(value: string): string[] {
  const tokens: string[] = [];
  const matches = value.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]/g) ?? [];

  for (let index = 0; index < matches.length; index++) {
    const token = matches[index];
    tokens.push(token);
    const next = matches[index + 1];
    if (isCjk(token) && next && isCjk(next)) tokens.push(`${token}${next}`);
  }

  return tokens.filter((token) => token.length > 0);
}

function countTerms(tokens: string[]): Record<string, number> {
  return tokens.reduce<Record<string, number>>((acc, token) => {
    acc[token] = (acc[token] ?? 0) + 1;
    return acc;
  }, {});
}

function computeDocumentFrequency(records: VectorStoreRecord[]): Record<string, number> {
  const df: Record<string, number> = {};
  for (const record of records) {
    for (const term of Object.keys(record.term_frequency)) {
      df[term] = (df[term] ?? 0) + 1;
    }
  }
  return df;
}

function scoreRecord(
  rawQuery: string,
  queryTerms: Record<string, number>,
  record: VectorStoreRecord,
  index: VectorStoreIndex,
): number {
  const totalDocuments = Math.max(index.records.length, 1);
  let dot = 0;
  let queryNorm = 0;
  let recordNorm = 0;

  for (const [term, count] of Object.entries(queryTerms)) {
    const idf = Math.log((1 + totalDocuments) / (1 + (index.document_frequency[term] ?? 0))) + 1;
    const queryWeight = count * idf;
    const recordWeight = (record.term_frequency[term] ?? 0) * idf;
    dot += queryWeight * recordWeight;
    queryNorm += queryWeight ** 2;
  }

  for (const [term, count] of Object.entries(record.term_frequency)) {
    const idf = Math.log((1 + totalDocuments) / (1 + (index.document_frequency[term] ?? 0))) + 1;
    recordNorm += (count * idf) ** 2;
  }

  const cosine = queryNorm && recordNorm ? dot / (Math.sqrt(queryNorm) * Math.sqrt(recordNorm)) : 0;
  const phraseBonus = record.content.includes(rawQuery.trim()) ? 0.08 : 0;
  return Number(Math.min(1, cosine + phraseBonus).toFixed(4));
}

function isCjk(value: string): boolean {
  return /^[\u4e00-\u9fff]$/.test(value);
}
