import { NextResponse } from 'next/server';
import { fetchRemoteModels, type ModelProvider } from '@/lib/generation/modelProfiles';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const provider = body.provider as ModelProvider;
    const baseURL = String(body.baseURL ?? '');
    const apiKey = String(body.apiKey ?? '');

    if (provider !== 'openai' && provider !== 'anthropic') {
      return NextResponse.json({ error: 'provider must be openai or anthropic' }, { status: 400 });
    }

    const models = await fetchRemoteModels({ provider, baseURL, apiKey });
    return NextResponse.json({ models });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
