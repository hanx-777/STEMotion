import { readdir, readFile, mkdir, writeFile, stat } from 'fs/promises';
import { join, extname, relative } from 'path';
import { chunkMarkdown } from '../src/features/rag/lib/markdown_chunker';
import type { KnowledgeChunk, SubjectRagConfig } from '../src/features/rag/lib/knowledge_chunk_types';
import { DEFAULT_RAG_CONFIG } from '../src/features/rag/lib/knowledge_chunk_types';
import { KeywordIndex } from '../src/features/rag/lib/keyword_index';
import { VectorIndex } from '../src/features/rag/lib/vector_index';
import { createEmbeddingProviderFromEnv } from '../src/features/rag/lib/embeddings';

const SKILLS_ROOT = join(process.cwd(), 'skills');
const SUPPORTED_EXTENSIONS = new Set(['.md', '.txt']);

interface BuildReport {
  subject: string;
  sourceFiles: number;
  totalChunks: number;
  chunksByType: Record<string, number>;
  avgTokenCount: number;
  buildTimeMs: number;
}

async function fileExists(path: string): Promise<boolean> {
  try { await stat(path); return true; } catch { return false; }
}

async function loadSubjectConfig(subjectDir: string): Promise<SubjectRagConfig> {
  const configPath = join(subjectDir, 'knowledge_base', 'config', 'rag.config.json');
  if (await fileExists(configPath)) {
    return JSON.parse(await readFile(configPath, 'utf-8')) as SubjectRagConfig;
  }
  const subjectName = subjectDir.split(/[\\/]/).pop() ?? '(unknown)';
  return { ...DEFAULT_RAG_CONFIG, subject: subjectName, displayName: subjectName };
}

async function listSourceFiles(sourcesDir: string): Promise<string[]> {
  try {
    const entries = await readdir(sourcesDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && SUPPORTED_EXTENSIONS.has(extname(e.name).toLowerCase()))
      .map((e) => join(sourcesDir, e.name));
  } catch {
    return [];
  }
}

async function buildSubject(subjectDir: string): Promise<BuildReport> {
  const startTime = Date.now();
  const subjectName = subjectDir.split(/[\\/]/).pop() ?? '(unknown)';
  const config = await loadSubjectConfig(subjectDir);

  // Find sources directory (new layout) or knowledge_base root (old layout)
  const sourcesDir = join(subjectDir, 'knowledge_base', 'sources');
  const hasSources = await fileExists(sourcesDir);
  const scanDir = hasSources ? sourcesDir : join(subjectDir, 'knowledge_base');

  const sourceFiles = await listSourceFiles(scanDir);
  const allChunks: KnowledgeChunk[] = [];

  for (const filePath of sourceFiles) {
    const content = await readFile(filePath, 'utf-8');
    const relativePath = relative(join(subjectDir, 'knowledge_base'), filePath).replace(/\\/g, '/');
    const chunks = chunkMarkdown(content, {
      subject: subjectName,
      sourceFile: relativePath,
      targetTokens: config.chunking.targetTokens,
      maxTokens: config.chunking.maxTokens,
      minTokens: config.chunking.minTokens,
    });
    allChunks.push(...chunks);
  }

  // Write chunks.jsonl
  const processedDir = join(subjectDir, 'knowledge_base', 'processed');
  await mkdir(processedDir, { recursive: true });
  const jsonlPath = join(processedDir, 'chunks.jsonl');
  const jsonlContent = allChunks.map((c) => JSON.stringify(c)).join('\n');
  await writeFile(jsonlPath, jsonlContent, 'utf-8');

  // Build keyword index
  const indexDir = join(subjectDir, 'knowledge_base', 'index');
  await mkdir(indexDir, { recursive: true });
  const keywordIndex = new KeywordIndex(join(indexDir, 'keyword.json'));
  await keywordIndex.build(allChunks);
  await keywordIndex.save();

  // Build vector index (uses hash embedding by default)
  const embeddingProvider = createEmbeddingProviderFromEnv();
  const vectorIndex = new VectorIndex(join(indexDir, 'vector.json'));
  await vectorIndex.build(allChunks, embeddingProvider);

  // Write manifest.json
  const chunksByType: Record<string, number> = {};
  let totalTokens = 0;
  for (const chunk of allChunks) {
    chunksByType[chunk.contentType] = (chunksByType[chunk.contentType] ?? 0) + 1;
    totalTokens += chunk.tokenCount;
  }

  const manifest = {
    subject: subjectName,
    built_at: new Date().toISOString(),
    source_files: sourceFiles.length,
    total_chunks: allChunks.length,
    chunks_by_type: chunksByType,
    avg_token_count: allChunks.length > 0 ? Math.round(totalTokens / allChunks.length) : 0,
    config: {
      chunking: config.chunking,
      retrieval: config.retrieval,
    },
  };
  await writeFile(join(processedDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  return {
    subject: subjectName,
    sourceFiles: sourceFiles.length,
    totalChunks: allChunks.length,
    chunksByType,
    avgTokenCount: manifest.avg_token_count,
    buildTimeMs: Date.now() - startTime,
  };
}

async function main() {
  const subjectArg = getArg('--subject');
  const entries = await readdir(SKILLS_ROOT, { withFileTypes: true });
  const subjects = entries.filter((e) => e.isDirectory());

  const targetSubjects = subjectArg
    ? subjects.filter((s) => s.name === subjectArg)
    : subjects;

  if (targetSubjects.length === 0) {
    console.error(`No subjects found${subjectArg ? ` matching "${subjectArg}"` : ''}.`);
    process.exitCode = 1;
    return;
  }

  console.log(`Building knowledge base for ${targetSubjects.length} subject(s)...\n`);

  const reports: BuildReport[] = [];
  for (const subject of targetSubjects) {
    const subjectDir = join(SKILLS_ROOT, subject.name);
    try {
      const report = await buildSubject(subjectDir);
      reports.push(report);
      console.log(`${report.subject}:`);
      console.log(`  source files: ${report.sourceFiles}`);
      console.log(`  chunks: ${report.totalChunks}`);
      console.log(`  by type: ${JSON.stringify(report.chunksByType)}`);
      console.log(`  avg tokens: ${report.avgTokenCount}`);
      console.log(`  time: ${report.buildTimeMs}ms\n`);
    } catch (error) {
      console.error(`${subject.name}: BUILD FAILED — ${error instanceof Error ? error.message : error}\n`);
    }
  }

  // Summary
  const totalChunks = reports.reduce((sum, r) => sum + r.totalChunks, 0);
  const totalTime = reports.reduce((sum, r) => sum + r.buildTimeMs, 0);
  console.log(`\nTotal: ${totalChunks} chunks across ${reports.length} subjects in ${totalTime}ms`);
}

function getArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
