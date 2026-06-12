import { createHash } from 'node:crypto';

export const DEFAULT_GENERATION_CACHE_TTL_MS = 10 * 60 * 1000;
export const DEFAULT_GENERATION_PROMPT_VERSION = 'generation-cache-v1';

export interface GenerationCacheOptions {
  ttlMs?: number;
  now?: () => number;
}

export interface GenerationCache<T> {
  get: (key: string) => T | undefined;
  set: (key: string, value: T) => void;
  clear: () => void;
  size: () => number;
}

export interface GenerationCacheKeyParts {
  provider: string;
  model: string;
  preset: string;
  promptVersion: string;
  inputHash: string;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export function createGenerationCache<T>(options: GenerationCacheOptions = {}): GenerationCache<T> {
  const ttlMs = options.ttlMs ?? DEFAULT_GENERATION_CACHE_TTL_MS;
  const now = options.now ?? Date.now;
  const entries = new Map<string, CacheEntry<T>>();

  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      entries.set(key, { value, expiresAt: now() + ttlMs });
    },
    clear() {
      entries.clear();
    },
    size() {
      return entries.size;
    },
  };
}

export function stableGenerationCacheKey(parts: GenerationCacheKeyParts): string {
  return [
    'stemotion-generation',
    parts.provider,
    parts.model,
    parts.preset,
    parts.promptVersion,
    parts.inputHash,
  ].join(':');
}

export function hashGenerationInput(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex').slice(0, 24);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}
