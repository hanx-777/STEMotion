import type { LlmProfileRole, ModelProvider } from './modelProfiles';

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
  // 002B: 8000 is sufficient for JSON planning output; was 16000 (99.5s)
  planning: { maxTokens: 8000, stream: true, thinking: true, thinkingBudgetTokens: 1024 },
  blueprint: { maxTokens: 24000, stream: true, thinking: true, thinkingBudgetTokens: 2048 },
  reviewer: { maxTokens: 16000, stream: true, thinking: true, thinkingBudgetTokens: 2048 },
  revision: { maxTokens: 24000, stream: true, thinking: true, thinkingBudgetTokens: 2048 },
  // 002B: 18000 cuts HTML generation from 11min → ~3-4min; 30K-token outputs add no quality
  artifact: { maxTokens: 18000, stream: true, thinking: true, thinkingBudgetTokens: 2048 },
  repair: { maxTokens: 24000, stream: true, thinking: true, thinkingBudgetTokens: 2048 },
  teacherActions: { maxTokens: 16000, stream: true, thinking: true, thinkingBudgetTokens: 2048 },
} as const satisfies Record<string, LlmRequestConfig>;

export type LlmRequestPreset = keyof typeof LLM_REQUEST_PRESETS;
export type LlmThinkingMode = 'auto' | 'on' | 'off';
export type LlmRequestPolicyReason =
  | 'official_anthropic_thinking'
  | 'anthropic_compatible_thinking_disabled'
  | 'thinking_disabled_by_config'
  | 'thinking_override_on'
  | 'thinking_override_off'
  | 'thinking_fallback'
  | 'provider_not_anthropic';

export interface LlmRequestPolicyInput {
  provider: ModelProvider;
  baseURL?: string;
  model: string;
  config: LlmRequestConfig;
  temperature?: number;
  thinkingMode?: LlmThinkingMode;
}

export interface LlmRequestPolicy {
  config: LlmRequestConfig;
  temperature: number;
  thinkingMode: LlmThinkingMode;
  policyReason: LlmRequestPolicyReason;
  isOfficialAnthropic: boolean;
}

export interface ProviderRequestInput {
  model: string;
  messages: LlmRequestMessage[];
  temperature: number;
  config: LlmRequestConfig;
  policy?: LlmRequestPolicy;
  requestPreset?: LlmRequestPreset;
  logContext?: LlmRequestLogContext;
}

export type LlmRequestLogStage =
  | 'initial'
  | 'provider_adapter_downgrade'
  | 'stream_fallback'
  | 'thinking_fallback'
  | 'empty_text_fallback';

export type LlmRequestLogReason =
  | 'provider_capability_downgrade'
  | 'stream_fallback'
  | 'thinking_fallback'
  | 'empty_text_fallback';

export interface LlmRequestLogContext {
  requestStage?: LlmRequestLogStage;
  reason?: LlmRequestLogReason;
  fallbackStage?: 'stream' | 'thinking' | 'empty_text';
}

export interface SafeLlmLogPayload {
  model: string;
  profileRole?: LlmProfileRole;
  profileId?: string;
  provider: ModelProvider;
  requestStage: LlmRequestLogStage;
  requestBodyFormat: 'openai-chat-completions' | 'anthropic-messages';
  providerMaxTokensField: 'max_tokens';
  normalizedMaxTokensField: 'maxTokens';
  maxTokens: number;
  stream: boolean;
  thinking: boolean;
  temperature: number;
  requestPreset?: LlmRequestPreset;
  policyReason?: LlmRequestPolicyReason;
  thinkingMode?: LlmThinkingMode;
  thinkingBudgetTokens?: number;
  reason?: LlmRequestLogReason;
  fallbackStage?: 'stream' | 'thinking' | 'empty_text';
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

export function resolveLlmRequestPolicy(input: LlmRequestPolicyInput): LlmRequestPolicy {
  const thinkingMode = input.thinkingMode ?? 'auto';
  const isOfficialAnthropic = isOfficialAnthropicClaude(input);
  let nextConfig = { ...input.config };
  let policyReason: LlmRequestPolicyReason;
  const callerTemperature = input.temperature ?? 0.2;

  if (input.provider !== 'anthropic') {
    return {
      config: nextConfig,
      temperature: callerTemperature,
      thinkingMode,
      policyReason: 'provider_not_anthropic',
      isOfficialAnthropic,
    };
  }

  if (thinkingMode === 'on') {
    nextConfig = { ...nextConfig, thinking: true };
    policyReason = 'thinking_override_on';
  } else if (thinkingMode === 'off') {
    nextConfig = { ...nextConfig, thinking: false };
    policyReason = 'thinking_override_off';
  } else if (!nextConfig.thinking) {
    policyReason = 'thinking_disabled_by_config';
  } else if (isOfficialAnthropic) {
    policyReason = 'official_anthropic_thinking';
  } else {
    nextConfig = { ...nextConfig, thinking: false };
    policyReason = 'anthropic_compatible_thinking_disabled';
  }

  return {
    config: nextConfig,
    temperature: resolveEffectiveTemperature(nextConfig, callerTemperature),
    thinkingMode,
    policyReason,
    isOfficialAnthropic,
  };
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
      temperature: body.temperature,
      ...(input.requestPreset ? { requestPreset: input.requestPreset } : {}),
      reason: downgraded ? 'provider_capability_downgrade' : undefined,
      downgrade: downgraded ? 'openai-compatible-adapter' : undefined,
    },
  };
}

export function buildAnthropicMessagesRequest(input: ProviderRequestInput): AnthropicMessagesRequest {
  const config = input.policy?.config ?? input.config;
  const system = input.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n');
  const messages = input.messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({ role: message.role as 'user' | 'assistant', content: message.content }));
  const thinkingBudgetTokens = normalizeThinkingBudget(config);
  const temperature = input.policy?.temperature ?? resolveEffectiveTemperature(config, input.temperature);
  const body = {
    model: input.model,
    max_tokens: config.maxTokens,
    temperature,
    stream: config.stream,
    ...(config.thinking ? { thinking: { type: 'enabled' as const, budget_tokens: thinkingBudgetTokens } } : {}),
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
      temperature: body.temperature,
      ...(input.requestPreset ? { requestPreset: input.requestPreset } : {}),
      ...(input.policy?.policyReason ? { policyReason: input.policy.policyReason } : {}),
      ...(input.policy?.thinkingMode ? { thinkingMode: input.policy.thinkingMode } : {}),
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

function resolveEffectiveTemperature(config: LlmRequestConfig, temperature: number): number {
  return config.thinking ? 1 : temperature;
}

function isOfficialAnthropicClaude(input: Pick<LlmRequestPolicyInput, 'provider' | 'baseURL' | 'model'>): boolean {
  if (input.provider !== 'anthropic') return false;
  if (!/^claude[-_]/i.test(input.model)) return false;

  try {
    const url = new URL(input.baseURL ?? '');
    return url.hostname.toLowerCase() === 'api.anthropic.com';
  } catch {
    return false;
  }
}
