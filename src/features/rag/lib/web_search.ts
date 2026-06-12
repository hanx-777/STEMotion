import { createLogger } from '@/lib/logger';
import type { WebSearchResult } from './types';

const log = createLogger('rag:web');

export interface WebSearchProvider {
  search(query: string, subject: string, topK: number): Promise<WebSearchResult[]>;
}

export class NoopWebSearchProvider implements WebSearchProvider {
  async search(): Promise<WebSearchResult[]> {
    return [];
  }
}

export class MockWebSearchProvider implements WebSearchProvider {
  async search(query: string, subject: string, topK: number): Promise<WebSearchResult[]> {
    return Array.from({ length: topK }, (_, index) => ({
      title: `Mock search result ${index + 1} for ${subject}`,
      url: `https://example.edu/stemotion/${encodeURIComponent(subject)}/${index + 1}`,
      snippet: `Mock web evidence for "${query}" in subject "${subject}".`,
      source_type: 'web' as const,
    }));
  }
}

export class CustomJsonWebSearchProvider implements WebSearchProvider {
  constructor(
    private readonly endpoint: string,
    private readonly apiKey?: string,
  ) {}

  async search(query: string, subject: string, topK: number): Promise<WebSearchResult[]> {
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({ query, subject, top_k: topK }),
      });

      if (!response.ok) {
        log.warn('Custom web search failed', { status: response.status });
        return [];
      }

      const data: unknown = await response.json();
      const payload = data as { results?: unknown };
      const results: unknown[] = Array.isArray(payload.results) ? payload.results : Array.isArray(data) ? data : [];
      return results.slice(0, topK).map(normalizeWebResult).filter((item): item is WebSearchResult => item !== null);
    } catch (error) {
      log.warn('Custom web search unavailable', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }
}

export function createWebSearchProvider(): WebSearchProvider {
  const provider = process.env.STEMOTION_WEB_SEARCH_PROVIDER?.trim().toLowerCase();
  if (provider === 'mock') return new MockWebSearchProvider();

  const customEndpoint = process.env.STEMOTION_WEB_SEARCH_ENDPOINT?.trim();
  if (customEndpoint) {
    return new CustomJsonWebSearchProvider(customEndpoint, process.env.STEMOTION_WEB_SEARCH_API_KEY);
  }

  return new NoopWebSearchProvider();
}

function normalizeWebResult(value: unknown): WebSearchResult | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title : '';
  const url = typeof record.url === 'string' ? record.url : '';
  const snippet = typeof record.snippet === 'string' ? record.snippet : '';
  if (!title || !url || !snippet) return null;
  return { title, url, snippet, source_type: 'web' };
}
