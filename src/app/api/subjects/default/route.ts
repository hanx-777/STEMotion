import { NextResponse } from 'next/server';
import { getDefaultSubjectV1, setDefaultSubjectV1 } from '@/features/subjects/application/subjectService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await getDefaultSubjectV1());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load default subject';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { subject?: string };
    if (!body.subject) {
      return NextResponse.json({ error: 'subject is required' }, { status: 400 });
    }

    return NextResponse.json(await setDefaultSubjectV1(body.subject));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to set default subject';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
