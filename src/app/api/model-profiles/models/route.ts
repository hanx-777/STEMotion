import { NextResponse } from 'next/server';
import { fetchRemoteModelsV1 } from '@/features/settings/application/modelProfileService';

export async function POST(request: Request) {
  try {
    return NextResponse.json(await fetchRemoteModelsV1(await request.json()));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
