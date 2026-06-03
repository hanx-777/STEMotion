import { createLogger } from '@/lib/logger';

const log = createLogger('rag:embeddings');

export interface EmbeddingProvider {
  readonly name: string;
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(texts: string[]): Promise<number[][]>;
}

export class HashEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'hash';

  constructor(private readonly dimensions = 256) {}

  async embedQuery(text: string): Promise<number[]> {
    return hashEmbed(text, this.dimensions);
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return texts.map((text) => hashEmbed(text, this.dimensions));
  }
}

export class OpenAICompatibleEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai-compatible';

  constructor(
    private readonly config: {
      baseURL: string;
      apiKey: string;
      model: string;
      timeout?: number;
    },
  ) {}

  async embedQuery(text: string): Promise<number[]> {
    const [embedding] = await this.embedDocuments([text]);
    return embedding ?? [];
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const controller = new AbortController();
    const timeoutId = this.config.timeout ? setTimeout(() => controller.abort(), this.config.timeout) : null;
    try {
      const response = await fetch(`${this.config.baseURL.replace(/\/+$/, '')}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          input: texts,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => response.statusText);
        throw new Error(`Embedding request failed (${response.status}): ${detail}`);
      }
      const data = await response.json() as { data?: Array<{ embedding?: number[] }> };
      return (data.data ?? []).map((item) => Array.isArray(item.embedding) ? item.embedding : []);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
}

export function createEmbeddingProviderFromEnv(): EmbeddingProvider | null {
  const provider = process.env.STEMOTION_RAG_EMBEDDING_PROVIDER?.trim().toLowerCase();
  if (provider === 'hash') return new HashEmbeddingProvider();

  const apiKey = process.env.STEMOTION_RAG_EMBEDDING_API_KEY?.trim();
  if (!apiKey) return null;
  const baseURL = process.env.STEMOTION_RAG_EMBEDDING_BASE_URL?.trim() || 'https://api.openai.com/v1';
  const model = process.env.STEMOTION_RAG_EMBEDDING_MODEL?.trim() || 'text-embedding-3-small';
  const timeout = Number(process.env.STEMOTION_RAG_EMBEDDING_TIMEOUT_MS ?? 60000);

  return new OpenAICompatibleEmbeddingProvider({
    baseURL,
    apiKey,
    model,
    timeout: Number.isFinite(timeout) ? timeout : 60000,
  });
}

export async function safeEmbedDocuments(
  provider: EmbeddingProvider | null,
  texts: string[],
): Promise<number[][] | null> {
  if (!provider || texts.length === 0) return null;
  try {
    return await provider.embedDocuments(texts);
  } catch (error) {
    log.warn('Embedding document generation failed; continuing with lexical index', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function safeEmbedQuery(provider: EmbeddingProvider | null, text: string): Promise<number[] | null> {
  if (!provider) return null;
  try {
    const embedding = await provider.embedQuery(text);
    return embedding.length > 0 ? embedding : null;
  } catch (error) {
    log.warn('Embedding query generation failed; continuing with lexical search', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < length; index++) {
    dot += a[index] * b[index];
    normA += a[index] ** 2;
    normB += b[index] ** 2;
  }
  return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
}

function hashEmbed(text: string, dimensions: number): number[] {
  const vector = Array.from({ length: dimensions }, () => 0);
  const tokens = text.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]/g) ?? [];
  for (const token of tokens) {
    const hash = hashString(token);
    const index = Math.abs(hash) % dimensions;
    vector[index] += hash >= 0 ? 1 : -1;
  }
  const norm = Math.sqrt(vector.reduce((total, value) => total + value ** 2, 0));
  return norm ? vector.map((value) => Number((value / norm).toFixed(6))) : vector;
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return hash;
}
