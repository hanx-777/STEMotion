import { NextResponse } from 'next/server';
import { clearProfilesCache } from '@/lib/generation/llmClient';
import {
  deleteModelProfile,
  readModelProfilesFile,
  setActiveModelProfile,
  toPublicProfiles,
  upsertModelProfile,
} from '@/lib/generation/modelProfiles';
import { createLogger } from '@/lib/logger';

const log = createLogger('profiles');

export async function GET() {
  const data = await readModelProfilesFile();
  return NextResponse.json(toPublicProfiles(data));
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const profile = body.profile ?? body;
    const data = await upsertModelProfile(
      {
        id: String(profile.id ?? ''),
        label: String(profile.label ?? ''),
        provider: profile.provider,
        baseURL: String(profile.baseURL ?? ''),
        apiKey: typeof profile.apiKey === 'string' ? profile.apiKey : undefined,
        model: String(profile.model ?? ''),
        timeout: profile.timeout === undefined || profile.timeout === '' ? undefined : Number(profile.timeout),
      },
      { setActive: Boolean(body.setActive) },
    );

    clearProfilesCache();
    log.info(`Profile saved: ${profile.id}`);
    return NextResponse.json(toPublicProfiles(data));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { activeProfile } = body;

    if (!activeProfile || typeof activeProfile !== 'string') {
      return NextResponse.json({ error: 'activeProfile is required' }, { status: 400 });
    }

    const data = await setActiveModelProfile(activeProfile);
    clearProfilesCache();
    log.info(`Profile switched: ${activeProfile}`);

    return NextResponse.json(toPublicProfiles(data));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('not found') ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const data = await deleteModelProfile(id);
    clearProfilesCache();
    log.info(`Profile deleted: ${id}`);

    return NextResponse.json(toPublicProfiles(data));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('not found') ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
