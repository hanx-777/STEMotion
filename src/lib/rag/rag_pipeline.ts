import { generateWithConfiguredModel, type LlmGenerateOptions } from '@/lib/generation/llmClient';
import { createLogger } from '@/lib/logger';
import { SubjectManager } from '@/lib/subjects/subject_manager';
import { runRagMultiAgentOrchestrator } from './agents/rag_multi_agent_orchestrator';
import type { RagMultiAgentMode } from './agents/types';
import { assembleEvidencePack, evidencePackToPrompt } from './evidence_assembler';
import { buildJsonAnswerInstruction, parseRagAnswerDraft } from './answer_protocol';
import { buildCitations, summarizeSources } from './citation';
import { planRagQuery } from './query_planner';
import { reviewRagAnswer } from './quality_review';
import { retrieveHybridChunks, retrieveWithNewPipeline } from './retriever';
import {
  orchestrateRagVisualization,
  type RagVisualizationOrchestratorInput,
  type RagVisualizationOrchestratorResult,
} from './visualization/orchestrator';
import { createWebSearchProvider, type WebSearchProvider } from './web_search';
import type {
  AnswerSection,
  RagAskInput,
  RagAskResult,
  RagAnswerProtocol,
  RagFinalResult,
  RagFormulaBlock,
  RagRetrievalReport,
  RagTaskType,
  RetrievedChunk,
  VisualizationHint,
  WebSearchResult,
} from './types';

const log = createLogger('rag:pipeline');
const DISCLAIMER = 'AI 生成内容，仅供学习参考，请结合课程教材与教师要求核验。';
const NO_EVIDENCE = '当前知识库和网络检索中未找到可靠依据';

interface RagPipelineOptions {
  manager?: SubjectManager;
  webSearchProvider?: WebSearchProvider;
  answerGenerator?: (options: LlmGenerateOptions) => Promise<string>;
  reviewGenerator?: (options: LlmGenerateOptions) => Promise<string>;
  revisionGenerator?: (options: LlmGenerateOptions) => Promise<string>;
  visualizationOrchestrator?: (input: RagVisualizationOrchestratorInput) => Promise<RagVisualizationOrchestratorResult>;
  multiAgentMode?: RagMultiAgentMode;
  visualizationMode?: 'auto' | 'manual' | 'off';
}

interface GeneratedDraft {
  answerProtocol: RagAnswerProtocol;
  answer: string;
  answerSections: AnswerSection[];
  formulaBlocks: RagFormulaBlock[];
  finalResults: RagFinalResult[];
  visualizationHint?: VisualizationHint;
  parseWarning?: string;
}

export async function askRag(input: RagAskInput, options: RagPipelineOptions = {}): Promise<RagAskResult> {
  const question = input.question?.trim();
  if (!question) throw new Error('question is required');
  const taskType = normalizeTaskType(input.task_type);
  const visualizationMode = options.visualizationMode ?? 'auto';

  const manager = options.manager ?? new SubjectManager();
  const subjectName = await manager.validateSubject(input.subject);
  const subject = await manager.getSubject(subjectName);

  const queryPlan = planRagQuery(question, taskType);

  // Try new pipeline first, fall back to old
  let retrieval: { chunks: RetrievedChunk[]; report: RagRetrievalReport };
  try {
    const newResult = await retrieveWithNewPipeline(question, subject.name, manager);
    retrieval = {
      chunks: newResult.chunks,
      report: {
        local_candidate_count: newResult.chunks.length,
        local_reliable_count: newResult.chunks.filter((c) => c.score >= subject.retrieval.score_threshold).length,
        web_count: 0,
        top_local_score: newResult.chunks[0]?.score ?? 0,
        lexical_top_k: subject.retrieval.lexical_top_k ?? subject.retrieval.top_k,
        embedding_top_k: subject.retrieval.embedding_top_k ?? subject.retrieval.top_k,
        rerank_top_k: subject.retrieval.rerank_top_k ?? subject.retrieval.top_k,
        evidence_threshold: subject.retrieval.evidence_threshold ?? subject.retrieval.score_threshold,
        used_embedding: newResult.chunks.some((c) => (c.metadata.embedding_score ?? 0) > 0),
        triggered_web_search: false,
        low_evidence: newResult.chunks.filter((c) => c.score >= subject.retrieval.score_threshold).length === 0,
        rewritten_queries: queryPlan.rewritten_queries,
        keywords: queryPlan.keywords,
      },
    };
  } catch {
    retrieval = await retrieveHybridChunks(queryPlan, subject.name, manager);
  }

  const localChunks = retrieval.chunks.filter((chunk) => chunk.metadata.source_type !== 'web');
  const reliableLocalChunks = localChunks.filter((chunk) => chunk.score >= subject.retrieval.score_threshold);
  const topLocalScore = retrieval.report.top_local_score;

  const shouldUseWeb = Boolean(input.use_web_search ?? subject.retrieval.enable_web_search)
    && subject.retrieval.enable_web_search
    && (topLocalScore < subject.retrieval.score_threshold || retrieval.report.low_evidence);

  const webResults = shouldUseWeb
    ? await (options.webSearchProvider ?? createWebSearchProvider()).search(question, subject.name, subject.retrieval.web_top_k)
    : [];

  const citations = buildCitations(reliableLocalChunks, webResults);
  const retrievedChunks = [...reliableLocalChunks, ...webResultsToRetrievedChunks(webResults, subject.name)];
  const legacyVisualizationHint = createVisualizationHint(question);
  const retrievalReport = finalizeRetrievalReport(retrieval.report, webResults.length, shouldUseWeb);
  const evidencePack = assembleEvidencePack({
    subject: subject.name,
    question,
    taskType,
    localChunks: reliableLocalChunks,
    webResults,
    citations,
  });

  const draft = await generateAnswerDraft({
    question,
    taskType,
    subjectPrompt: subject.system_prompt,
    answerTemplate: subject.answer_template,
    evidencePack,
    localChunks: reliableLocalChunks,
    webResults,
    answerGenerator: options.answerGenerator ?? generateWithConfiguredModel,
    fallbackVisualizationHint: legacyVisualizationHint,
  });

  let visualizationResult: RagVisualizationOrchestratorResult | undefined;

  if (visualizationMode !== 'off') {
    visualizationResult = await (options.visualizationOrchestrator ?? orchestrateRagVisualization)({
      question,
      answerText: draft.answer,
      subject: subject.name,
      taskType,
      formulaBlocks: draft.formulaBlocks,
      finalResults: draft.finalResults,
    });

    if (visualizationMode === 'manual') {
      visualizationResult = {
        ...visualizationResult,
        spec: undefined,
        plan: {
          ...visualizationResult.plan,
          engine: 'none',
          reason: `${visualizationResult.plan.reason}；manual 模式跳过自动生成。`,
        },
      };
    }
  }

  const validatedVizSpec = visualizationMode === 'auto' ? visualizationResult?.spec : undefined;

  const visualizationHint = validatedVizSpec?.type === 'projectile_motion'
    ? { type: 'projectile_motion' as const, parameters: validatedVizSpec.parameters }
    : createVisualizationHint(question);

  const deterministicReport = reviewRagAnswer({
    question,
    taskType,
    answer: draft.answer,
    answerSections: draft.answerSections,
    citations,
    visualizationHint: draft.visualizationHint ?? visualizationHint,
    formulaBlocks: draft.formulaBlocks,
    answerProtocol: draft.answerProtocol,
    retrievalReport,
    evidencePack,
  });

  const multiAgentResult = await runRagMultiAgentOrchestrator(
    {
      question,
      subject: subject.name,
      subjectDisplayName: subject.display_name,
      taskType,
      answer: draft.answer,
      answerSections: draft.answerSections,
      answerProtocol: draft.answerProtocol,
      formulaBlocks: draft.formulaBlocks,
      finalResults: draft.finalResults,
      citations,
      retrievedChunks,
      visualizationHint: draft.visualizationHint ?? visualizationHint,
      retrievalReport,
      evidencePack,
      deterministicReport,
    },
    {
      mode: options.multiAgentMode,
      reviewGenerator: options.reviewGenerator ?? generateWithConfiguredModel,
      revisionGenerator: options.revisionGenerator ?? generateWithConfiguredModel,
      finalizeAnswer: (answer) => withDisclaimer(withNoEvidenceNotice(answer, reliableLocalChunks, webResults)),
      rebuildAnswerSections: (answer) => parseRagAnswerDraft({
        raw: answer,
        taskType,
        fallbackVisualizationHint: draft.visualizationHint ?? visualizationHint,
      }).sections,
      rerunDeterministicReview: (answer, answerSections) => reviewRagAnswer({
        question,
        taskType,
        answer,
        answerSections,
        citations,
        visualizationHint: draft.visualizationHint ?? visualizationHint,
        formulaBlocks: draft.formulaBlocks,
        answerProtocol: draft.answerProtocol,
        retrievalReport,
        evidencePack,
      }),
    },
  );

  const finalDraft = parseRagAnswerDraft({
    raw: multiAgentResult.answer,
    taskType,
    fallbackVisualizationHint: draft.visualizationHint ?? visualizationHint,
  });

  const shouldGenerateViz = visualizationMode === 'auto'
    && Boolean(validatedVizSpec)
    && (visualizationResult?.plan.shouldVisualize !== false);

  return {
    subject: subject.name,
    subject_display_name: subject.display_name,
    task_type: taskType,
    answer_protocol: finalDraft.protocol,
    answer: finalDraft.answer,
    answer_sections: multiAgentResult.answerSections.length > 0 ? multiAgentResult.answerSections : finalDraft.sections,
    formula_blocks: finalDraft.formulaBlocks,
    final_results: finalDraft.finalResults,
    visualization_hint: visualizationMode !== 'off' ? (finalDraft.visualizationHint ?? draft.visualizationHint ?? visualizationHint) : undefined,
    visualization_spec: visualizationMode === 'auto' ? validatedVizSpec : undefined,
    should_generate_visualization: shouldGenerateViz,
    citations,
    retrieved_chunks: retrievedChunks,
    source_summary: summarizeSources(citations),
    retrieval_report: retrievalReport,
    evidence_pack: evidencePack,
    quality_report: multiAgentResult.qualityReport,
  };
}

async function generateAnswerDraft(input: {
  question: string;
  taskType: RagTaskType;
  subjectPrompt: string;
  answerTemplate: string;
  evidencePack: ReturnType<typeof assembleEvidencePack>;
  localChunks: RetrievedChunk[];
  webResults: WebSearchResult[];
  answerGenerator: (options: LlmGenerateOptions) => Promise<string>;
  fallbackVisualizationHint?: VisualizationHint;
}): Promise<GeneratedDraft> {
  const prompt = buildUserPrompt(input.question, input.taskType, input.answerTemplate, input.evidencePack, input.localChunks, input.webResults);
  try {
    const raw = await input.answerGenerator({
      messages: [
        {
          role: 'system',
          content: [
            input.subjectPrompt,
            buildJsonAnswerInstruction(input.taskType),
            'Grounding rule: use only the evidence pack for cited claims. If evidence is insufficient, explicitly state that no reliable evidence was found, then answer with clearly marked general subject reasoning.',
          ].join('\n\n'),
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      requestPreset: 'answer',
    });

    const parsed = parseRagAnswerDraft({
      raw,
      taskType: input.taskType,
      fallbackVisualizationHint: input.fallbackVisualizationHint,
    });
    return {
      answerProtocol: parsed.protocol,
      answer: withDisclaimer(withNoEvidenceNotice(parsed.answer, input.localChunks, input.webResults)),
      answerSections: parsed.sections,
      formulaBlocks: parsed.formulaBlocks,
      finalResults: parsed.finalResults,
      visualizationHint: parsed.visualizationHint ?? input.fallbackVisualizationHint,
      parseWarning: parsed.parseWarning,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    log.error('RAG LLM answer failed', { error: detail });
    throw new Error(`模型回答生成失败，请检查 /settings 模型配置或 API Key。原始错误：${detail}`);
  }
}

function buildUserPrompt(
  question: string,
  taskType: RagTaskType,
  answerTemplate: string,
  evidencePack: ReturnType<typeof assembleEvidencePack>,
  localChunks: RetrievedChunk[],
  webResults: WebSearchResult[],
): string {
  const hasEvidence = localChunks.length > 0 || webResults.length > 0;
  const noEvidenceInstruction = hasEvidence
    ? 'Local course materials are primary. Web evidence is supplementary. Use [Lx] for local sources and [Wx] for web sources.'
    : `No reliable local or web evidence is available. You must still answer with general subject reasoning and explicitly include "${NO_EVIDENCE}" somewhere in the final answer. 不得编造引用，不得使用不存在的 [L1]/[W1]。`;

  return [
    `Question:\n${question}`,
    `Task type:\n${taskTypeLabel(taskType)}`,
    `Answer template:\n${answerTemplate}`,
    `Evidence instruction:\n${noEvidenceInstruction}`,
    'Output instruction:\nUse the JSON answer protocol. Keep formulas in formula_blocks and reference them naturally in sections.',
    'Formula rule:\nAll math formulas MUST use LaTeX. Inline: $f\'(x)$ or \\(f\'(x)\\). Display: $$f(x)=xe^{-x^2}$$ or \\[f(x)=xe^{-x^2}\\]. Never use plain text like e^(-x^2), sqrt(x), 1/2, x^2.',
    'Required section intent:',
    taskInstructions(taskType),
    'Evidence pack:',
    evidencePackToPrompt(evidencePack),
  ].join('\n\n');
}

function withNoEvidenceNotice(answer: string, localChunks: RetrievedChunk[], webResults: WebSearchResult[]): string {
  if (localChunks.length > 0 || webResults.length > 0 || answer.includes(NO_EVIDENCE)) {
    return answer;
  }
  return `${NO_EVIDENCE}。以下为模型通用知识推理，仅供学习参考。\n\n${answer}`;
}

function withDisclaimer(answer: string): string {
  return answer.includes(DISCLAIMER) ? answer : `${answer}\n\n${DISCLAIMER}`;
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
      retrieval_method: 'web',
      normalized_score: 0,
    },
  }));
}

function finalizeRetrievalReport(report: RagRetrievalReport, webCount: number, triggeredWebSearch: boolean): RagRetrievalReport {
  return {
    ...report,
    web_count: webCount,
    triggered_web_search: triggeredWebSearch,
    low_evidence: report.low_evidence && webCount === 0,
  };
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
    return 'Use sections: 核心概念, 关键依据, 学习建议, 引用来源.';
  }
  if (taskType === 'misconception_diagnosis') {
    return 'Use sections: 错误定位, 错因分析, 正确思路, 巩固练习, 引用来源.';
  }
  if (taskType === 'teacher_prep') {
    return 'Use sections: 教学目标, 课堂导入, 核心公式, 互动提问, 动态演示参数, 引用来源.';
  }
  return 'Use sections: 题目信息提取, 物理模型判断, 分步推导, 数值计算, 单位检查, 结论, 易错点, 引用来源.';
}

function createVisualizationHint(question: string): VisualizationHint | undefined {
  if (!/(斜抛|抛体|projectile)/i.test(question)) return undefined;
  const v0 = matchNumber(question, /(\d+(?:\.\d+)?)\s*(?:m\/s|米\/秒|mps)/i);
  const angle = matchNumber(question, /(\d+(?:\.\d+)?)\s*(?:°|度)/i);
  const g = matchNumber(question, /g\s*[=：:]?\s*(\d+(?:\.\d+)?)/i) ?? 9.8;
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
