import { NextResponse } from 'next/server';
import { listSubjectsV1 } from '@/features/subjects/application/subjectService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await listSubjectsV1());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load subjects';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
