import { generateWithConfiguredModel, type LlmGenerateOptions } from '@/lib/generation/llmClient';
import { createLogger } from '@/lib/logger';
import { SubjectManager } from '@/lib/subjects/subject_manager';
import { buildCitations, summarizeSources } from './citation';
import { retrieveLocalChunks } from './retriever';
import { createWebSearchProvider, type WebSearchProvider } from './web_search';
import type {
  AnswerSection,
  Citation,
  RagAskInput,
  RagAskResult,
  RagTaskType,
  RetrievedChunk,
  VisualizationHint,
  WebSearchResult,
} from './types';

const log = createLogger('rag:pipeline');
const DISCLAIMER = 'AI 生成内容，仅供学习参考，请结合课程教材与教师要求核验。';
const NO_EVIDENCE = '当前知识库和网络检索中未找到可靠依据。';

interface RagPipelineOptions {
  manager?: SubjectManager;
  webSearchProvider?: WebSearchProvider;
  answerGenerator?: (options: LlmGenerateOptions) => Promise<string>;
}

export async function askRag(input: RagAskInput, options: RagPipelineOptions = {}): Promise<RagAskResult> {
  const question = input.question?.trim();
  if (!question) throw new Error('question is required');
  const taskType = normalizeTaskType(input.task_type);

  const manager = options.manager ?? new SubjectManager();
  const subjectName = await manager.validateSubject(input.subject);
  const subject = await manager.getSubject(subjectName);
  const localChunks = await retrieveLocalChunks(question, subject.name, manager);
  const topLocalScore = localChunks[0]?.score ?? 0;
  const reliableLocalChunks = topLocalScore >= subject.retrieval.score_threshold
    ? localChunks.filter((chunk) => chunk.score >= subject.retrieval.score_threshold)
    : [];
  const shouldUseWeb = Boolean(input.use_web_search ?? subject.retrieval.enable_web_search)
    && subject.retrieval.enable_web_search
    && topLocalScore < subject.retrieval.score_threshold;

  const webResults = shouldUseWeb
    ? await (options.webSearchProvider ?? createWebSearchProvider()).search(question, subject.name, subject.retrieval.web_top_k)
    : [];

  const citations = buildCitations(reliableLocalChunks, webResults);
  const retrievedChunks = [...reliableLocalChunks, ...webResultsToRetrievedChunks(webResults, subject.name)];
  const visualizationHint = createVisualizationHint(question);
  const answer = await generateGroundedAnswer(
    question,
    taskType,
    subject.system_prompt,
    subject.answer_template,
    reliableLocalChunks,
    webResults,
    options.answerGenerator ?? generateWithConfiguredModel,
  );
  const answerSections = buildAnswerSections({
    taskType,
    question,
    answer,
    citations,
    visualizationHint,
    localChunks: reliableLocalChunks,
    webResults,
  });

  return {
    subject: subject.name,
    subject_display_name: subject.display_name,
    task_type: taskType,
    answer,
    answer_sections: answerSections,
    visualization_hint: visualizationHint,
    citations,
    retrieved_chunks: retrievedChunks,
    source_summary: summarizeSources(citations),
  };
}

async function generateGroundedAnswer(
  question: string,
  taskType: RagTaskType,
  systemPrompt: string,
  answerTemplate: string,
  localChunks: RetrievedChunk[],
  webResults: WebSearchResult[],
  answerGenerator: (options: LlmGenerateOptions) => Promise<string>,
): Promise<string> {
  const prompt = buildUserPrompt(question, taskType, answerTemplate, localChunks, webResults);
  try {
    const answer = await answerGenerator({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      maxTokens: 4096,
      stream: false,
    });
    return withDisclaimer(withNoEvidenceNotice(answer.trim(), localChunks, webResults));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    log.error('RAG LLM answer failed', {
      error: detail,
    });
    throw new Error(`模型回答生成失败，请检查 /settings 模型配置或 API Key。原始错误：${detail}`);
  }
}

function withNoEvidenceNotice(answer: string, localChunks: RetrievedChunk[], webResults: WebSearchResult[]): string {
  if (localChunks.length > 0 || webResults.length > 0 || answer.includes(NO_EVIDENCE)) {
    return answer;
  }
  return `${NO_EVIDENCE}以下为模型通用知识推理，仅供学习参考。\n\n${answer}`;
}

function buildUserPrompt(
  question: string,
  taskType: RagTaskType,
  answerTemplate: string,
  localChunks: RetrievedChunk[],
  webResults: WebSearchResult[],
): string {
  const localContext = localChunks.map((chunk, index) => (
    `[L${index + 1}] source=${chunk.metadata.source} page=${chunk.metadata.page ?? 'N/A'} chunk_id=${chunk.metadata.chunk_id}\n${chunk.content}`
  )).join('\n\n');

  const webContext = webResults.map((result, index) => (
    `[W${index + 1}] title=${result.title} url=${result.url}\n${result.snippet}`
  )).join('\n\n');
  const hasEvidence = localChunks.length > 0 || webResults.length > 0;
  const evidenceInstruction = hasEvidence
    ? '请优先基于本地知识库生成回答；网络检索结果仅作为补充参考。本地来源用 [L1]、[L2] 标注，网络来源用 [W1]、[W2] 标注。'
    : `当前没有可靠的本地知识库来源或网络检索来源。你仍需调用通用学科知识回答，但必须明确写出“${NO_EVIDENCE}以下为模型通用知识推理，仅供学习参考”，不得编造引用，不得使用 [L1]、[W1] 等来源标注。`;

  return `问题：${question}

任务类型：${taskTypeLabel(taskType)}

回答模板：
${answerTemplate}

本地知识库来源：
${localContext || '无可靠本地课程资料'}

网络检索来源：
${webContext || '无可靠网络补充资料'}

RAG 使用原则：
RAG 只提供上下文和引用依据，最终回答必须由你生成。
${evidenceInstruction}
所有关键结论都要尽量给出来源；没有可靠来源时必须说明依据不足，不能编造出处。

结构要求：
${taskInstructions(taskType)}`;
}

function webResultsToRetrievedChunks(results: WebSearchResult[], subject: string): RetrievedChunk[] {
  return results.map((result, index) => ({
    content: result.snippet,
    score: 0,
    metadata: {
      source: result.url,
      subject,
      file_name: result.title,
      chunk_id: `${subject}_web_${index + 1}`,
      created_at: new Date().toISOString(),
      source_type: 'web',
      title: result.title,
      url: result.url,
      snippet: result.snippet,
    },
  }));
}

function withDisclaimer(answer: string): string {
  return answer.includes(DISCLAIMER) ? answer : `${answer}\n\n${DISCLAIMER}`;
}

function normalizeTaskType(value: RagAskInput['task_type']): RagTaskType {
  const allowed: RagTaskType[] = ['knowledge_qa', 'step_solution', 'misconception_diagnosis', 'teacher_prep'];
  return value && allowed.includes(value) ? value : 'step_solution';
}

function taskTypeLabel(taskType: RagTaskType): string {
  const labels: Record<RagTaskType, string> = {
    knowledge_qa: '知识问答',
    step_solution: '分步解题',
    misconception_diagnosis: '错因诊断',
    teacher_prep: '教师备课',
  };
  return labels[taskType];
}

function taskInstructions(taskType: RagTaskType): string {
  if (taskType === 'knowledge_qa') {
    return '按“核心概念、关键依据、学习建议、引用来源”组织。';
  }
  if (taskType === 'misconception_diagnosis') {
    return '按“学生可能误解、错误原因、纠正思路、巩固练习、引用来源”组织。';
  }
  if (taskType === 'teacher_prep') {
    return '按“教学目标、课堂导入、板书推导、互动提问、可视化演示、引用来源”组织。';
  }
  return '按“题目信息提取、物理模型判断、分步推导、结果、易错点、引用来源”组织。';
}

function buildAnswerSections({
  taskType,
  question,
  answer,
  citations,
  visualizationHint,
}: {
  taskType: RagTaskType;
  question: string;
  answer: string;
  citations: Citation[];
  visualizationHint?: VisualizationHint;
  localChunks: RetrievedChunk[];
  webResults: WebSearchResult[];
}): AnswerSection[] {
  const citationText = formatCitationText(citations);
  const cleanAnswer = answer.replace(DISCLAIMER, '').trim();

  if (taskType === 'knowledge_qa') {
    return [
      { id: 'concept', title: '核心概念', content: cleanAnswer || '暂无结构化内容。' },
      { id: 'evidence', title: '关键依据', content: sourcePriorityText(citations) },
      { id: 'study_hint', title: '学习建议', content: '建议先核对本地课程资料中的定义、公式适用条件和例题，再结合教师课堂要求整理笔记。' },
      { id: 'citations', title: '引用来源', content: citationText },
    ];
  }

  if (taskType === 'misconception_diagnosis') {
    return [
      { id: 'misconception', title: '学生可能误解', content: cleanAnswer || '暂无结构化内容。' },
      { id: 'cause', title: '错误原因', content: '重点检查是否混淆模型条件、公式适用范围、速度分解或单位换算。' },
      { id: 'correction', title: '纠正思路', content: '先回到物理模型，再列已知量和待求量，最后按公式条件逐步代入。' },
      { id: 'practice', title: '巩固练习', content: '可改变初速度、角度或落地点高度，比较结果变化并解释原因。' },
      { id: 'citations', title: '引用来源', content: citationText },
    ];
  }

  if (taskType === 'teacher_prep') {
    return [
      { id: 'objectives', title: '教学目标', content: '让学生能识别物理模型、解释公式来源，并能用引用资料核验关键结论。' },
      { id: 'intro', title: '课堂导入', content: cleanAnswer || '暂无结构化内容。' },
      { id: 'blackboard', title: '板书推导', content: visualizationHint ? projectileFormulaText(visualizationHint) : '暂无可自动生成的板书参数。' },
      { id: 'questions', title: '互动提问', content: '可以追问：角度变化会怎样影响最大高度和射程？忽略空气阻力意味着什么？' },
      { id: 'visualization', title: '可视化演示', content: visualizationHint ? visualizationText(visualizationHint) : '暂无可视化参数。' },
      { id: 'citations', title: '引用来源', content: citationText },
    ];
  }

  return [
    { id: 'extract', title: '题目信息提取', content: extractProblemInfo(question, visualizationHint) },
    { id: 'model', title: '物理模型判断', content: visualizationHint ? '该问题属于斜抛运动模型。默认将小球视为质点，忽略空气阻力，重力加速度方向竖直向下。' : '暂无可自动识别的物理模型，请结合题干补充模型条件。' },
    { id: 'derivation', title: '分步推导', content: cleanAnswer || '暂无结构化内容。' },
    { id: 'result', title: '结果', content: visualizationHint ? projectileResultText(visualizationHint) : '暂无可自动计算的结果。' },
    { id: 'pitfalls', title: '易错点', content: '1. 不能不分解初速度就直接套用竖直方向公式。\n2. 同高落地射程公式只适用于发射点和落地点高度相同的情况。\n3. 角度要按三角函数正确代入，单位需要统一。' },
    { id: 'citations', title: '引用来源', content: citationText },
  ];
}

function createVisualizationHint(question: string): VisualizationHint | undefined {
  if (!/(抛|斜抛|projectile)/i.test(question)) return undefined;
  const v0 = matchNumber(question, /(\d+(?:\.\d+)?)\s*(?:m\/s|米\/秒|米每秒)/i);
  const angle = matchNumber(question, /(\d+(?:\.\d+)?)\s*(?:°|度)/);
  const g = matchNumber(question, /g\s*[=＝]?\s*(\d+(?:\.\d+)?)/i) ?? 9.8;
  return {
    type: 'projectile_motion',
    parameters: {
      v0,
      angle_deg: angle,
      g,
    },
  };
}

function matchNumber(value: string, pattern: RegExp): number | undefined {
  const matched = pattern.exec(value);
  if (!matched) return undefined;
  const parsed = Number(matched[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function projectileResultText(hint: VisualizationHint): string {
  const { v0, angle_deg: angle, g } = hint.parameters;
  if (typeof v0 !== 'number' || typeof angle !== 'number') {
    return '已识别为斜抛运动，但缺少完整初速度或角度参数，暂不自动计算数值结果。';
  }
  const theta = angle * Math.PI / 180;
  const height = (v0 ** 2 * Math.sin(theta) ** 2) / (2 * g);
  const range = (v0 ** 2 * Math.sin(2 * theta)) / g;
  const flightTime = (2 * v0 * Math.sin(theta)) / g;
  return `最大高度 H ≈ ${height.toFixed(2)} m\n水平射程 R ≈ ${range.toFixed(2)} m\n飞行时间 T ≈ ${flightTime.toFixed(2)} s`;
}

function projectileFormulaText(hint: VisualizationHint): string {
  const { v0, angle_deg: angle, g } = hint.parameters;
  const known = typeof v0 === 'number' && typeof angle === 'number'
    ? `已知 v0 = ${v0} m/s，θ = ${angle}°，g = ${g} m/s²。`
    : `已识别斜抛模型，g = ${g} m/s²。`;
  return `${known}\n竖直方向：vy = v0 sinθ - gt。\n最高点：vy = 0，所以 H = v0² sin²θ / (2g)。\n同高落地：R = v0² sin(2θ) / g。`;
}

function visualizationText(hint: VisualizationHint): string {
  const { v0, angle_deg: angle, g } = hint.parameters;
  return `建议演示：斜抛运动轨迹。参数：v0=${v0 ?? '待补充'} m/s，θ=${angle ?? '待补充'}°，g=${g} m/s²。`;
}

function extractProblemInfo(question: string, hint?: VisualizationHint): string {
  if (!hint) return `题干：${question}`;
  const { v0, angle_deg: angle, g } = hint.parameters;
  return `题干：${question}\n已知：${typeof v0 === 'number' ? `v0 = ${v0} m/s` : '初速度待补充'}，${typeof angle === 'number' ? `θ = ${angle}°` : '角度待补充'}，g = ${g} m/s²。\n求解：通常关注最大高度 H、水平射程 R 或运动轨迹。`;
}

function formatCitationText(citations: Citation[]): string {
  if (citations.length === 0) return NO_EVIDENCE;
  return citations.map((citation, index) => {
    if (citation.source_type === 'local') {
      return `[${index + 1}] ${citation.file_name}（本地课程资料，${citation.chunk_id}）`;
    }
    return `[${index + 1}] ${citation.title}（网络补充资料，${citation.url}）`;
  }).join('\n');
}

function sourcePriorityText(citations: Citation[]): string {
  const localCount = citations.filter((citation) => citation.source_type === 'local').length;
  const webCount = citations.filter((citation) => citation.source_type === 'web').length;
  return `本回答优先基于本地知识库生成；网络检索结果仅作为补充参考。当前引用：本地课程资料 ${localCount} 条，网络补充资料 ${webCount} 条。`;
}
