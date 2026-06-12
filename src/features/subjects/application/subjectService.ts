import { getDefaultSubjectSource } from '@/lib/config/settings';
import { readKnowledgeManifest } from '@/features/rag/lib/retriever';
import { SubjectManager } from '@/lib/subjects/subject_manager';
import { AppError } from '@/platform/errors';

export async function listSubjectsV1() {
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

  return {
    subjects,
    defaultSubject: defaultSubject.name,
    defaultSubjectDisplayName: defaultSubject.display_name,
  };
}

export async function getDefaultSubjectV1() {
  const manager = new SubjectManager();
  const subject = await manager.getDefaultSubject();
  return {
    subject: subject.name,
    displayName: subject.display_name,
    source: await getDefaultSubjectSource(),
  };
}

export async function setDefaultSubjectV1(subjectId: string) {
  if (!subjectId) throw new AppError('subject is required', { status: 400, code: 'VALIDATION_ERROR' });
  const manager = new SubjectManager();
  const subject = await manager.setDefaultSubject(subjectId);
  return {
    subject: subject.name,
    displayName: subject.display_name,
    source: await getDefaultSubjectSource(),
  };
}
