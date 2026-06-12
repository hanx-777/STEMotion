import { clearProfilesCache } from '@/lib/generation/llmClient';
import {
  deleteModelProfile,
  fetchRemoteModels,
  readModelProfilesFile,
  setActiveModelProfile,
  toPublicProfiles,
  upsertModelProfile,
  type ModelProvider,
} from '@/lib/generation/modelProfiles';
import { createLogger } from '@/lib/logger';
import { AppError } from '@/platform/errors';

const log = createLogger('profiles:v1');

export async function getModelProfilesV1() {
  return toPublicProfiles(await readModelProfilesFile());
}

export async function saveModelProfileV1(body: unknown) {
  const input = body as { profile?: Record<string, unknown>; setActive?: unknown };
  const profile = input.profile ?? (body as Record<string, unknown>);
  const data = await upsertModelProfile(
    {
      id: String(profile.id ?? ''),
      label: String(profile.label ?? ''),
      provider: profile.provider as ModelProvider,
      baseURL: String(profile.baseURL ?? ''),
      apiKey: typeof profile.apiKey === 'string' ? profile.apiKey : undefined,
      model: String(profile.model ?? ''),
      timeout: profile.timeout === undefined || profile.timeout === '' ? undefined : Number(profile.timeout),
    },
    { setActive: Boolean(input.setActive) },
  );

  clearProfilesCache();
  log.info(`Profile saved: ${profile.id}`);
  return toPublicProfiles(data);
}

export async function activateModelProfileV1(activeProfile: unknown) {
  if (!activeProfile || typeof activeProfile !== 'string') {
    throw new AppError('activeProfile is required', { status: 400, code: 'VALIDATION_ERROR' });
  }
  const data = await setActiveModelProfile(activeProfile);
  clearProfilesCache();
  log.info(`Profile switched: ${activeProfile}`);
  return toPublicProfiles(data);
}

export async function deleteModelProfileV1(id: string) {
  if (!id) throw new AppError('id is required', { status: 400, code: 'VALIDATION_ERROR' });
  const data = await deleteModelProfile(id);
  clearProfilesCache();
  log.info(`Profile deleted: ${id}`);
  return toPublicProfiles(data);
}

export async function fetchRemoteModelsV1(body: unknown) {
  const input = body as { provider?: unknown; baseURL?: unknown; apiKey?: unknown };
  const provider = input.provider as ModelProvider;
  if (provider !== 'openai' && provider !== 'anthropic') {
    throw new AppError('provider must be openai or anthropic', { status: 400, code: 'VALIDATION_ERROR' });
  }
  return {
    models: await fetchRemoteModels({
      provider,
      baseURL: String(input.baseURL ?? ''),
      apiKey: String(input.apiKey ?? ''),
    }),
  };
}
