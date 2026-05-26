import { NextResponse } from 'next/server';
import { askRag } from '@/lib/rag/rag_pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      question?: string;
      subject?: string;
      use_web_search?: boolean;
      task_type?: 'knowledge_qa' | 'step_solution' | 'misconception_diagnosis' | 'teacher_prep';
    };

    if (!body.question?.trim()) {
      return NextResponse.json({ error: 'question is required' }, { status: 400 });
    }

    const result = await askRag({
      question: body.question,
      subject: body.subject,
      use_web_search: body.use_web_search,
      task_type: body.task_type,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'RAG ask failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
