import type { Citation, RetrievedChunk, SourceSummary, WebSearchResult } from './types';

export function buildCitations(localChunks: RetrievedChunk[], webResults: WebSearchResult[]): Citation[] {
  const localCitations = dedupeLocalCitations(localChunks).map<Citation>((chunk) => ({
    source_type: 'local',
    source: chunk.metadata.source,
    page: chunk.metadata.page,
    chunk_id: chunk.metadata.chunk_id,
    subject: chunk.metadata.subject,
    file_name: chunk.metadata.file_name,
  }));

  const webCitations = webResults.map<Citation>((result) => ({
    source_type: 'web',
    title: result.title,
    url: result.url,
    snippet: result.snippet,
  }));

  return [...localCitations, ...webCitations];
}

export function summarizeSources(citations: Citation[]): SourceSummary {
  return {
    local_count: citations.filter((citation) => citation.source_type === 'local').length,
    web_count: citations.filter((citation) => citation.source_type === 'web').length,
  };
}

function dedupeLocalCitations(chunks: RetrievedChunk[]): RetrievedChunk[] {
  const seen = new Set<string>();
  return chunks.filter((chunk) => {
    const key = `${chunk.metadata.source}:${chunk.metadata.page ?? ''}:${chunk.metadata.chunk_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
