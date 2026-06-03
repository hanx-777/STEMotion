import { readdir, mkdir, rename, stat, writeFile } from 'fs/promises';
import { join, extname } from 'path';

const SKILLS_ROOT = join(process.cwd(), 'skills');
const KNOWLEDGE_EXTS = new Set(['.md', '.txt', '.pdf']);

async function migrateSubject(subjectDir: string): Promise<void> {
  const kbDir = join(subjectDir, 'knowledge_base');
  const sourcesDir = join(kbDir, 'sources');

  try {
    await stat(kbDir);
  } catch {
    return; // no knowledge_base directory
  }

  // Check if already migrated (sources/ exists)
  try {
    await stat(sourcesDir);
    console.log(`  already migrated: ${subjectDir}`);
    return;
  } catch {
    // not migrated yet, proceed
  }

  // Create new directories
  await mkdir(sourcesDir, { recursive: true });
  await mkdir(join(kbDir, 'processed'), { recursive: true });
  await mkdir(join(kbDir, 'index'), { recursive: true });

  // Move .md/.txt/.pdf files from knowledge_base/ to knowledge_base/sources/
  const entries = await readdir(kbDir, { withFileTypes: true });
  let movedCount = 0;

  for (const entry of entries) {
    if (entry.isFile() && KNOWLEDGE_EXTS.has(extname(entry.name).toLowerCase())) {
      const src = join(kbDir, entry.name);
      const dest = join(sourcesDir, entry.name);
      await rename(src, dest);
      movedCount++;
    }
  }

  // Write a migration marker
  await writeFile(join(kbDir, '.migrated'), JSON.stringify({
    migrated_at: new Date().toISOString(),
    files_moved: movedCount,
  }, null, 2), 'utf-8');

  console.log(`  migrated ${movedCount} files to sources/`);
}

async function main() {
  const entries = await readdir(SKILLS_ROOT, { withFileTypes: true });
  const subjects = entries.filter((e) => e.isDirectory());

  console.log(`Migrating knowledge base directories for ${subjects.length} subjects...\n`);

  for (const subject of subjects) {
    console.log(`${subject.name}:`);
    await migrateSubject(join(SKILLS_ROOT, subject.name));
  }

  console.log('\nMigration complete. Old .md files are now in knowledge_base/sources/.');
  console.log('The document_loader.ts supports both old and new layouts.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
