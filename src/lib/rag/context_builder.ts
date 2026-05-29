import type { RetrievalResult } from './hybrid_retriever';

export interface ContextBlock {
  ref: string; // [C1], [C2], ...
  chunkId: string;
  subject: string;
  title: string;
  section: string;
  contentType: string;
  sourceFile: string;
  text: string;
  score: number;
}

/**
 * Build structured context blocks from retrieval results.
 */
export function buildContextBlocks(results: RetrievalResult[]): ContextBlock[] {
  return results.map((result, index) => ({
    ref: `[C${index + 1}]`,
    chunkId: result.chunk.id,
    subject: result.chunk.subject,
    title: result.chunk.title,
    section: result.chunk.sectionPath.join(' > '),
    contentType: result.chunk.contentType,
    sourceFile: result.chunk.sourceFile,
    text: result.chunk.text,
    score: result.score,
  }));
}

/**
 * Format context blocks as a string for the LLM prompt.
 * Each block includes structured metadata for traceability.
 */
export function formatContextForPrompt(blocks: ContextBlock[]): string {
  if (blocks.length === 0) {
    return '（未检索到相关知识库内容）';
  }

  return blocks.map((block) => {
    const inlineFormulas = block.text.match(/\\\([^)]*\\\)/g) ?? [];
    const blockFormulas = block.text.match(/\\\[[\s\S]*?\\\]/g) ?? [];
    const allFormulas = [...inlineFormulas, ...blockFormulas].slice(0, 5);
    const formulaLine = allFormulas.length > 0
      ? `formulas: ${allFormulas.join(' ')}`
      : '';

    return [
      `${block.ref} [chunk_id: ${block.chunkId}]`,
      `subject: ${block.subject}`,
      `title: ${block.title}`,
      `section: ${block.section}`,
      `content_type: ${block.contentType}`,
      `source: skills/${block.subject}/knowledge_base/${block.sourceFile}`,
      formulaLine,
      '',
      block.text,
    ].filter(Boolean).join('\n');
  }).join('\n\n---\n\n');
}

/**
 * Build a citation list from context blocks for the answer to reference.
 */
export function buildCitationList(blocks: ContextBlock[]): Array<{
  ref: string;
  chunkId: string;
  title: string;
  source: string;
}> {
  return blocks.map((b) => ({
    ref: b.ref,
    chunkId: b.chunkId,
    title: b.title,
    source: `skills/${b.subject}/knowledge_base/${b.sourceFile}`,
  }));
}

/**
 * Build the complete RAG prompt with context, question, and instructions.
 */
export function buildRagPrompt(options: {
  question: string;
  subject: string;
  taskType: string;
  contextBlocks: ContextBlock[];
  systemPrompt?: string;
}): string {
  const { question, subject, taskType, contextBlocks, systemPrompt } = options;
  const contextStr = formatContextForPrompt(contextBlocks);
  const citations = buildCitationList(contextBlocks);

  const citationGuide = citations.length > 0
    ? `可用的引用来源（请在回答中使用 [C1], [C2] 等标记引用）：\n${citations.map((c) => `${c.ref} ${c.title} (${c.source})`).join('\n')}`
    : '';

  return [
    systemPrompt ? `系统指令：${systemPrompt}\n` : '',
    `学科：${subject}`,
    `任务类型：${taskType}`,
    '',
    '## 检索到的知识库内容',
    contextStr,
    '',
    citationGuide,
    '',
    '## 用户问题',
    question,
    '',
    '## 回答要求',
    '1. 基于上述检索内容回答，不确定时明确说明',
    '2. 不要编造知识库中没有的内容',
    '3. 使用 [C1], [C2] 等标记引用来源',
    '4. 对教学问题要包含步骤、解释和例子',
    '5. 对公式问题要解释每个符号',
    '6. 对代码问题要给出可运行示例',
  ].join('\n');
}
