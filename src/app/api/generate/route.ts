import { NextResponse } from 'next/server';
import { runExperimentAgentPipeline } from '@/lib/generation/agentPipeline';

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { prompt } = (await req.json()) as { prompt?: string };
    const config = await runExperimentAgentPipeline(prompt ?? '');

    return NextResponse.json(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Generation failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
