import { NextResponse } from 'next/server';
import { readKnowledgeManifest } from '@/lib/rag/retriever';
import { SubjectManager } from '@/lib/subjects/subject_manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const manager = new SubjectManager();
    const [subjectsWithoutStatus, defaultSubject] = await Promise.all([
      manager.listSubjects(),
      manager.getDefaultSubject(),
    ]);
    const subjects = await Promise.all(subjectsWithoutStatus.map(async (subject) => {
      const manifest = await readKnowledgeManifest(subject.name);
      return {
        ...subject,
        knowledge_status: {
          file_count: manifest.file_count,
          chunk_count: manifest.chunk_count,
          indexed: manifest.indexed,
          manifest_updated_at: manifest.manifest_updated_at || undefined,
        },
      };
    }));

    return NextResponse.json({
      subjects,
      defaultSubject: defaultSubject.name,
      defaultSubjectDisplayName: defaultSubject.display_name,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load subjects';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
