import { NextResponse } from 'next/server';
import { getDefaultSubjectSource } from '@/lib/config/settings';
import { SubjectManager } from '@/lib/subjects/subject_manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const manager = new SubjectManager();
    const subject = await manager.getDefaultSubject();
    return NextResponse.json({
      subject: subject.name,
      displayName: subject.display_name,
      source: await getDefaultSubjectSource(),
    });
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

    const manager = new SubjectManager();
    const subject = await manager.setDefaultSubject(body.subject);

    return NextResponse.json({
      subject: subject.name,
      displayName: subject.display_name,
      source: await getDefaultSubjectSource(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to set default subject';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
