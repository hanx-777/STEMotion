import { AsyncLocalStorage } from 'node:async_hooks';

export type GenerationTraceJobType =
  | 'rag_ask_stream'
  | 'rag_visualization'
  | 'rag_session_generation'
  | 'artifact_quality_review'
  | 'deep_interaction';

export interface GenerationTraceEntry {
  timestamp: string;
  jobId: string;
  runId?: string;
  jobType: GenerationTraceJobType;
  event: string;
  stage?: string;
  elapsedMs: number;
  summary?: unknown;
  diagnostics?: unknown;
}

export interface GenerationTraceInput {
  event: string;
  stage?: string;
  summary?: unknown;
  diagnostics?: unknown;
}

export interface GenerationTraceContext {
  jobId: string;
  runId?: string;
  jobType: GenerationTraceJobType;
  startedAtMs: number;
  write: (entry: GenerationTraceEntry) => void | Promise<void>;
}

const traceContext = new AsyncLocalStorage<GenerationTraceContext>();
const SECRET_KEY_PATTERN = /(api[_-]?key|secret|token|password|cookie|authorization)/i;
const PROMPT_KEY_PATTERN = /^(prompt|question|answerText|currentHtml|html|systemPrompt|developerPrompt)$/i;
const PRIVATE_TEXT_PATTERN = /(SECRET|PRIVATE|API[_-]?KEY|TOKEN|PASSWORD|COOKIE|AUTHORIZATION)/i;
const MAX_STRING_LENGTH = 180;
const MAX_ARRAY_LENGTH = 24;
const MAX_OBJECT_KEYS = 32;
const MAX_DEPTH = 5;

export async function runWithGenerationTraceContext<T>(
  context: GenerationTraceContext,
  run: () => Promise<T>,
): Promise<T> {
  return traceContext.run(context, run);
}

export function getGenerationTraceContext(): GenerationTraceContext | undefined {
  return traceContext.getStore();
}

export function recordGenerationTrace(input: GenerationTraceInput): void {
  void recordGenerationTraceAsync(input);
}

export async function recordGenerationTraceAsync(input: GenerationTraceInput): Promise<void> {
  const context = traceContext.getStore();
  if (!context) return;

  const entry: GenerationTraceEntry = {
    timestamp: new Date().toISOString(),
    jobId: context.jobId,
    ...(context.runId ? { runId: context.runId } : {}),
    jobType: context.jobType,
    event: input.event,
    elapsedMs: Math.max(0, Date.now() - context.startedAtMs),
    ...(input.stage ? { stage: input.stage } : {}),
    ...(input.summary !== undefined ? { summary: sanitizeTraceValue(input.summary) } : {}),
    ...(input.diagnostics !== undefined ? { diagnostics: sanitizeTraceValue(input.diagnostics) } : {}),
  };

  await context.write(entry);
}

export function sanitizeTraceValue(value: unknown, key = 'value', depth = 0): unknown {
  if (SECRET_KEY_PATTERN.test(key)) return '[redacted]';
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    if (PROMPT_KEY_PATTERN.test(key)) return summarizePromptLikeString(key, value);
    return sanitizeString(value);
  }

  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return `[array(${value.length})]`;
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((item, index) => sanitizeTraceValue(item, `${key}_${index}`, depth + 1));
  }

  if (typeof value === 'object') {
    if (depth >= MAX_DEPTH) return '[object]';
    const result: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
      result[childKey] = sanitizeTraceValue(childValue, childKey, depth + 1);
    }
    return result;
  }

  return sanitizeString(String(value));
}

function summarizePromptLikeString(key: string, value: string): Record<string, unknown> {
  return {
    [`${key}Preview`]: safeSnippet(value, key === 'html' || key === 'currentHtml' ? 80 : 120),
    [`${key}Length`]: value.length,
  };
}

function sanitizeString(value: string): string {
  const redacted = redactPrivateMarkers(value);
  if (redacted.length <= MAX_STRING_LENGTH) return redacted;
  return `${redacted.slice(0, MAX_STRING_LENGTH)}...`;
}

function safeSnippet(value: string, max: number): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  if (/<script|<html|<body/i.test(compact)) return '[html omitted]';
  return sanitizeString(compact.slice(0, max));
}

function redactPrivateMarkers(value: string): string {
  if (!PRIVATE_TEXT_PATTERN.test(value)) return value;
  return value
    .replace(/SECRET[A-Z0-9_:-]*/gi, '[redacted]')
    .replace(/PRIVATE[A-Z0-9_:-]*/gi, '[redacted]')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/token\s*[:=]\s*["']?[^"',\s]+/gi, 'token=[redacted]');
}
