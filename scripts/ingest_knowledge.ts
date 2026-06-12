import { SubjectManager } from '../src/lib/subjects/subject_manager';
import { ingestSubjectKnowledge } from '../src/features/rag/lib/retriever';

async function main() {
  const subjectArg = getArg('--subject') ?? 'physics_mechanics';
  const manager = new SubjectManager();
  const subjects = subjectArg === 'all'
    ? (await manager.listSubjects()).map((subject) => subject.name)
    : [await manager.validateSubject(subjectArg)];

  for (const subject of subjects) {
    const result = await ingestSubjectKnowledge(subject, manager);
    console.log(`${result.subject}: ${result.document_count} documents, ${result.chunk_count} chunks`);
    console.log(`index: ${result.index_path}`);
    console.log(`manifest: ${result.manifest_path}`);
  }
}

function getArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
