import { NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { clearProfilesCache } from '@/lib/generation/llmClient';
import { createLogger } from '@/lib/logger';

const log = createLogger('profiles');

const MODEL_PROFILES_PATH = join(process.cwd(), 'model-profiles.json');

interface ModelProfile {
  label: string;
  provider: 'anthropic' | 'openai';
  baseURL: string;
  apiKey: string;
  model: string;
  timeout?: number;
}

interface ModelProfilesFile {
  activeProfile: string;
  profiles: Record<string, ModelProfile>;
}

async function readProfilesFile(): Promise<ModelProfilesFile | null> {
  try {
    const raw = await readFile(MODEL_PROFILES_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function GET() {
  const data = await readProfilesFile();
  if (!data) {
    return NextResponse.json({ activeProfile: null, profiles: [] });
  }

  const profiles = Object.entries(data.profiles).map(([id, p]) => ({
    id,
    label: p.label,
    provider: p.provider,
    model: p.model,
  }));

  return NextResponse.json({ activeProfile: data.activeProfile, profiles });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const { activeProfile } = body;

  if (!activeProfile || typeof activeProfile !== 'string') {
    return NextResponse.json({ error: 'activeProfile is required' }, { status: 400 });
  }

  const data = await readProfilesFile();
  if (!data) {
    return NextResponse.json({ error: 'model-profiles.json not found' }, { status: 404 });
  }

  if (!data.profiles[activeProfile]) {
    return NextResponse.json({ error: `Profile "${activeProfile}" not found` }, { status: 404 });
  }

  const previousProfile = data.activeProfile;
  data.activeProfile = activeProfile;
  await writeFile(MODEL_PROFILES_PATH, JSON.stringify(data, null, 2), 'utf-8');
  clearProfilesCache();

  log.info(`Profile switched: ${previousProfile} → ${activeProfile}`);

  return NextResponse.json({ activeProfile });
}
