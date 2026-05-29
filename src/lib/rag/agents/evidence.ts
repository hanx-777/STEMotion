import type { Citation } from '../types';
import type { RagMultiAgentContext } from './types';

export interface CitationRef {
  type: 'L' | 'W';
  index: number;
  label: string;
}

export function buildEvidencePack(context: RagMultiAgentContext): string {
  const citations = formatCitations(context.citations);
  const chunks = context.retrievedChunks
    .slice(0, 8)
    .map((chunk, index) => {
      const sourceType = chunk.metadata.source_type ?? 'local';
      const source = chunk.metadata.title ?? chunk.metadata.file_name ?? chunk.metadata.source;
      const content = chunk.content.length > 700 ? `${chunk.content.slice(0, 700)}...` : chunk.content;
      return `Chunk ${index + 1} (${sourceType}, score=${chunk.score.toFixed(3)}, source=${source})\n${content}`;
    })
    .join('\n\n');

  return [
    `Subject: ${context.subjectDisplayName} (${context.subject})`,
    `Task type: ${context.taskType}`,
    `Question: ${context.question}`,
    `No evidence: ${context.citations.length === 0 ? 'yes' : 'no'}`,
    'Locked citations:',
    citations || 'None. Reviewers must not invent [Lx] or [Wx].',
    'Retrieved chunks:',
    chunks || 'None.',
  ].join('\n\n');
}

export function formatCitations(citations: Citation[]): string {
  let localIndex = 0;
  let webIndex = 0;
  return citations.map((citation) => {
    if (citation.source_type === 'local') {
      localIndex += 1;
      return `[L${localIndex}] local course material: ${citation.file_name}; chunk_id=${citation.chunk_id}; page=${citation.page ?? 'N/A'}`;
    }
    webIndex += 1;
    return `[W${webIndex}] web supplementary material: ${citation.title}; url=${citation.url}; snippet=${citation.snippet}`;
  }).join('\n');
}

export function allowedCitationRefs(citations: Citation[]): Set<string> {
  const refs = new Set<string>();
  let localIndex = 0;
  let webIndex = 0;
  for (const citation of citations) {
    if (citation.source_type === 'local') {
      localIndex += 1;
      refs.add(`[L${localIndex}]`);
    } else {
      webIndex += 1;
      refs.add(`[W${webIndex}]`);
    }
  }
  return refs;
}

export function findCitationRefs(text: string): CitationRef[] {
  return [...text.matchAll(/\[([LW])(\d+)\]/g)].map((match) => {
    const type = match[1] as 'L' | 'W';
    const index = Number(match[2]);
    return { type, index, label: `[${type}${index}]` };
  });
}

export function answerWithSections(context: Pick<RagMultiAgentContext, 'answer' | 'answerSections'>): string {
  return [
    context.answer,
    ...context.answerSections.map((section) => `${section.title}\n${section.content}`),
  ].join('\n\n');
}

export function findMissingCitationRefs(text: string, citations: Citation[]): CitationRef[] {
  const allowed = allowedCitationRefs(citations);
  return findCitationRefs(text).filter((ref) => !allowed.has(ref.label));
}
