import { readdir, readFile, stat } from 'fs/promises';
import { basename, extname, join, relative } from 'path';
import type { RagDocument } from './types';

const SUPPORTED_EXTENSIONS = new Set(['.md', '.txt', '.pdf']);

export async function loadDocumentsFromKnowledgeBase(subject: string, knowledgeBasePath: string): Promise<RagDocument[]> {
  const files = await listKnowledgeFiles(knowledgeBasePath);
  const documents = await Promise.all(files.map((file) => loadKnowledgeFile(subject, knowledgeBasePath, file)));
  return documents.flat().filter((doc) => doc.content.trim().length > 0);
}

async function listKnowledgeFiles(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const fullPath = join(root, entry.name);
      if (entry.isDirectory()) {
        files.push(...await listKnowledgeFiles(fullPath));
      } else if (entry.isFile() && SUPPORTED_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        files.push(fullPath);
      }
    }

    return files;
  } catch {
    return [];
  }
}

async function loadKnowledgeFile(subject: string, root: string, filePath: string): Promise<RagDocument[]> {
  const fileStat = await stat(filePath);
  const extension = extname(filePath).toLowerCase();
  const source = relative(root, filePath).replace(/\\/g, '/');
  const baseMetadata = {
    source,
    subject,
    file_name: basename(filePath),
    created_at: fileStat.mtime.toISOString(),
  };

  if (extension === '.pdf') {
    const pages = await extractPdfText(filePath);
    return pages.map((content, index) => ({
      content,
      metadata: {
        ...baseMetadata,
        page: index + 1,
      },
    }));
  }

  return [{
    content: await readFile(filePath, 'utf-8'),
    metadata: baseMetadata,
  }];
}

async function extractPdfText(filePath: string): Promise<string[]> {
  const buffer = await readFile(filePath);
  const raw = buffer.toString('latin1');
  const textObjects = Array.from(raw.matchAll(/\(([^()]{4,})\)\s*Tj/g)).map((match) => decodePdfLiteral(match[1]));
  const fallbackText = raw
    .replace(/[^\x20-\x7E\u4e00-\u9fff]+/g, ' ')
    .split(/\s{2,}/)
    .filter((part) => part.trim().length > 24)
    .join('\n');

  const extracted = textObjects.join('\n').trim() || fallbackText.trim();
  return extracted ? [extracted] : [];
}

function decodePdfLiteral(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}
