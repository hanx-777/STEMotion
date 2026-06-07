import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';

export type ModelProvider = 'openai' | 'anthropic';

export interface ModelProfile {
  label: string;
  provider: ModelProvider;
  baseURL: string;
  apiKey: string;
  model: string;
  timeout?: number;
}

export interface ModelProfilesFile {
  activeProfile: string;
  profiles: Record<string, ModelProfile>;
}

export interface PublicModelProfile {
  id: string;
  label: string;
  provider: ModelProvider;
  baseURL: string;
  model: string;
  timeout?: number;
  hasApiKey: boolean;
  apiKeyPreview: string | null;
}

export interface ModelProfileInput {
  id: string;
  label: string;
  provider: ModelProvider;
  baseURL: string;
  apiKey?: string;
  model: string;
  timeout?: number;
}

export interface RemoteModelInfo {
  id: string;
  label: string;
}

export const DEFAULT_MODEL_PROFILES_PATH = join(process.cwd(), 'model-profiles.json');

export function getModelProfilesPath(): string {
  return process.env.STEMOTION_MODEL_PROFILES_PATH || DEFAULT_MODEL_PROFILES_PATH;
}

/**
 * Resolve API key from environment variable or config file.
 * Pattern: STEMOTION_<PROFILE_ID>_API_KEY (uppercase, hyphens become underscores)
 * Falls back to config file key for backward compatibility.
 */
function resolveApiKey(profileId: string, configKey: string): string {
  const envVarName = `STEMOTION_${profileId.toUpperCase().replace(/-/g, '_')}_API_KEY`;
  const envKey = process.env[envVarName];

  if (envKey) {
    return envKey;
  }

  return configKey;
}

export async function readModelProfilesFile(filePath = getModelProfilesPath()): Promise<ModelProfilesFile | null> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    const data = JSON.parse(raw) as ModelProfilesFile;

    // Resolve API keys from environment variables
    for (const [profileId, profile] of Object.entries(data.profiles)) {
      profile.apiKey = resolveApiKey(profileId, profile.apiKey);
    }

    return data;
  } catch {
    return null;
  }
}

export async function writeModelProfilesFile(data: ModelProfilesFile, filePath = getModelProfilesPath()): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

export function toPublicProfiles(data: ModelProfilesFile | null): { activeProfile: string | null; profiles: PublicModelProfile[] } {
  if (!data) return { activeProfile: null, profiles: [] };

  const profiles = Object.entries(data.profiles).map(([id, profile]) => ({
    id,
    label: profile.label,
    provider: profile.provider,
    baseURL: profile.baseURL,
    model: profile.model,
    timeout: profile.timeout,
    hasApiKey: Boolean(profile.apiKey),
    apiKeyPreview: previewApiKey(profile.apiKey),
  }));

  return { activeProfile: data.activeProfile, profiles };
}

export async function upsertModelProfile(
  input: ModelProfileInput,
  options: { setActive?: boolean; filePath?: string } = {},
): Promise<ModelProfilesFile> {
  validateProfileInput(input);
  const filePath = options.filePath ?? getModelProfilesPath();
  const current = (await readModelProfilesFile(filePath)) ?? { activeProfile: input.id, profiles: {} };
  const existing = current.profiles[input.id];
  const apiKey = input.apiKey?.trim() || existing?.apiKey || '';

  if (!apiKey) {
    throw new Error('apiKey is required for new model profiles');
  }

  current.profiles[input.id] = {
    label: input.label.trim(),
    provider: input.provider,
    baseURL: trimTrailingSlash(input.baseURL),
    apiKey,
    model: input.model.trim(),
    ...(input.timeout ? { timeout: input.timeout } : {}),
  };

  if (options.setActive || !current.activeProfile || !current.profiles[current.activeProfile]) {
    current.activeProfile = input.id;
  }

  await writeModelProfilesFile(current, filePath);
  return current;
}

export async function setActiveModelProfile(id: string, filePath = getModelProfilesPath()): Promise<ModelProfilesFile> {
  const data = await readModelProfilesFile(filePath);
  if (!data) throw new Error('model-profiles.json not found');
  if (!data.profiles[id]) throw new Error(`Profile "${id}" not found`);

  data.activeProfile = id;
  await writeModelProfilesFile(data, filePath);
  return data;
}

export async function deleteModelProfile(id: string, filePath = getModelProfilesPath()): Promise<ModelProfilesFile> {
  const data = await readModelProfilesFile(filePath);
  if (!data) throw new Error('model-profiles.json not found');
  if (!data.profiles[id]) throw new Error(`Profile "${id}" not found`);

  const ids = Object.keys(data.profiles);
  if (ids.length <= 1) {
    throw new Error('Cannot delete the only model profile');
  }

  delete data.profiles[id];
  if (data.activeProfile === id) {
    data.activeProfile = Object.keys(data.profiles)[0];
  }

  await writeModelProfilesFile(data, filePath);
  return data;
}

export async function fetchRemoteModels(
  input: { provider: ModelProvider; baseURL: string; apiKey: string },
  fetcher: typeof fetch = fetch,
): Promise<RemoteModelInfo[]> {
  const provider = input.provider;
  const baseURL = trimTrailingSlash(input.baseURL);
  const apiKey = input.apiKey.trim();
  if (!baseURL) throw new Error('baseURL is required');
  if (!apiKey) throw new Error('apiKey is required');

  const url = provider === 'anthropic' ? `${normalizeAnthropicBaseURL(baseURL)}/models` : `${baseURL}/models`;
  const response = await fetcher(url, {
    method: 'GET',
    headers: provider === 'anthropic'
      ? {
          'anthropic-version': '2023-06-01',
          'x-api-key': apiKey,
        }
      : {
          Authorization: `Bearer ${apiKey}`,
        },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`获取模型列表失败 (${response.status}): ${errorText || response.statusText}`);
  }

  const payload = await response.json() as { data?: Array<{ id?: string; display_name?: string; name?: string }> };
  return (payload.data ?? [])
    .map((model) => {
      const id = model.id || model.name;
      if (!id) return null;
      return { id, label: model.display_name || id };
    })
    .filter((model): model is RemoteModelInfo => Boolean(model));
}

function validateProfileInput(input: ModelProfileInput): void {
  if (!/^[a-zA-Z0-9._-]+$/.test(input.id)) {
    throw new Error('Profile ID can only contain letters, numbers, dots, underscores, and hyphens');
  }
  if (!input.label.trim()) throw new Error('label is required');
  if (input.provider !== 'openai' && input.provider !== 'anthropic') {
    throw new Error('provider must be openai or anthropic');
  }
  if (!input.baseURL.trim()) throw new Error('baseURL is required');
  if (!input.model.trim()) throw new Error('model is required');
  if (input.timeout !== undefined && (!Number.isFinite(input.timeout) || input.timeout <= 0)) {
    throw new Error('timeout must be a positive number');
  }
}

function previewApiKey(value: string | undefined): string | null {
  if (!value) return null;
  if (value.length <= 10) return `${value.slice(0, 2)}...${value.slice(-2)}`;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function normalizeAnthropicBaseURL(value: string): string {
  return trimTrailingSlash(value).endsWith('/v1') ? trimTrailingSlash(value) : `${trimTrailingSlash(value)}/v1`;
}
