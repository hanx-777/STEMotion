import type { RagChunk, RagDocument } from './types';

interface SplitOptions {
  chunkSize?: number;
  overlap?: number;
}

export function splitDocuments(documents: RagDocument[], options: SplitOptions = {}): RagChunk[] {
  const chunkSize = options.chunkSize ?? 900;
  const overlap = options.overlap ?? 140;
  const chunks: RagChunk[] = [];

  for (const document of documents) {
    const segments = splitText(document.content, chunkSize, overlap);
    segments.forEach((content, index) => {
      chunks.push({
        content,
        metadata: {
          ...document.metadata,
          chunk_id: createChunkId(document.metadata.subject, document.metadata.source, index),
        },
      });
    });
  }

  return chunks;
}

function splitText(text: string, chunkSize: number, overlap: number): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  if (normalized.length <= chunkSize) return [normalized];

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(start + chunkSize, normalized.length);
    const sentenceBoundary = normalized.slice(start, end).search(/[\n。！？.!?](?![\s\S]*[\n。！？.!?])/);
    if (sentenceBoundary > chunkSize * 0.45) end = start + sentenceBoundary + 1;

    chunks.push(normalized.slice(start, end).trim());
    if (end >= normalized.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks.filter(Boolean);
}

function createChunkId(subject: string, source: string, index: number): string {
  const safeSource = source.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `${subject}_${safeSource || 'chunk'}_${String(index + 1).padStart(3, '0')}`;
}
