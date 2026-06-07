export const RAG_TO_LAB_PREFILL_KEY = 'stemotion.ragLabBridge.prefillPrompt';
export const RAG_TO_LAB_ROUTE = '/lab?from=rag-bridge';

export type RagLabBridgeMode = 'student' | 'teacher';

export interface RagLabBridgeCitation {
  source_type?: 'local' | 'web' | string;
  source?: string;
  page?: number;
  chunk_id?: string;
  subject?: string;
  file_name?: string;
  title?: string;
  url?: string;
  snippet?: string;
}

export interface RagLabBridgeSource {
  content?: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface BuildLabPromptInput {
  mode: RagLabBridgeMode;
  subject: string;
  subjectDisplayName?: string;
  question: string;
  answer: string;
  citations?: RagLabBridgeCitation[];
  sources?: RagLabBridgeSource[];
}

const NO_SOURCE_NOTICE = '来源：基于当前 RAG 回答摘要，未附加引用明细';

export function buildLabPromptFromRagResult(input: BuildLabPromptInput) {
  const question = normalizeText(input.question);
  const answerSummary = clipText(normalizeText(input.answer), 620);
  const topic = inferTopic(question);
  const subjectLabel = input.subjectDisplayName?.trim() || input.subject;
  const modeGuidance = input.mode === 'teacher'
    ? '课堂演示、教学目标、互动问题、板书或练习衔接'
    : '帮助学生理解、观察规律、纠正常见误解';
  const sceneLabel = input.mode === 'teacher' ? '教师教学 / 课堂演示' : '学生学习 / 自主探究';
  const sourceBlock = buildSourceBlock(input.citations, input.sources);

  return [
    '请基于当前 RAG 回答设计一个可交互的 Lab 实验。',
    '',
    `主题：${topic}`,
    `学科：${subjectLabel}`,
    `使用场景：${sceneLabel}`,
    `源 Prompt：${question}`,
    '',
    `教学目标：围绕“${topic}”建立可观察、可操作的互动实验，${modeGuidance}。`,
    '可调参数：列出 2-4 个学习者可以拖动、输入或切换的变量，并说明参数范围与默认值。',
    '观察量：列出实验界面需要实时呈现的关键量、图像、轨迹、对比表或状态变化。',
    `建议交互方式：${input.mode === 'teacher'
      ? '适合课堂演示的分步播放、暂停提问、对比条件和板书或练习衔接。'
      : '适合学生自主尝试的拖动参数、即时反馈、规律提示和常见误解纠正。'}`,
    '',
    `RAG 回答摘要：${answerSummary}`,
    '',
    sourceBlock,
  ].join('\n');
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function clipText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function inferTopic(question: string) {
  const cleaned = question.replace(/[？?。.!！；;].*$/u, '').trim();
  return clipText(cleaned || '当前 RAG 问题', 80);
}

function buildSourceBlock(citations: RagLabBridgeCitation[] = [], sources: RagLabBridgeSource[] = []) {
  const lines = [
    ...citations.map(formatCitationLine),
    ...sources.map(formatSourceLine),
  ].filter(Boolean) as string[];
  const uniqueLines = Array.from(new Set(lines)).slice(0, 6);

  if (uniqueLines.length === 0) return NO_SOURCE_NOTICE;

  return [
    '来源：仅使用当前 RAG 结果中已提供的引用或检索片段，不新增外部来源。',
    ...uniqueLines.map((line, index) => `${index + 1}. ${line}`),
  ].join('\n');
}

function formatCitationLine(citation: RagLabBridgeCitation) {
  if (citation.source_type === 'web') {
    const title = citation.title?.trim();
    const url = citation.url?.trim();
    const snippet = citation.snippet ? `：${clipText(normalizeText(citation.snippet), 120)}` : '';
    if (title && url) return `网络资料：${title} (${url})${snippet}`;
    if (title) return `网络资料：${title}${snippet}`;
    if (url) return `网络资料：${url}${snippet}`;
    return '';
  }

  const fileName = citation.file_name?.trim() || citation.source?.trim();
  const chunkId = citation.chunk_id?.trim();
  const page = citation.page ? `，页码 ${citation.page}` : '';
  if (fileName && chunkId) return `本地课程资料：${fileName}${page}，片段 ${chunkId}`;
  if (fileName) return `本地课程资料：${fileName}${page}`;
  if (chunkId) return `本地课程资料片段：${chunkId}`;
  return '';
}

function formatSourceLine(source: RagLabBridgeSource) {
  const metadata = source.metadata ?? {};
  const name = stringMeta(metadata.file_name)
    || stringMeta(metadata.title)
    || stringMeta(metadata.source)
    || stringMeta(metadata.chunk_id);
  const content = source.content ? clipText(normalizeText(source.content), 120) : '';
  if (name && content) return `检索片段：${name}：${content}`;
  if (name) return `检索片段：${name}`;
  if (content) return `检索片段：${content}`;
  return '';
}

function stringMeta(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}
