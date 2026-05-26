import { join } from 'path';
import { readFile, writeFile } from 'fs/promises';
import { getVectorStoreDir } from '@/lib/config/settings';
import { SubjectManager } from '@/lib/subjects/subject_manager';
import { loadDocumentsFromKnowledgeBase } from './document_loader';
import { splitDocuments } from './text_splitter';
import { LocalVectorStore } from './vector_store';
import type { RetrievedChunk } from './types';

export interface IngestResult {
  subject: string;
  document_count: number;
  chunk_count: number;
  index_path: string;
  manifest_path: string;
}

export interface KnowledgeBaseManifest {
  subject: string;
  file_count: number;
  chunk_count: number;
  indexed: boolean;
  manifest_updated_at: string;
  index_path: string;
}

export async function ingestSubjectKnowledge(subjectName: string, manager = new SubjectManager()): Promise<IngestResult> {
  const subject = await manager.getSubject(await manager.validateSubject(subjectName));
  const documents = await loadDocumentsFromKnowledgeBase(subject.name, subject.knowledge_base_path);
  const chunks = splitDocuments(documents);
  const indexPath = getSubjectIndexPath(subject.name);
  await new LocalVectorStore(indexPath).save(subject.name, chunks);
  const manifestPath = getSubjectManifestPath(subject.name);
  await writeKnowledgeManifest(manifestPath, {
    subject: subject.name,
    file_count: documents.length,
    chunk_count: chunks.length,
    indexed: true,
    manifest_updated_at: new Date().toISOString(),
    index_path: indexPath,
  });

  return {
    subject: subject.name,
    document_count: documents.length,
    chunk_count: chunks.length,
    index_path: indexPath,
    manifest_path: manifestPath,
  };
}

export async function retrieveLocalChunks(
  query: string,
  subjectName: string,
  manager = new SubjectManager(),
): Promise<RetrievedChunk[]> {
  const subject = await manager.getSubject(await manager.validateSubject(subjectName));
  const indexPath = getSubjectIndexPath(subject.name);
  const store = new LocalVectorStore(indexPath);

  try {
    return await store.search(query, subject.retrieval.top_k);
  } catch {
    await ingestSubjectKnowledge(subject.name, manager);
    return store.search(query, subject.retrieval.top_k);
  }
}

function getSubjectIndexPath(subject: string): string {
  return join(getVectorStoreDir(), `${subject}.json`);
}

export function getSubjectManifestPath(subject: string): string {
  return join(getVectorStoreDir(), `${subject}.manifest.json`);
}

export async function readKnowledgeManifest(subject: string): Promise<KnowledgeBaseManifest> {
  try {
    return JSON.parse(await readFile(getSubjectManifestPath(subject), 'utf-8')) as KnowledgeBaseManifest;
  } catch {
    return {
      subject,
      file_count: 0,
      chunk_count: 0,
      indexed: false,
      manifest_updated_at: '',
      index_path: getSubjectIndexPath(subject),
    };
  }
}

async function writeKnowledgeManifest(path: string, manifest: KnowledgeBaseManifest): Promise<void> {
  await writeFile(path, JSON.stringify(manifest, null, 2), 'utf-8');
}
