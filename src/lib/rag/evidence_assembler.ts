import type {
  Citation,
  RagEvidenceBlock,
  RagEvidencePack,
  RagTaskType,
  RetrievedChunk,
  WebSearchResult,
} from './types';

export function assembleEvidencePack(input: {
  subject: string;
  question: string;
  taskType: RagTaskType;
  localChunks: RetrievedChunk[];
  webResults: WebSearchResult[];
  citations: Citation[];
}): RagEvidencePack {
  const localBlocks = input.localChunks.map((chunk, index): RagEvidenceBlock => ({
    ref: `[L${index + 1}]`,
    source_type: 'local',
    source: chunk.metadata.file_name,
    content: chunk.content,
    score: chunk.score,
    metadata: {
      chunk_id: chunk.metadata.chunk_id,
      page: chunk.metadata.page,
      lexical_score: chunk.metadata.lexical_score,
      embedding_score: chunk.metadata.embedding_score,
    },
  }));

  const webBlocks = input.webResults.map((result, index): RagEvidenceBlock => ({
    ref: `[W${index + 1}]`,
    source_type: 'web',
    source: result.url,
    content: result.snippet,
    score: 0,
    metadata: {
      title: result.title,
      url: result.url,
    },
  }));

  return {
    subject: input.subject,
    question: input.question,
    task_type: input.taskType,
    no_evidence: localBlocks.length === 0 && webBlocks.length === 0,
    local_blocks: localBlocks,
    web_blocks: webBlocks,
    guidance: 'Local course evidence [Lx] is primary. Web evidence [Wx] is supplementary. Do not invent citations.',
  };
}

export function evidencePackToPrompt(pack: RagEvidencePack): string {
  const local = pack.local_blocks.map((block) => (
    `${block.ref} local course material source=${block.source} score=${block.score.toFixed(3)}\n${block.content}`
  )).join('\n\n');
  const web = pack.web_blocks.map((block) => (
    `${block.ref} web supplementary material source=${block.source}\n${block.content}`
  )).join('\n\n');
  return [
    `Subject: ${pack.subject}`,
    `Question: ${pack.question}`,
    `Task type: ${pack.task_type}`,
    `No evidence: ${pack.no_evidence ? 'yes' : 'no'}`,
    `Guidance: ${pack.guidance}`,
    'Local evidence:',
    local || 'None.',
    'Web evidence:',
    web || 'None.',
  ].join('\n\n');
}
