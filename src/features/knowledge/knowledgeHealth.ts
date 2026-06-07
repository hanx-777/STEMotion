import { readdir, readFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

export const TARGET_KNOWLEDGE_SUBJECTS = [
  'physics_mechanics',
  'advanced_math',
  'chemistry',
  'computer_science',
] as const;

export type TargetKnowledgeSubject = (typeof TARGET_KNOWLEDGE_SUBJECTS)[number];
export type KnowledgeValidationStatus = 'healthy' | 'partial' | 'missing';

export interface KnowledgeSubjectHealth {
  subject: TargetKnowledgeSubject;
  displayName: string;
  sourceFileCount: number;
  processedManifestExists: boolean;
  processedChunkCount: number;
  processedIndexFiles: string[];
  runtimeManifestExists: boolean;
  runtimeChunkCount: number;
  lastUpdated: string;
  coverageModules: string[];
  missingModules: string[];
  validationStatus: KnowledgeValidationStatus;
  healthScore: number;
  notes: string[];
}

export interface KnowledgeHealthSummary {
  totalSubjects: number;
  healthySubjects: number;
  partialSubjects: number;
  missingSubjects: number;
  totalSourceFiles: number;
  totalProcessedChunks: number;
  totalRuntimeChunks: number;
  runtimeReadySubjects: number;
}

export interface KnowledgeHealthReport {
  generatedAt: string;
  summary: KnowledgeHealthSummary;
  subjects: KnowledgeSubjectHealth[];
  processedVsRuntimeNote: string;
  reingestCommandExample: string;
}

type JsonRecord = Record<string, unknown>;

export async function getKnowledgeHealth(projectRoot = process.cwd()): Promise<KnowledgeHealthReport> {
  const subjects = await Promise.all(
    TARGET_KNOWLEDGE_SUBJECTS.map((subject) => readSubjectHealth(projectRoot, subject)),
  );

  return {
    generatedAt: new Date().toISOString(),
    summary: summarizeSubjects(subjects),
    subjects,
    processedVsRuntimeNote:
      'Static processed data comes from skills/*/knowledge_base/processed plus skills/*/knowledge_base/index. Runtime data comes from .stemotion/vector-store manifests created by local ingest.',
    reingestCommandExample: await getReingestCommandExample(projectRoot),
  };
}

async function readSubjectHealth(projectRoot: string, subject: TargetKnowledgeSubject): Promise<KnowledgeSubjectHealth> {
  const skillDir = join(projectRoot, 'skills', subject);
  const knowledgeBaseDir = join(skillDir, 'knowledge_base');
  const sourcesDir = join(knowledgeBaseDir, 'sources');
  const processedDir = join(knowledgeBaseDir, 'processed');
  const indexDir = join(knowledgeBaseDir, 'index');
  const runtimeManifestPath = join(projectRoot, '.stemotion', 'vector-store', `${subject}.manifest.json`);

  const [skillYaml, sourceFiles, processedManifest, processedIndexFiles, runtimeManifest] = await Promise.all([
    readTextIfExists(join(skillDir, 'skill.yaml')),
    listFilesIfExists(sourcesDir),
    readJsonIfExists(join(processedDir, 'manifest.json')),
    listProcessedIndexFiles(processedDir, indexDir),
    readJsonIfExists(runtimeManifestPath),
  ]);

  const displayName = readYamlScalar(skillYaml, 'display_name') || subject;
  const processedManifestExists = Boolean(processedManifest);
  const runtimeManifestExists = Boolean(runtimeManifest);
  const processedChunkCount = numberFrom(processedManifest?.total_chunks);
  const runtimeChunkCount = numberFrom(runtimeManifest?.chunk_count);
  const processedSourceCount = numberFrom(processedManifest?.source_files);
  const coverageModules = [...new Set(sourceFiles.map(toCoverageModule))].sort((a, b) => a.localeCompare(b));
  const missingModules = sourceFiles.length === 0 ? ['knowledge_base/sources'] : [];
  const lastUpdated =
    stringFrom(runtimeManifest?.manifest_updated_at)
    || stringFrom(processedManifest?.built_at)
    || 'not available';
  const notes = buildNotes({
    sourceFileCount: sourceFiles.length,
    processedManifestExists,
    processedChunkCount,
    processedSourceCount,
    processedIndexFiles,
    runtimeManifestExists,
    runtimeChunkCount,
    runtimeIndexed: booleanFrom(runtimeManifest?.indexed),
  });
  const validationStatus = getValidationStatus({
    sourceFileCount: sourceFiles.length,
    processedManifestExists,
    processedChunkCount,
    processedIndexFiles,
    runtimeManifestExists,
    runtimeChunkCount,
    missingModules,
  });

  return {
    subject,
    displayName,
    sourceFileCount: sourceFiles.length,
    processedManifestExists,
    processedChunkCount,
    processedIndexFiles,
    runtimeManifestExists,
    runtimeChunkCount,
    lastUpdated,
    coverageModules,
    missingModules,
    validationStatus,
    healthScore: scoreSubjectHealth({
      sourceFileCount: sourceFiles.length,
      processedManifestExists,
      processedChunkCount,
      processedIndexFiles,
      runtimeManifestExists,
      runtimeChunkCount,
    }),
    notes,
  };
}

function summarizeSubjects(subjects: KnowledgeSubjectHealth[]): KnowledgeHealthSummary {
  return {
    totalSubjects: subjects.length,
    healthySubjects: subjects.filter((item) => item.validationStatus === 'healthy').length,
    partialSubjects: subjects.filter((item) => item.validationStatus === 'partial').length,
    missingSubjects: subjects.filter((item) => item.validationStatus === 'missing').length,
    totalSourceFiles: subjects.reduce((sum, item) => sum + item.sourceFileCount, 0),
    totalProcessedChunks: subjects.reduce((sum, item) => sum + item.processedChunkCount, 0),
    totalRuntimeChunks: subjects.reduce((sum, item) => sum + item.runtimeChunkCount, 0),
    runtimeReadySubjects: subjects.filter((item) => item.runtimeManifestExists && item.runtimeChunkCount > 0).length,
  };
}

async function getReingestCommandExample(projectRoot: string): Promise<string> {
  const packageJson = await readJsonIfExists(join(projectRoot, 'package.json'));
  const scripts = recordFrom(packageJson?.scripts);
  const scriptName = typeof scripts?.['rag:ingest'] === 'string' ? 'rag:ingest' : '';

  return scriptName
    ? `npm run ${scriptName} -- --subject ${TARGET_KNOWLEDGE_SUBJECTS[0]}`
    : 'No rag:ingest package script found';
}

function getValidationStatus(input: {
  sourceFileCount: number;
  processedManifestExists: boolean;
  processedChunkCount: number;
  processedIndexFiles: string[];
  runtimeManifestExists: boolean;
  runtimeChunkCount: number;
  missingModules: string[];
}): KnowledgeValidationStatus {
  const staticReady = input.sourceFileCount > 0
    && input.processedManifestExists
    && input.processedChunkCount > 0
    && input.processedIndexFiles.length > 0
    && input.missingModules.length === 0;

  if (!staticReady) return 'missing';
  if (!input.runtimeManifestExists || input.runtimeChunkCount <= 0) return 'partial';
  return 'healthy';
}

function scoreSubjectHealth(input: {
  sourceFileCount: number;
  processedManifestExists: boolean;
  processedChunkCount: number;
  processedIndexFiles: string[];
  runtimeManifestExists: boolean;
  runtimeChunkCount: number;
}): number {
  const sourceScore = input.sourceFileCount > 0 ? 20 : 0;
  const manifestScore = input.processedManifestExists ? 20 : 0;
  const processedScore = input.processedChunkCount > 0 ? 20 : 0;
  const indexScore = input.processedIndexFiles.length >= 2 ? 20 : input.processedIndexFiles.length > 0 ? 10 : 0;
  const runtimeScore = input.runtimeManifestExists ? (input.runtimeChunkCount > 0 ? 20 : 10) : 0;

  return sourceScore + manifestScore + processedScore + indexScore + runtimeScore;
}

function buildNotes(input: {
  sourceFileCount: number;
  processedManifestExists: boolean;
  processedChunkCount: number;
  processedSourceCount: number;
  processedIndexFiles: string[];
  runtimeManifestExists: boolean;
  runtimeChunkCount: number;
  runtimeIndexed: boolean | null;
}): string[] {
  const notes: string[] = [];

  if (input.sourceFileCount === 0) notes.push('No source files found under knowledge_base/sources.');
  if (!input.processedManifestExists) notes.push('Processed manifest is missing.');
  if (input.processedManifestExists && input.processedChunkCount === 0) notes.push('Processed manifest reports zero chunks.');
  if (input.processedSourceCount > 0 && input.processedSourceCount !== input.sourceFileCount) {
    notes.push(`Processed manifest source count is ${input.processedSourceCount}; filesystem source count is ${input.sourceFileCount}.`);
  }
  if (input.processedIndexFiles.length === 0) notes.push('No processed keyword/vector index files found.');
  if (!input.runtimeManifestExists) notes.push('Runtime vector-store manifest is not present yet.');
  if (input.runtimeManifestExists && input.runtimeChunkCount === 0) notes.push('Runtime manifest reports zero chunks.');
  if (input.runtimeIndexed === false) notes.push('Runtime manifest is present but indexed is false.');

  return notes.length > 0 ? notes : ['Static and runtime knowledge data are available.'];
}

async function listProcessedIndexFiles(processedDir: string, indexDir: string): Promise<string[]> {
  const [processedFiles, indexFiles] = await Promise.all([
    listFilesIfExists(processedDir),
    listFilesIfExists(indexDir),
  ]);
  const names = new Set<string>();

  for (const file of processedFiles) {
    const name = basename(file);
    if (name.startsWith('index')) names.add(name);
  }

  for (const file of indexFiles) {
    names.add(basename(file));
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

async function listFilesIfExists(dir: string, relativeDir = ''): Promise<string[]> {
  try {
    const entries = await readdir(join(dir, relativeDir), { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const relativePath = relativeDir ? join(relativeDir, entry.name) : entry.name;
      if (entry.isDirectory()) {
        const nestedFiles = await listFilesIfExists(dir, relativePath);
        files.push(...nestedFiles);
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }

    return files;
  } catch {
    return [];
  }
}

async function readTextIfExists(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return '';
  }
}

async function readJsonIfExists(path: string): Promise<JsonRecord | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf-8'));
    return recordFrom(parsed);
  } catch {
    return null;
  }
}

function recordFrom(value: unknown): JsonRecord | null {
  if (!value || Array.isArray(value) || typeof value !== 'object') return null;
  return value as JsonRecord;
}

function readYamlScalar(raw: string, key: string): string {
  const match = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(raw);
  return match ? match[1].trim() : '';
}

function toCoverageModule(file: string): string {
  const stem = basename(file, extname(file));
  return stem.replace(/^\d+_/, '').replace(/_/g, ' ');
}

function numberFrom(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function stringFrom(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function booleanFrom(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}
