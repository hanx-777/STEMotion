import OpenAI from 'openai';
import { readFileSync, statSync } from 'fs';
import { createLogger } from '@/lib/logger';
import {
  getModelProfilesPath,
  resolveModelProfileForRole,
  type LlmProfileRole,
  type ModelProfile,
  type ModelProfilesFile,
} from './modelProfiles';
import {
  buildAnthropicMessagesRequest,
  buildOpenAIChatRequest,
  resolveLlmRequestConfig,
  resolveLlmRequestPolicy,
  type LlmRequestConfig,
  type LlmRequestLogContext,
  type LlmRequestMessage,
  type LlmRequestPolicy,
  type LlmRequestPolicyReason,
  type LlmRequestPreset,
  type LlmThinkingMode,
  type SafeLlmLogPayload,
} from './llmRequestBuilder';
import {
  DEFAULT_GENERATION_PROMPT_VERSION,
  createGenerationCache,
  hashGenerationInput,
  stableGenerationCacheKey,
} from './generationCache';
import { recordGenerationTrace } from './trace';

const log = createLogger('llm');

export type LlmMessage = LlmRequestMessage;

export interface LlmGenerateOptions {
  messages: LlmMessage[];
  temperature?: number;
  requestPreset?: LlmRequestPreset;
  profileRole?: LlmProfileRole;
  metadata?: Record<string, unknown> & {
    cache?: boolean;
    promptVersion?: string;
    stage?: string;
  };
  signal?: AbortSignal;
  onTextDelta?: (delta: string) => void;
}

const llmResponseCache = createGenerationCache<string>();

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

let profilesCache: { mtime: number; data: ModelProfilesFile } | null = null;

function getActiveProfile(profileRole: LlmProfileRole): { id: string; role: LlmProfileRole; profile: ModelProfile; usedOverride: boolean } | null {
  try {
    const profilesPath = getModelProfilesPath();
    const stat = statSync(profilesPath);
    const mtime = stat.mtimeMs;

    if (profilesCache && profilesCache.mtime === mtime) {
      return resolveModelProfileForRole(profilesCache.data, profileRole);
    }

    const raw = readFileSync(profilesPath, 'utf-8');
    const data: ModelProfilesFile = JSON.parse(raw);
    profilesCache = { mtime, data };

    return resolveModelProfileForRole(data, profileRole);
  } catch (e) {
    log.debug('Failed to read model profiles', { error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

interface AnthropicTextDiagnostics {
  eventTypes: string[];
  contentBlockTypes: string[];
  payloadShape: string[];
}

interface LlmEmptyTextDiagnostics extends AnthropicTextDiagnostics {
  requestStage: string;
  fallbackStage: string | null;
  stream: boolean;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
}

class LlmEmptyTextError extends Error {
  constructor(public readonly diagnostics: LlmEmptyTextDiagnostics) {
    super('模型返回为空，请稍后重试。');
    this.name = 'LlmEmptyTextError';
  }
}

export function clearProfilesCache() {
  profilesCache = null;
}

// --- Generation ---

export async function generateWithConfiguredModel({
  messages,
  temperature = 0.2,
  requestPreset = 'default',
  profileRole = profileRoleForPreset(requestPreset),
  metadata,
  signal,
  onTextDelta,
}: LlmGenerateOptions): Promise<string> {
  throwIfAborted(signal);
  const resolvedProfile = getActiveProfile(profileRole);
  if (!resolvedProfile) {
    throw new Error('缺少模型配置。请在 model-profiles.json 中配置至少一个 profile。');
  }

  const { id: profileId, role: resolvedProfileRole, profile } = resolvedProfile;
  const { provider, baseURL, apiKey, model, timeout } = profile;
  const requestConfig = resolveLlmRequestConfig(requestPreset);
  const thinkingMode = resolveThinkingModeFromEnv(process.env.STEMOTION_LLM_THINKING);
  const requestPolicy = resolveLlmRequestPolicy({
    provider,
    baseURL,
    model,
    config: requestConfig,
    temperature,
    thinkingMode,
  });
  const cacheKey = stableGenerationCacheKey({
    provider,
    model,
    preset: requestPreset,
    promptVersion: metadata?.promptVersion ?? DEFAULT_GENERATION_PROMPT_VERSION,
    inputHash: hashGenerationInput({
      profileRole: resolvedProfileRole,
      profileId,
      messages,
      temperature: requestPolicy.temperature,
      requestConfig: requestPolicy.config,
      thinkingMode: requestPolicy.thinkingMode,
      policyReason: requestPolicy.policyReason,
    }),
  });
  const useCache = metadata?.cache !== false;

  if (useCache) {
    const cached = llmResponseCache.get(cacheKey);
    if (cached !== undefined) {
      log.info('LLM cache hit', {
        profileRole: resolvedProfileRole,
        profileId,
        model,
        provider,
        requestPreset,
        stage: metadata?.stage,
        chars: cached.length,
      });
      log.info('LLM telemetry', {
        stage: metadata?.stage ?? null,
        preset: requestPreset,
        profileRole: resolvedProfileRole,
        profileId,
        provider,
        model,
        elapsedMs: 0,
        maxTokens: requestPolicy.config.maxTokens,
        stream: requestPolicy.config.stream,
        thinking: requestPolicy.config.thinking,
        temperature: requestPolicy.temperature,
        policyReason: requestPolicy.policyReason,
        outputTokens: null,
        visibleCharsPerOutputToken: null,
        fallbackStage: null,
        retryCount: 0,
        cacheHit: true,
        chars: cached.length,
      });
      onTextDelta?.(cached);
      return cached;
    }
  }

  log.debug('Using profile', { model, provider, baseURL: baseURL.replace(/\/\/.*@/, '//***@') });

  try {
    let retryCount = 0;
    const telemetry: LlmTelemetryContext = {
      stage: metadata?.stage,
      preset: requestPreset,
      profileRole: resolvedProfileRole,
      profileId,
      getRetryCount: () => retryCount,
    };
    const retryOpts = {
      maxAttempts: 3,
      delayMs: 2000,
      shouldRetry: isRetryable,
      onRetry: () => {
        retryCount += 1;
      },
    };
    let content: string;

    if (provider === 'anthropic') {
      content = await withRetry(
        () => generateWithAnthropic({
          baseURL,
          apiKey,
          model,
          timeout,
          messages,
          temperature,
          config: requestPolicy.config,
          policy: requestPolicy,
          signal,
          onTextDelta,
          telemetry,
        }),
        retryOpts,
      );
    } else {
      content = await withRetry(
        () => generateWithOpenAI({ baseURL, apiKey, model, timeout, messages, temperature, config: requestConfig, signal, onTextDelta, telemetry }),
        retryOpts,
      );
    }

    if (useCache && !signal?.aborted) {
      llmResponseCache.set(cacheKey, content);
    }

    return content;
  } catch (error) {
    if (error instanceof LlmTruncationError) throw error;
    if (signal?.aborted) throw new Error('已取消');
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
  config: LlmRequestConfig;
  policy?: LlmRequestPolicy;
  signal?: AbortSignal;
  onTextDelta?: (delta: string) => void;
  telemetry: LlmTelemetryContext;
}

interface LlmTelemetryContext {
  stage?: string;
  preset: LlmRequestPreset;
  profileRole: LlmProfileRole;
  profileId: string;
  getRetryCount: () => number;
}

async function generateWithOpenAI({ baseURL, apiKey, model, timeout, messages, temperature, config, signal, onTextDelta, telemetry }: GenerateParams): Promise<string> {
  throwIfAborted(signal);
  const request = buildOpenAIChatRequest({ model, messages, temperature, config, requestPreset: telemetry.preset });
  const logPayload = withProfileLogPayload(request.logPayload, telemetry);
  log.info(`Request → ${baseURL}`, logPayload);
  recordGenerationTrace({
    event: 'llm_request',
    stage: telemetry.stage,
    summary: logPayload,
  });
  const startTime = Date.now();

  const client = new OpenAI({ apiKey, baseURL, timeout });

  const response = await client.chat.completions.create(request.body, signal ? { signal } : undefined);

  const choice = response.choices[0];
  const message = choice?.message;
  const content = message?.content;

  if (!content) {
    const reasoning = (message as unknown as Record<string, unknown> | undefined)?.reasoning_content;
    if (reasoning) {
      recordGenerationTrace({
        event: 'llm_error',
        stage: telemetry.stage,
        summary: {
          requestPreset: logPayload.requestPreset,
          profileRole: logPayload.profileRole,
          profileId: logPayload.profileId,
          chars: 0,
          finishReason: choice?.finish_reason,
        },
        diagnostics: {
          reason: 'reasoning_without_final_content',
        },
      });
      throw new Error('模型仅返回了思考过程，未返回最终结果，可能是达到了最大 Token 限制。');
    }
    log.error('OpenAI model returned empty', { response: truncate(JSON.stringify(response), 500) });
    recordGenerationTrace({
      event: 'llm_empty_text',
      stage: telemetry.stage,
      summary: {
        requestPreset: logPayload.requestPreset,
        profileRole: logPayload.profileRole,
        profileId: logPayload.profileId,
        stream: logPayload.stream,
        thinking: logPayload.thinking,
        temperature: logPayload.temperature,
        maxTokens: logPayload.maxTokens,
        finishReason: choice?.finish_reason,
      },
      diagnostics: {
        payloadShape: ['choices:array', response.usage ? 'usage:object' : 'usage:undefined'],
      },
    });
    throw new Error('模型返回为空，请稍后重试。');
  }

  const finishReason = choice?.finish_reason;
  const outputTokens = response.usage?.completion_tokens ?? 0;
  const elapsedMs = Date.now() - startTime;
  const elapsed = (elapsedMs / 1000).toFixed(1);
  log.info(`Response ← 200`, { chars: content.length, elapsed: `${elapsed}s`, inputTokens: response.usage?.prompt_tokens, outputTokens, finishReason });
  recordGenerationTrace({
    event: 'llm_response',
    stage: telemetry.stage,
    summary: {
      status: 200,
      elapsedMs,
      chars: content.length,
      inputTokens: response.usage?.prompt_tokens ?? null,
      outputTokens,
      stopReason: finishReason ?? null,
      requestPreset: logPayload.requestPreset,
      profileRole: logPayload.profileRole,
      profileId: logPayload.profileId,
      stream: logPayload.stream,
      thinking: logPayload.thinking,
      temperature: logPayload.temperature,
      maxTokens: logPayload.maxTokens,
    },
    diagnostics: {
      payloadShape: ['choices:array', response.usage ? 'usage:object' : 'usage:undefined'],
    },
  });
  logLlmTelemetry({
    telemetry,
    logPayload,
    elapsedMs,
    chars: content.length,
    inputTokens: response.usage?.prompt_tokens ?? null,
    outputTokens,
    stopReason: finishReason ?? null,
  });

  if (finishReason === 'length') {
    log.warn('OpenAI output truncated', { outputTokens, maxTokens: request.body.max_tokens, contentChars: content.length });
    throw new LlmTruncationError(outputTokens, request.body.max_tokens, content);
  }

  onTextDelta?.(content);
  return content;
}

// --- Anthropic path ---

async function generateWithAnthropic({ baseURL, apiKey, model, timeout, messages, temperature, config, policy, signal, onTextDelta, telemetry }: GenerateParams): Promise<string> {
  throwIfAborted(signal);
  try {
    return await requestWithConfig(config, { requestStage: 'initial' });
  } catch (error) {
    if (config.thinking && isThinkingUnsupportedError(error)) {
      const msg = error instanceof Error ? error.message : String(error);
      log.warn('Thinking request failed, retrying through centralized adapter without thinking', { error: msg });
      recordGenerationTrace({
        event: 'llm_fallback',
        stage: telemetry.stage,
        summary: {
          fallbackStage: 'thinking',
          reason: 'thinking_fallback',
          error: msg,
        },
      });
      return await requestWithConfig(
        { ...config, stream: false, thinking: false },
        { requestStage: 'thinking_fallback', reason: 'thinking_fallback', fallbackStage: 'thinking' },
      );
    }
    throw error;
  }

  async function requestWithConfig(nextConfig: LlmRequestConfig, logContext: LlmRequestLogContext): Promise<string> {
    if (nextConfig.stream) {
      try {
        return await doRequest(nextConfig, logContext);
      } catch (streamError) {
        const msg = streamError instanceof Error ? streamError.message : String(streamError);
        if (isLlmEmptyTextError(streamError)) {
          log.warn('Streaming response contained no text, retrying without streaming through centralized adapter', { error: msg });
          recordGenerationTrace({
            event: 'llm_fallback',
            stage: telemetry.stage,
            summary: {
              fallbackStage: 'empty_text',
              reason: 'empty_text_fallback',
              error: msg,
            },
            diagnostics: streamError.diagnostics,
          });
          return await doRequest(
            { ...nextConfig, stream: false },
            { requestStage: 'empty_text_fallback', reason: 'empty_text_fallback', fallbackStage: 'empty_text' },
          );
        }
        if (isStreamFallbackError(streamError)) {
          log.warn('Stream failed, falling back to non-streaming through centralized adapter', { error: msg });
          recordGenerationTrace({
            event: 'llm_fallback',
            stage: telemetry.stage,
            summary: {
              fallbackStage: 'stream',
              reason: 'stream_fallback',
              error: msg,
            },
          });
          return await doRequest(
            { ...nextConfig, stream: false },
            { requestStage: 'stream_fallback', reason: 'stream_fallback', fallbackStage: 'stream' },
          );
        }
        throw streamError;
      }
    }

    return await doRequest({ ...nextConfig, stream: false }, logContext);
  }

  async function doRequest(nextConfig: LlmRequestConfig, logContext: LlmRequestLogContext): Promise<string> {
    const controller = new AbortController();
    const unlinkAbort = linkAbortSignal(signal, controller);
    const timeoutId = timeout ? setTimeout(() => controller.abort(), timeout) : null;

    try {
      throwIfAborted(signal);
      const url = `${normalizeAnthropicBaseURL(baseURL)}/messages`;
      const requestPolicy = policy ? policyForRequest(policy, nextConfig, temperature, logContext) : undefined;
      const request = buildAnthropicMessagesRequest({
        model,
        messages,
        temperature,
        config: nextConfig,
        policy: requestPolicy,
        requestPreset: telemetry.preset,
        logContext,
      });
      const logPayload = withProfileLogPayload(request.logPayload, telemetry);
      const body = JSON.stringify(request.body);
      log.info(`Request → ${url}`, logPayload);
      recordGenerationTrace({
        event: 'llm_request',
        stage: telemetry.stage,
        summary: logPayload,
      });
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
        recordGenerationTrace({
          event: 'llm_error',
          stage: telemetry.stage,
          summary: {
            status: response.status,
            elapsedMs: Date.now() - startTime,
            requestStage: logPayload.requestStage,
            requestPreset: logPayload.requestPreset,
            profileRole: logPayload.profileRole,
            profileId: logPayload.profileId,
            fallbackStage: logPayload.fallbackStage,
          },
          diagnostics: {
            error: truncate(errorText, 300),
          },
        });
        throw new Error(`Anthropic API 请求失败 (${response.status}): ${errorText}`);
      }

      let content: string;
      let stopReason: string | null;
      let inputTokens = 0;
      let outputTokens = 0;

      const diagnostics = createAnthropicTextDiagnostics();

      if (!request.body.stream) {
        // Non-streaming path
        const data = await response.json();
        const extraction = extractTextFromAnthropicCompatiblePayload(data);
        mergeAnthropicTextDiagnostics(diagnostics, extraction.diagnostics);
        stopReason = extraction.stopReason ?? null;
        inputTokens = extraction.inputTokens ?? 0;
        outputTokens = extraction.outputTokens ?? 0;
        content = extraction.text;
        if (content) onTextDelta?.(content);
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
              const looseText = extractLooseTextFromMalformedPayload(payload);
              if (looseText) {
                content += looseText;
                onTextDelta?.(looseText);
              }
              continue;
            }

            const extraction = extractTextFromAnthropicCompatiblePayload(event);
            mergeAnthropicTextDiagnostics(diagnostics, extraction.diagnostics);
            if (extraction.text) {
              content += extraction.text;
              onTextDelta?.(extraction.text);
            }
            stopReason = extraction.stopReason ?? stopReason;
            inputTokens = extraction.inputTokens ?? inputTokens;
            outputTokens = extraction.outputTokens ?? outputTokens;
          }
        }
      }

      content = content.trim();

      if (!content) {
        const emptyDiagnostics = createLlmEmptyTextDiagnostics({
          logContext,
          stream: Boolean(request.body.stream),
          stopReason,
          inputTokens,
          outputTokens,
          diagnostics,
        });
        log.error('Anthropic returned no text content', emptyDiagnostics);
        recordGenerationTrace({
          event: 'llm_empty_text',
          stage: telemetry.stage,
          summary: {
            requestStage: logPayload.requestStage,
            requestPreset: logPayload.requestPreset,
            profileRole: logPayload.profileRole,
            profileId: logPayload.profileId,
            fallbackStage: logPayload.fallbackStage,
            stream: logPayload.stream,
            thinking: logPayload.thinking,
            temperature: logPayload.temperature,
            maxTokens: logPayload.maxTokens,
            policyReason: logPayload.policyReason,
            inputTokens,
            outputTokens,
            stopReason,
          },
          diagnostics: emptyDiagnostics,
        });
        throw new LlmEmptyTextError(emptyDiagnostics);
      }

      const elapsedMs = Date.now() - startTime;
      const elapsed = (elapsedMs / 1000).toFixed(1);
      log.info(`Response ← 200${request.body.stream ? ' (stream)' : ''}`, { chars: content.length, elapsed: `${elapsed}s`, inputTokens, outputTokens, stopReason });
      recordGenerationTrace({
        event: 'llm_response',
        stage: telemetry.stage,
        summary: {
          status: 200,
          elapsedMs,
          chars: content.length,
          inputTokens,
          outputTokens,
          stopReason,
          requestStage: logPayload.requestStage,
          requestPreset: logPayload.requestPreset,
          profileRole: logPayload.profileRole,
          profileId: logPayload.profileId,
          fallbackStage: logPayload.fallbackStage,
          stream: logPayload.stream,
          thinking: logPayload.thinking,
          temperature: logPayload.temperature,
          maxTokens: logPayload.maxTokens,
          policyReason: logPayload.policyReason,
        },
        diagnostics,
      });
      logLlmTelemetry({
        telemetry,
        logPayload,
        elapsedMs,
        chars: content.length,
        inputTokens,
        outputTokens,
        stopReason,
      });

      if (stopReason === 'max_tokens') {
        log.warn('Anthropic output truncated', { outputTokens, maxTokens: request.body.max_tokens, contentChars: content.length });
        throw new LlmTruncationError(outputTokens, request.body.max_tokens, content);
      }

      return content;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      unlinkAbort();
    }
  }
}

// --- Helpers ---

function profileRoleForPreset(preset: LlmRequestPreset): LlmProfileRole {
  if (preset === 'artifact' || preset === 'repair') return 'artifact';
  if (preset === 'reviewer') return 'reviewer';
  return 'answer';
}

function withProfileLogPayload(payload: SafeLlmLogPayload, telemetry: LlmTelemetryContext): SafeLlmLogPayload {
  return {
    ...payload,
    profileRole: telemetry.profileRole,
    profileId: telemetry.profileId,
  };
}

interface AnthropicCompatibleTextExtraction {
  text: string;
  stopReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  diagnostics: AnthropicTextDiagnostics;
}

export function extractTextFromAnthropicCompatiblePayload(payload: unknown): AnthropicCompatibleTextExtraction {
  const diagnostics = createAnthropicTextDiagnostics();
  const textParts: string[] = [];
  let stopReason: string | null = null;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  mergePayloadShape(diagnostics, payload);
  const record = asRecord(payload);
  if (!record) {
    if (typeof payload === 'string') addText(textParts, payload);
    return { text: textParts.join(''), stopReason, inputTokens, outputTokens, diagnostics };
  }

  const eventType = asString(record.type);
  if (eventType) addUnique(diagnostics.eventTypes, eventType);

  const usage = asRecord(record.usage);
  inputTokens = readTokenCount(usage, 'input_tokens') ?? readTokenCount(usage, 'prompt_tokens') ?? inputTokens;
  outputTokens = readTokenCount(usage, 'output_tokens') ?? readTokenCount(usage, 'completion_tokens') ?? outputTokens;

  const message = asRecord(record.message);
  const messageUsage = asRecord(message?.usage);
  inputTokens = readTokenCount(messageUsage, 'input_tokens') ?? readTokenCount(messageUsage, 'prompt_tokens') ?? inputTokens;
  outputTokens = readTokenCount(messageUsage, 'output_tokens') ?? readTokenCount(messageUsage, 'completion_tokens') ?? outputTokens;

  const delta = asRecord(record.delta);
  const deltaType = asString(delta?.type);
  if (deltaType) addUnique(diagnostics.contentBlockTypes, deltaType);
  if (deltaType === 'text_delta') {
    addText(textParts, asString(delta?.text));
  }
  stopReason = asString(delta?.stop_reason) ?? asString(record.stop_reason) ?? stopReason;

  const contentBlock = asRecord(record.content_block);
  const contentBlockType = asString(contentBlock?.type);
  if (contentBlockType) addUnique(diagnostics.contentBlockTypes, contentBlockType);
  if (contentBlockType === 'text' || (!contentBlockType && contentBlock)) {
    collectContentText(contentBlock, textParts, diagnostics);
  }

  collectContentText(record.content, textParts, diagnostics);
  addText(textParts, asString(record.text));
  addText(textParts, asString(record.completion));

  const choices = asArray(record.choices);
  for (const choiceValue of choices) {
    const choice = asRecord(choiceValue);
    if (!choice) continue;
    const choiceDelta = asRecord(choice.delta);
    const choiceMessage = asRecord(choice.message);
    addText(textParts, asString(choiceDelta?.content));
    addText(textParts, asString(choiceMessage?.content));
    addText(textParts, asString(choice.text));
    stopReason = asString(choice.finish_reason) ?? stopReason;
  }

  return {
    text: textParts.join(''),
    stopReason,
    inputTokens,
    outputTokens,
    diagnostics,
  };
}

function collectContentText(
  value: unknown,
  textParts: string[],
  diagnostics: AnthropicTextDiagnostics,
): void {
  if (typeof value === 'string') {
    addText(textParts, value);
    return;
  }

  const array = asArray(value);
  if (array.length > 0) {
    for (const item of array) collectContentText(item, textParts, diagnostics);
    return;
  }

  const record = asRecord(value);
  if (!record) return;
  const type = asString(record.type);
  if (type) addUnique(diagnostics.contentBlockTypes, type);
  if (type && type !== 'text') return;
  addText(textParts, asString(record.text));
  collectContentText(record.content, textParts, diagnostics);
}

function createAnthropicTextDiagnostics(): AnthropicTextDiagnostics {
  return {
    eventTypes: [],
    contentBlockTypes: [],
    payloadShape: [],
  };
}

function mergeAnthropicTextDiagnostics(
  target: AnthropicTextDiagnostics,
  source: AnthropicTextDiagnostics,
): void {
  for (const value of source.eventTypes) addUnique(target.eventTypes, value);
  for (const value of source.contentBlockTypes) addUnique(target.contentBlockTypes, value);
  for (const value of source.payloadShape) addUnique(target.payloadShape, value);
}

function createLlmEmptyTextDiagnostics(input: {
  logContext: LlmRequestLogContext;
  stream: boolean;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
  diagnostics: AnthropicTextDiagnostics;
}): LlmEmptyTextDiagnostics {
  return {
    requestStage: input.logContext.requestStage ?? 'initial',
    fallbackStage: input.logContext.fallbackStage ?? null,
    stream: input.stream,
    stopReason: input.stopReason,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    eventTypes: input.diagnostics.eventTypes,
    contentBlockTypes: input.diagnostics.contentBlockTypes,
    payloadShape: input.diagnostics.payloadShape,
  };
}

function mergePayloadShape(diagnostics: AnthropicTextDiagnostics, payload: unknown): void {
  const record = asRecord(payload);
  if (!record) {
    addUnique(diagnostics.payloadShape, typeof payload);
    return;
  }

  const entries = Object.entries(record).slice(0, 10);
  for (const [key, value] of entries) {
    addUnique(diagnostics.payloadShape, `${key}:${valueShape(value)}`);
  }
}

function valueShape(value: unknown): string {
  if (Array.isArray(value)) return `array(${value.length})`;
  if (value === null) return 'null';
  return typeof value;
}

function addText(parts: string[], value: string | undefined): void {
  if (!value) return;
  parts.push(value);
}

function addUnique(values: string[], value: string): void {
  if (!value || values.includes(value) || values.length >= 16) return;
  values.push(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readTokenCount(record: Record<string, unknown> | null | undefined, key: string): number | null {
  const value = record?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function extractLooseTextFromMalformedPayload(payload: string): string {
  const matches = Array.from(payload.matchAll(/"(?:text|content)"\s*:\s*"((?:[^"\\]|\\.)*)"/g));
  return matches.map((match) => {
    try {
      return JSON.parse(`"${match[1]}"`) as string;
    } catch {
      return match[1].replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
  }).join('');
}

function isLlmEmptyTextError(error: unknown): error is LlmEmptyTextError {
  return error instanceof LlmEmptyTextError
    || (error instanceof Error && error.name === 'LlmEmptyTextError');
}

function normalizeLlmError(error: unknown, provider: string): Error {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new Error(`[${provider}] 模型请求超时，请稍后重试或降低生成复杂度。`);
  }

  if (error instanceof Error) {
    const msg = error.message;
    log.error(`${provider} error`, msg);
    if (isLlmEmptyTextError(error)) {
      const detail = formatEmptyTextDiagnostics(error.diagnostics);
      return withErrorDiagnostics(
        new Error(`[${provider}] ${msg}${detail ? ` (${detail})` : ''}`),
        error.diagnostics,
      );
    }
    if (/fetch failed|ECONNRESET|ENOTFOUND|ETIMEDOUT|network/i.test(msg)) {
      return new Error(`[${provider}] 网络请求失败: ${msg}`);
    }
    return new Error(`[${provider}] ${msg}`);
  }

  return new Error(`[${provider}] 未知错误: ${String(error)}`);
}

function formatEmptyTextDiagnostics(diagnostics: LlmEmptyTextDiagnostics | undefined): string {
  if (!diagnostics) return '';
  return [
    `requestStage=${diagnostics.requestStage}`,
    `stream=${diagnostics.stream}`,
    diagnostics.fallbackStage ? `fallbackStage=${diagnostics.fallbackStage}` : '',
    diagnostics.stopReason ? `stopReason=${diagnostics.stopReason}` : '',
    diagnostics.eventTypes.length ? `eventTypes=${diagnostics.eventTypes.join(',')}` : '',
    diagnostics.contentBlockTypes.length ? `contentBlockTypes=${diagnostics.contentBlockTypes.join(',')}` : '',
  ].filter(Boolean).join('; ');
}

function withErrorDiagnostics<T extends Error>(error: T, diagnostics: unknown): T {
  Object.assign(error, { diagnostics });
  return error;
}

function logLlmTelemetry(input: {
  telemetry: LlmTelemetryContext;
  logPayload: SafeLlmLogPayload;
  elapsedMs: number;
  chars: number;
  inputTokens: number | null;
  outputTokens: number | null;
  stopReason: string | null;
}) {
  const visibleYield = visibleCharsPerOutputToken(input.chars, input.outputTokens);
  const payload = {
    stage: input.telemetry.stage ?? null,
    preset: input.telemetry.preset,
    profileRole: input.telemetry.profileRole,
    profileId: input.telemetry.profileId,
    provider: input.logPayload.provider,
    model: input.logPayload.model,
    elapsedMs: input.elapsedMs,
    maxTokens: input.logPayload.maxTokens,
    stream: input.logPayload.stream,
    thinking: input.logPayload.thinking,
    temperature: input.logPayload.temperature,
    policyReason: input.logPayload.policyReason ?? null,
    outputTokens: input.outputTokens,
    visibleCharsPerOutputToken: visibleYield,
    fallbackStage: input.logPayload.fallbackStage ?? null,
    retryCount: input.telemetry.getRetryCount(),
    inputTokens: input.inputTokens,
    stopReason: input.stopReason,
    cacheHit: false,
    chars: input.chars,
  };

  log.info('LLM telemetry', payload);

  if (visibleYield !== null && visibleYield < 0.8 && input.elapsedMs >= 30_000) {
    const warning = {
      ...payload,
      warning: 'low_visible_yield',
    };
    log.warn('LLM low visible yield', warning);
    recordGenerationTrace({
      event: 'llm_warning',
      stage: input.telemetry.stage,
      summary: warning,
    });
  }
}

function policyForRequest(
  basePolicy: LlmRequestPolicy,
  config: LlmRequestConfig,
  temperature: number,
  logContext: LlmRequestLogContext,
): LlmRequestPolicy {
  return {
    ...basePolicy,
    config,
    temperature: config.thinking ? 1 : temperature,
    policyReason: resolveRequestPolicyReason(basePolicy.policyReason, logContext),
  };
}

function resolveRequestPolicyReason(
  baseReason: LlmRequestPolicyReason,
  logContext: LlmRequestLogContext,
): LlmRequestPolicyReason {
  return logContext.reason === 'thinking_fallback' ? 'thinking_fallback' : baseReason;
}

function visibleCharsPerOutputToken(chars: number, outputTokens: number | null): number | null {
  if (!outputTokens || outputTokens <= 0) return null;
  return Number((chars / outputTokens).toFixed(3));
}

function resolveThinkingModeFromEnv(value: string | undefined): LlmThinkingMode {
  if (value === 'on' || value === 'off' || value === 'auto') return value;
  return 'auto';
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException('Aborted', 'AbortError');
}

function linkAbortSignal(signal: AbortSignal | undefined, controller: AbortController): () => void {
  if (!signal) return () => undefined;
  if (signal.aborted) {
    controller.abort(signal.reason);
    return () => undefined;
  }
  const onAbort = () => controller.abort(signal.reason);
  signal.addEventListener('abort', onAbort, { once: true });
  return () => signal.removeEventListener('abort', onAbort);
}

function isStreamFallbackError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /terminated|ECONNRESET|ETIMEDOUT|network|fetch failed|stream(?:ing)?[^.]{0,80}(unsupported|not supported|invalid)|unsupported[^.]{0,80}stream/i.test(msg);
}

function isThinkingUnsupportedError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /thinking[^.]{0,100}(unsupported|not supported|invalid|unknown)|unsupported[^.]{0,100}thinking|budget_tokens|thinking.*400/i.test(msg);
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
  onRetry?: (attempt: number, error: unknown) => void;
}

async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === opts.maxAttempts || !opts.shouldRetry(error)) throw error;
      opts.onRetry?.(attempt, error);
      const delay = opts.delayMs * attempt;
      log.warn(`LLM call attempt ${attempt}/${opts.maxAttempts} failed, retrying in ${delay}ms`, {
        error: error instanceof Error ? error.message : String(error),
      });
      recordGenerationTrace({
        event: 'llm_retry',
        summary: {
          attempt,
          maxAttempts: opts.maxAttempts,
          delayMs: delay,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

function isRetryable(error: unknown): boolean {
  if (error instanceof LlmTruncationError) return false;
  if (error instanceof DOMException && error.name === 'AbortError') return false;
  const msg = error instanceof Error ? error.message : String(error);
  if (/abort|aborted|cancel/i.test(msg)) return false;
  return /timeout|ECONNRESET|ETIMEDOUT|5\d\d|网络|超时|fetch failed|failed to fetch/i.test(msg);
}

