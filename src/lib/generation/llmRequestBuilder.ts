import type { ModelProvider } from './modelProfiles';

export interface LlmRequestMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmRequestConfig {
  maxTokens: number;
  stream: boolean;
  thinking: boolean;
  thinkingBudgetTokens: number;
}

export const LLM_REQUEST_PRESETS = {
  default: { maxTokens: 24000, stream: true, thinking: true, thinkingBudgetTokens: 2048 },
  answer: { maxTokens: 24000, stream: true, thinking: true, thinkingBudgetTokens: 2048 },
  planning: { maxTokens: 16000, stream: true, thinking: true, thinkingBudgetTokens: 2048 },
  blueprint: { maxTokens: 24000, stream: true, thinking: true, thinkingBudgetTokens: 2048 },
  reviewer: { maxTokens: 16000, stream: true, thinking: true, thinkingBudgetTokens: 2048 },
  revision: { maxTokens: 24000, stream: true, thinking: true, thinkingBudgetTokens: 2048 },
  artifact: { maxTokens: 32768, stream: true, thinking: true, thinkingBudgetTokens: 4096 },
  repair: { maxTokens: 32768, stream: true, thinking: true, thinkingBudgetTokens: 4096 },
  teacherActions: { maxTokens: 16000, stream: true, thinking: true, thinkingBudgetTokens: 2048 },
} as const satisfies Record<string, LlmRequestConfig>;

export type LlmRequestPreset = keyof typeof LLM_REQUEST_PRESETS;

export interface ProviderRequestInput {
  model: string;
  messages: LlmRequestMessage[];
  temperature: number;
  config: LlmRequestConfig;
  logContext?: LlmRequestLogContext;
}

export type LlmRequestLogStage =
  | 'initial'
  | 'provider_adapter_downgrade'
  | 'stream_fallback'
  | 'thinking_fallback';

export type LlmRequestLogReason =
  | 'provider_capability_downgrade'
  | 'stream_fallback'
  | 'thinking_fallback';

export interface LlmRequestLogContext {
  requestStage?: LlmRequestLogStage;
  reason?: LlmRequestLogReason;
  fallbackStage?: 'stream' | 'thinking';
}

export interface SafeLlmLogPayload {
  model: string;
  provider: ModelProvider;
  requestStage: LlmRequestLogStage;
  requestBodyFormat: 'openai-chat-completions' | 'anthropic-messages';
  providerMaxTokensField: 'max_tokens';
  normalizedMaxTokensField: 'maxTokens';
  maxTokens: number;
  stream: boolean;
  thinking: boolean;
  thinkingBudgetTokens?: number;
  reason?: LlmRequestLogReason;
  fallbackStage?: 'stream' | 'thinking';
  downgrade?: string;
}

export interface OpenAIChatRequest {
  body: {
    model: string;
    messages: LlmRequestMessage[];
    temperature: number;
    max_tokens: number;
    stream: false;
  };
  logPayload: SafeLlmLogPayload;
}

export interface AnthropicMessagesRequest {
  body: {
    model: string;
    max_tokens: number;
    temperature: number;
    stream: boolean;
    thinking?: { type: 'enabled'; budget_tokens: number };
    system?: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  };
  logPayload: SafeLlmLogPayload;
}

export function resolveLlmRequestConfig(preset: LlmRequestPreset = 'default'): LlmRequestConfig {
  return { ...LLM_REQUEST_PRESETS[preset] };
}

export function buildOpenAIChatRequest(input: ProviderRequestInput): OpenAIChatRequest {
  const downgraded = input.config.stream || input.config.thinking;
  const body = {
    model: input.model,
    messages: input.messages,
    temperature: input.temperature,
    max_tokens: input.config.maxTokens,
    stream: false as const,
  };

  return {
    body,
    logPayload: {
      model: body.model,
      provider: 'openai',
      requestStage: downgraded ? 'provider_adapter_downgrade' : 'initial',
      requestBodyFormat: 'openai-chat-completions',
      providerMaxTokensField: 'max_tokens',
      normalizedMaxTokensField: 'maxTokens',
      maxTokens: body.max_tokens,
      stream: false,
      thinking: false,
      reason: downgraded ? 'provider_capability_downgrade' : undefined,
      downgrade: downgraded ? 'openai-compatible-adapter' : undefined,
    },
  };
}

export function buildAnthropicMessagesRequest(input: ProviderRequestInput): AnthropicMessagesRequest {
  const system = input.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n');
  const messages = input.messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({ role: message.role as 'user' | 'assistant', content: message.content }));
  const thinkingBudgetTokens = normalizeThinkingBudget(input.config);
  const body = {
    model: input.model,
    max_tokens: input.config.maxTokens,
    temperature: input.config.thinking ? 1 : input.temperature,
    stream: input.config.stream,
    ...(input.config.thinking ? { thinking: { type: 'enabled' as const, budget_tokens: thinkingBudgetTokens } } : {}),
    ...(system ? { system } : {}),
    messages,
  };

  return {
    body,
    logPayload: {
      model: body.model,
      provider: 'anthropic',
      requestStage: input.logContext?.requestStage ?? 'initial',
      requestBodyFormat: 'anthropic-messages',
      providerMaxTokensField: 'max_tokens',
      normalizedMaxTokensField: 'maxTokens',
      maxTokens: body.max_tokens,
      stream: body.stream,
      thinking: Boolean(body.thinking),
      ...(body.thinking ? { thinkingBudgetTokens } : {}),
      ...(input.logContext?.reason ? { reason: input.logContext.reason } : {}),
      ...(input.logContext?.fallbackStage ? { fallbackStage: input.logContext.fallbackStage } : {}),
    },
  };
}

function normalizeThinkingBudget(config: LlmRequestConfig): number {
  if (!config.thinking) return 0;
  return Math.max(1024, Math.min(config.thinkingBudgetTokens, config.maxTokens - 1024));
}
