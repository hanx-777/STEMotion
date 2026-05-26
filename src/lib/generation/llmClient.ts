import OpenAI from 'openai';
import { readFileSync, statSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@/lib/logger';

const log = createLogger('llm');

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmGenerateOptions {
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export class LlmTruncationError extends Error {
  constructor(
    public readonly outputTokens: number,
    public readonly maxTokens: number,
    public readonly partialContent: string,
  ) {
    super(`模型输出被截断：已生成 ${outputTokens} tokens 达到上限，内容不完整。`);
    this.name = 'LlmTruncationError';
  }
}

// --- Model Profiles ---

interface ModelProfile {
  label: string;
  provider: 'anthropic' | 'openai';
  baseURL: string;
  apiKey: string;
  model: string;
  timeout?: number;
  thinking?: { type: 'enabled'; budgetTokens: number };
}

interface ModelProfilesFile {
  activeProfile: string;
  profiles: Record<string, ModelProfile>;
}

let profilesCache: { mtime: number; data: ModelProfilesFile } | null = null;

const MODEL_PROFILES_PATH = join(process.cwd(), 'model-profiles.json');

function getActiveProfile(): ModelProfile | null {
  try {
    const stat = statSync(MODEL_PROFILES_PATH);
    const mtime = stat.mtimeMs;

    if (profilesCache && profilesCache.mtime === mtime) {
      return profilesCache.data.profiles[profilesCache.data.activeProfile] ?? null;
    }

    const raw = readFileSync(MODEL_PROFILES_PATH, 'utf-8');
    const data: ModelProfilesFile = JSON.parse(raw);
    profilesCache = { mtime, data };

    return data.profiles[data.activeProfile] ?? null;
  } catch (e) {
    log.debug('Failed to read model profiles', { error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

export function clearProfilesCache() {
  profilesCache = null;
}

// --- Generation ---

export async function generateWithConfiguredModel({
  messages,
  temperature = 0.2,
  maxTokens = 131072,
  stream = true,
}: LlmGenerateOptions): Promise<string> {
  const profile = getActiveProfile();
  if (!profile) {
    throw new Error('缺少模型配置。请在 model-profiles.json 中配置至少一个 profile。');
  }

  const { provider, baseURL, apiKey, model, timeout, thinking } = profile;

  log.debug('Using profile', { model, provider, baseURL: baseURL.replace(/\/\/.*@/, '//***@') });

  try {
    const retryOpts = { maxAttempts: 3, delayMs: 2000, shouldRetry: isRetryable };

    if (provider === 'anthropic') {
      return await withRetry(
        () => generateWithAnthropic({ baseURL, apiKey, model, timeout, messages, temperature, maxTokens, thinking, stream }),
        retryOpts,
      );
    }
    return await withRetry(
      () => generateWithOpenAI({ baseURL, apiKey, model, timeout, messages, temperature, maxTokens }),
      retryOpts,
    );
  } catch (error) {
    if (error instanceof LlmTruncationError) throw error;
    throw normalizeLlmError(error, provider);
  }
}

// --- OpenAI-compatible path ---

interface GenerateParams {
  baseURL: string;
  apiKey: string;
  model: string;
  timeout?: number;
  messages: LlmMessage[];
  temperature: number;
  maxTokens: number;
  thinking?: { type: 'enabled'; budgetTokens: number };
  stream?: boolean;
}

async function generateWithOpenAI({ baseURL, apiKey, model, timeout, messages, temperature, maxTokens }: GenerateParams): Promise<string> {
  log.info(`Request → ${baseURL}`, { model, maxTokens, provider: 'openai' });
  const startTime = Date.now();

  const client = new OpenAI({ apiKey, baseURL, timeout });

  const response = await client.chat.completions.create({
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  });

  const choice = response.choices[0];
  const message = choice?.message;
  const content = message?.content;

  if (!content) {
    const reasoning = (message as unknown as Record<string, unknown> | undefined)?.reasoning_content;
    if (reasoning) {
      throw new Error('模型仅返回了思考过程，未返回最终结果，可能是达到了最大 Token 限制。');
    }
    log.error('OpenAI model returned empty', { response: truncate(JSON.stringify(response), 500) });
    throw new Error('模型返回为空，请稍后重试。');
  }

  const finishReason = choice?.finish_reason;
  const outputTokens = response.usage?.completion_tokens ?? 0;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log.info(`Response ← 200`, { chars: content.length, elapsed: `${elapsed}s`, inputTokens: response.usage?.prompt_tokens, outputTokens, finishReason });

  if (finishReason === 'length') {
    log.warn('OpenAI output truncated', { outputTokens, maxTokens, contentChars: content.length });
    throw new LlmTruncationError(outputTokens, maxTokens, content);
  }

  return content;
}

// --- Anthropic path ---

async function generateWithAnthropic({ baseURL, apiKey, model, timeout, messages, temperature, maxTokens, thinking, stream: wantStream = true }: GenerateParams): Promise<string> {
  const controller = new AbortController();
  const timeoutId = timeout ? setTimeout(() => controller.abort(), timeout) : null;

  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');

  const anthropicMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  const useStream = wantStream && !thinking;
  const effectiveTemp = thinking ? 1 : temperature;

  try {
    const url = `${normalizeAnthropicBaseURL(baseURL)}/messages`;
    const body = JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: effectiveTemp,
      stream: useStream,
      ...(thinking ? { thinking } : {}),
      ...(system ? { system } : {}),
      messages: anthropicMessages,
    });
    log.info(`Request → ${url}`, { model, maxTokens, provider: 'anthropic', stream: useStream, thinking: !!thinking });
    const startTime = Date.now();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey,
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      log.error(`Response ← ${response.status}`, { elapsed: `${elapsed}s`, error: truncate(errorText, 300) });
      throw new Error(`Anthropic API 请求失败 (${response.status}): ${errorText}`);
    }

    let content: string;
    let stopReason: string | null;
    let inputTokens = 0;
    let outputTokens = 0;

    if (!useStream) {
      // Non-streaming path
      const data = await response.json();
      stopReason = data.stop_reason ?? null;
      inputTokens = data.usage?.input_tokens ?? 0;
      outputTokens = data.usage?.output_tokens ?? 0;

      const textBlocks = (data.content || []).filter((b: { type: string }) => b.type === 'text');
      content = textBlocks.map((b: { text: string }) => b.text).join('');
    } else {
      // Streaming path
      content = '';
      stopReason = null;

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Response body is not readable');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const eventBlocks = buffer.split('\n\n');
        buffer = eventBlocks.pop() ?? '';

        for (const block of eventBlocks) {
          const lines = block.split('\n');
          let payload = '';
          let inData = false;

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              if (inData) payload += '\n';
              payload += line.slice(6);
              inData = true;
            } else if (line.startsWith('data:')) {
              if (inData) payload += '\n';
              payload += line.slice(5);
              inData = true;
            } else if (line.startsWith('event:') || line.startsWith('id:') || line.startsWith('retry:') || line === '') {
              // SSE metadata fields, skip
            } else if (inData) {
              payload += '\n' + line;
            }
          }

          payload = payload.trim();
          if (!payload || payload === '[DONE]') continue;

          let event: Record<string, unknown>;
          try {
            event = JSON.parse(payload);
          } catch {
            const textMatch = payload.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
            if (textMatch && payload.includes('text_delta')) {
              try {
                content += JSON.parse(`"${textMatch[1]}"`);
              } catch {
                content += textMatch[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
              }
            }
            continue;
          }

          const eventType = event.type as string;

          if (eventType === 'content_block_delta') {
            const delta = event.delta as Record<string, unknown> | undefined;
            if (delta?.type === 'text_delta') {
              content += delta.text as string;
            }
            // Skip thinking_delta — only collect text content
          } else if (eventType === 'message_delta') {
            const delta = event.delta as Record<string, unknown> | undefined;
            stopReason = (delta?.stop_reason as string) ?? null;
            const usage = event.usage as Record<string, number> | undefined;
            if (usage?.output_tokens) outputTokens = usage.output_tokens;
          } else if (eventType === 'message_start') {
            const message = event.message as Record<string, unknown> | undefined;
            const usage = message?.usage as Record<string, number> | undefined;
            if (usage?.input_tokens) inputTokens = usage.input_tokens;
          }
        }
      }
    }

    content = content.trim();

    if (!content) {
      log.error('Anthropic returned no text content');
      throw new Error('模型返回为空，请稍后重试。');
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log.info(`Response ← 200${useStream ? ' (stream)' : ''}`, { chars: content.length, elapsed: `${elapsed}s`, inputTokens, outputTokens, stopReason });

    if (stopReason === 'max_tokens') {
      log.warn('Anthropic output truncated', { outputTokens, maxTokens, contentChars: content.length });
      throw new LlmTruncationError(outputTokens, maxTokens, content);
    }

    return content;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

// --- Helpers ---

function normalizeLlmError(error: unknown, provider: string): Error {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new Error(`[${provider}] 模型请求超时，请稍后重试或降低生成复杂度。`);
  }

  if (error instanceof Error) {
    const msg = error.message;
    log.error(`${provider} error`, msg);
    if (/fetch failed|ECONNRESET|ENOTFOUND|ETIMEDOUT|network/i.test(msg)) {
      return new Error(`[${provider}] 网络请求失败: ${msg}`);
    }
    return new Error(`[${provider}] ${msg}`);
  }

  return new Error(`[${provider}] 未知错误: ${String(error)}`);
}

function normalizeAnthropicBaseURL(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) + '...' : value;
}

interface RetryOptions {
  maxAttempts: number;
  delayMs: number;
  shouldRetry: (error: unknown) => boolean;
}

async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === opts.maxAttempts || !opts.shouldRetry(error)) throw error;
      const delay = opts.delayMs * attempt;
      log.warn(`LLM call attempt ${attempt}/${opts.maxAttempts} failed, retrying in ${delay}ms`, {
        error: error instanceof Error ? error.message : String(error),
      });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

function isRetryable(error: unknown): boolean {
  if (error instanceof LlmTruncationError) return false;
  const msg = error instanceof Error ? error.message : String(error);
  return /timeout|ECONNRESET|ETIMEDOUT|5\d\d|网络|超时|fetch failed|failed to fetch/i.test(msg);
}

