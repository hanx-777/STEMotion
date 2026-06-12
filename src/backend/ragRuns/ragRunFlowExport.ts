import { AppError } from '../../platform/errors';
import { FileGenerationJobStore } from '../jobs/fileJobStore';
import type { GenerationJobEvent, GenerationJobSnapshot } from '../jobs/types';
import type { GenerationTraceEntry } from '../../lib/generation/trace';
import type { RagRunRecord } from '../../shared/api/ragRuns';
import type { RagSessionGenerationResult } from '../../shared/api/generationJobs';
import { FileRagRunStore } from './fileRagRunStore';
import { assertRagRunId } from './runIds';

export interface RagRunFlowJobReader {
  getJob?: (jobId: string) => Promise<GenerationJobSnapshot | null>;
  readJob?: (jobId: string) => Promise<GenerationJobSnapshot | null>;
  readEvents: (jobId: string) => Promise<GenerationJobEvent[]>;
  readTrace: (jobId: string) => Promise<GenerationTraceEntry[]>;
}

export interface RagRunFlowTimelineEntry {
  sequence: number;
  timestamp: string;
  source: 'run_store' | 'job_snapshot' | 'job_event' | 'generation_trace';
  stage?: string;
  description: string;
  ids: {
    runId: string;
    rootJobId?: string;
    jobId?: string;
    jobType?: string;
    eventSequence?: number;
    traceIndex?: number;
  };
  data: unknown;
}

export interface RagRunFlowExport {
  metadata: {
    exportedAt: string;
    runId: string;
    rootJobId: string;
    childJobIds: string[];
    status: RagRunRecord['status'];
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
    questionSummary?: unknown;
  };
  input: {
    originalQuestion?: string;
    normalizedRequest: Record<string, unknown>;
    inputSummary: Record<string, unknown>;
  };
  timeline: RagRunFlowTimelineEntry[];
  snapshots: {
    run: RagRunRecord;
    rootJob: GenerationJobSnapshot;
    rootEvents: GenerationJobEvent[];
    rootTrace: GenerationTraceEntry[];
    childJobs: Array<{
      snapshot: GenerationJobSnapshot;
      events: GenerationJobEvent[];
      trace: GenerationTraceEntry[];
    }>;
  };
  finalOutputs: {
    ragSessionGenerationResult?: RagSessionGenerationResult;
    ragAnswer?: unknown;
    modelResult?: unknown;
    visualizationArtifact?: unknown;
    qualityReport?: unknown;
    childQualityReviews: unknown[];
  };
  redaction: {
    policy: string;
    secretFields: string[];
    limitations: string[];
  };
}

interface ExportRagRunFlowOptions {
  runStore?: FileRagRunStore;
  jobReader?: RagRunFlowJobReader;
  exportedAt?: string;
}

type PendingTimelineEntry = Omit<RagRunFlowTimelineEntry, 'sequence'> & {
  sortTimestamp: string;
  sortOrder: number;
};

const SECRET_KEY_PATTERN = /(api[_-]?key|secret|token|password|cookie|authorization)/i;
const REDACTED = '[redacted]';

export async function exportRagRunFlow(
  runId: string,
  options: ExportRagRunFlowOptions = {},
): Promise<RagRunFlowExport> {
  const safeRunId = assertRagRunId(runId);
  const runStore = options.runStore ?? new FileRagRunStore();
  const jobReader = options.jobReader ?? new FileGenerationJobStore();

  const run = await runStore.readRun(safeRunId);
  if (!run) {
    throw new AppError('rag run not found', {
      status: 404,
      code: 'NOT_FOUND',
    });
  }

  const rootJob = await readJob(jobReader, run.rootJobId);
  if (!rootJob) {
    throw new AppError('rag run root job not found', {
      status: 404,
      code: 'NOT_FOUND',
    });
  }

  const rootEvents = await jobReader.readEvents(rootJob.id);
  const rootTrace = await jobReader.readTrace(rootJob.id);
  const childJobIds = collectChildJobIds(run, rootJob);
  const childJobs = await readChildJobs(jobReader, childJobIds);

  const ragSessionGenerationResult = asRagSessionGenerationResult(rootJob.result)
    ?? asRagSessionGenerationResult(run.lastResult);
  const ragAnswer = ragSessionGenerationResult?.answer
    ?? readEventPayload(rootEvents, 'answer_ready', 'result')
    ?? rootJob.result;
  const visualizationArtifact = ragSessionGenerationResult?.artifact
    ?? readEventPayload(rootEvents, 'artifact_ready', 'artifact');
  const qualityReport = readQualityReport(ragAnswer)
    ?? readEventPayload(rootEvents, 'quality_ready', 'qualityReport');
  const originalQuestion = readOriginalQuestion(ragSessionGenerationResult, rootJob, rootEvents, visualizationArtifact);

  const payload: RagRunFlowExport = {
    metadata: {
      exportedAt: options.exportedAt ?? new Date().toISOString(),
      runId: run.runId,
      rootJobId: run.rootJobId,
      childJobIds,
      status: run.status,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      ...(run.completedAt ? { completedAt: run.completedAt } : {}),
      ...(run.questionSummary !== undefined ? { questionSummary: run.questionSummary } : {}),
    },
    input: {
      ...(originalQuestion ? { originalQuestion } : {}),
      normalizedRequest: normalizeRequest(ragSessionGenerationResult, rootJob, originalQuestion),
      inputSummary: rootJob.inputSummary,
    },
    timeline: buildTimeline({
      run,
      rootJob,
      rootEvents,
      rootTrace,
      childJobs,
    }),
    snapshots: {
      run,
      rootJob,
      rootEvents,
      rootTrace,
      childJobs,
    },
    finalOutputs: {
      ...(ragSessionGenerationResult ? { ragSessionGenerationResult } : {}),
      ...(ragAnswer !== undefined ? { ragAnswer } : {}),
      ...(ragAnswer !== undefined ? { modelResult: ragAnswer } : {}),
      ...(visualizationArtifact !== undefined ? { visualizationArtifact } : {}),
      ...(qualityReport !== undefined ? { qualityReport } : {}),
      childQualityReviews: childJobs
        .map((job) => job.snapshot.result)
        .filter((result) => result !== undefined),
    },
    redaction: {
      policy: 'Secrets are redacted; non-secret RAG business payloads are preserved as fully as stored data allows.',
      secretFields: ['apiKey', 'secret', 'token', 'password', 'cookie', 'authorization'],
      limitations: [
        '历史 trace 仍保留生成时的安全摘要形态；prompt/html/question 等原文字段如果已被 trace sanitizer 摘要，导出器无法从摘要反推原文。',
        'run.lastResult 由 run store 存储时可能已被安全清洗；完整最终业务结果优先来自 root job snapshot.result。',
      ],
    },
  };

  return redactExportValue(payload) as RagRunFlowExport;
}

async function readJob(reader: RagRunFlowJobReader, jobId: string): Promise<GenerationJobSnapshot | null> {
  if (reader.getJob) return reader.getJob(jobId);
  if (reader.readJob) return reader.readJob(jobId);
  return null;
}

async function readChildJobs(
  reader: RagRunFlowJobReader,
  childJobIds: string[],
): Promise<RagRunFlowExport['snapshots']['childJobs']> {
  const children: RagRunFlowExport['snapshots']['childJobs'] = [];
  for (const childJobId of childJobIds) {
    const snapshot = await readJob(reader, childJobId);
    if (!snapshot) continue;
    const events = await reader.readEvents(childJobId);
    const trace = await reader.readTrace(childJobId);
    children.push({ snapshot, events, trace });
  }
  return children;
}

function collectChildJobIds(run: RagRunRecord, rootJob: GenerationJobSnapshot): string[] {
  const ids = new Set(run.childJobIds);
  const result = asRecord(rootJob.result);
  const qualityReviewJobId = asString(result?.qualityReviewJobId);
  if (qualityReviewJobId) ids.add(qualityReviewJobId);
  return Array.from(ids);
}

function buildTimeline(input: {
  run: RagRunRecord;
  rootJob: GenerationJobSnapshot;
  rootEvents: GenerationJobEvent[];
  rootTrace: GenerationTraceEntry[];
  childJobs: RagRunFlowExport['snapshots']['childJobs'];
}): RagRunFlowTimelineEntry[] {
  const entries: PendingTimelineEntry[] = [];
  const rootIds = {
    runId: input.run.runId,
    rootJobId: input.rootJob.id,
  };

  entries.push({
    timestamp: input.run.createdAt,
    sortTimestamp: input.run.createdAt,
    sortOrder: 0,
    source: 'run_store',
    description: 'Run 快照：记录本次 RAG run 的 root job、child jobs、状态、时间戳和最后结果摘要。',
    ids: rootIds,
    data: input.run,
  });
  pushJobSnapshot(entries, input.run.runId, input.rootJob, true);
  pushEvents(entries, input.run.runId, input.rootJob, input.rootEvents);
  pushTrace(entries, input.run.runId, input.rootJob, input.rootTrace);

  for (const child of input.childJobs) {
    pushJobSnapshot(entries, input.run.runId, child.snapshot, false);
    pushEvents(entries, input.run.runId, child.snapshot, child.events);
    pushTrace(entries, input.run.runId, child.snapshot, child.trace);
  }

  return entries
    .sort((a, b) => a.sortTimestamp.localeCompare(b.sortTimestamp) || a.sortOrder - b.sortOrder)
    .map((entry, index) => ({
      sequence: index + 1,
      timestamp: entry.timestamp,
      source: entry.source,
      ...(entry.stage ? { stage: entry.stage } : {}),
      description: entry.description,
      ids: entry.ids,
      data: entry.data,
    }));
}

function pushJobSnapshot(
  entries: PendingTimelineEntry[],
  runId: string,
  job: GenerationJobSnapshot,
  isRoot: boolean,
): void {
  const timestamp = job.createdAt;
  entries.push({
    timestamp,
    sortTimestamp: timestamp,
    sortOrder: isRoot ? 1 : 4,
    source: 'job_snapshot',
    stage: job.type,
    description: `${isRoot ? 'Root job' : 'Child job'} 快照：记录 ${job.type} 的输入摘要、状态、最终结果和错误诊断。`,
    ids: {
      runId,
      jobId: job.id,
      jobType: job.type,
      ...(isRoot ? { rootJobId: job.id } : {}),
    },
    data: job,
  });
}

function pushEvents(
  entries: PendingTimelineEntry[],
  runId: string,
  job: GenerationJobSnapshot,
  events: GenerationJobEvent[],
): void {
  for (const event of events) {
    entries.push({
      timestamp: event.createdAt,
      sortTimestamp: event.createdAt,
      sortOrder: 2,
      source: 'job_event',
      stage: asString(event.stage) ?? job.type,
      description: describeJobEvent(event),
      ids: {
        runId,
        jobId: job.id,
        jobType: job.type,
        eventSequence: event.sequence,
        ...(job.type === 'rag_session_generation' ? { rootJobId: job.id } : {}),
      },
      data: event,
    });
  }
}

function pushTrace(
  entries: PendingTimelineEntry[],
  runId: string,
  job: GenerationJobSnapshot,
  trace: GenerationTraceEntry[],
): void {
  trace.forEach((entry, index) => {
    entries.push({
      timestamp: entry.timestamp,
      sortTimestamp: entry.timestamp,
      sortOrder: 3,
      source: 'generation_trace',
      stage: entry.stage ?? job.type,
      description: describeTraceEntry(entry),
      ids: {
        runId,
        jobId: job.id,
        jobType: job.type,
        traceIndex: index + 1,
        ...(job.type === 'rag_session_generation' ? { rootJobId: job.id } : {}),
      },
      data: entry,
    });
  });
}

function describeJobEvent(event: GenerationJobEvent): string {
  switch (event.type) {
    case 'job_created':
      return 'Job 创建事件：后端已接受请求并生成可恢复的 generation job。';
    case 'job_started':
      return 'Job 开始事件：runner 已启动，后续会产生 RAG/模型/可视化事件。';
    case 'progress':
      return `进度事件：${asString(event.message) ?? asString(event.stage) ?? '更新当前处理阶段'}。`;
    case 'answer_delta':
      return '模型流式回答片段：用于前端实时展示回答增量，按 sequence 拼接可还原流式文本。';
    case 'answer_ready':
      return 'RAG 答案就绪事件：包含结构化回答、检索证据、引用、质量初评和可视化建议。';
    case 'quality_ready':
      return 'RAG 质量报告事件：包含确定性检查或多评审 agent 的评分、问题和决策。';
    case 'artifact_ready':
      return '可视化 artifact 就绪事件：包含互动组件 schema、HTML、质量报告和元数据。';
    case 'artifact_quality_updated':
      return 'Artifact 质量更新事件：发布后质量检查合并了评分、反馈和改动记录。';
    case 'artifact_quality_review_started':
      return 'Artifact 质量复审启动事件：记录 child quality review job 与 artifact 的关联。';
    case 'artifact_quality_review_completed':
      return 'Artifact 质量复审完成事件：child job 返回更新后的 artifact 或质量结果。';
    case 'artifact_quality_review_failed':
      return 'Artifact 质量复审失败事件：记录失败原因和安全诊断。';
    case 'final_result':
      return '最终结果事件：root runner 汇总 RAG 回答、可视化 artifact、质量 review job 等终态业务结果。';
    case 'job_completed':
      return 'Job 完成事件：generation job 已进入 completed 终态，result 是恢复和导出的主要来源。';
    case 'job_failed':
      return 'Job 失败事件：generation job 已进入 failed 终态，包含错误消息和诊断。';
    case 'job_cancelled':
      return 'Job 取消事件：generation job 已进入 cancelled 终态。';
    default:
      return `Job 事件：${event.type}，保留原始 payload 以便审计本次数据变化。`;
  }
}

function describeTraceEntry(entry: GenerationTraceEntry): string {
  const stage = entry.stage ? `，阶段 ${entry.stage}` : '';
  let description: string;
  switch (entry.event) {
    case 'llm_request':
      description = `LLM 请求 trace${stage}：记录模型、provider、stream/thinking/maxTokens、profile 和请求阶段。`;
      break;
    case 'llm_response':
      description = `LLM 返回 trace${stage}：记录状态、耗时、输入/输出 token、stop reason 和响应诊断。`;
      break;
    case 'llm_fallback':
      description = `LLM fallback trace${stage}：记录流式、thinking 或空响应降级原因。`;
      break;
    case 'llm_empty_text':
      description = `LLM 空响应 trace${stage}：记录空文本诊断，通常用于排查超时或 provider payload 异常。`;
      break;
    case 'llm_error':
      description = `LLM 错误 trace${stage}：记录 provider 错误状态和安全诊断。`;
      break;
    case 'job_started':
      description = 'Job trace：记录 runner 启动时的输入摘要。';
      break;
    case 'runner_event':
      description = `Runner event trace${stage}：记录 runner 向 SSE/job event 管道输出的数据变化摘要。`;
      break;
    case 'job_completed':
      description = 'Job trace：记录 runner 返回的终态 result 摘要。';
      break;
    case 'job_failed':
      description = 'Job trace：记录 runner 失败消息和诊断。';
      break;
    default:
      description = `Generation trace：${entry.event}${stage}。`;
  }

  if (containsSanitizedSummary(entry)) {
    description += ' 历史 trace 中原文已被清洗，无法反推。';
  }
  return description;
}

function normalizeRequest(
  result: RagSessionGenerationResult | undefined,
  rootJob: GenerationJobSnapshot,
  originalQuestion?: string,
): Record<string, unknown> {
  if (result?.request && typeof result.request === 'object') {
    return result.request as Record<string, unknown>;
  }
  return {
    ...rootJob.inputSummary,
    ...(originalQuestion ? { question: originalQuestion } : {}),
  };
}

function readOriginalQuestion(
  result: RagSessionGenerationResult | undefined,
  rootJob: GenerationJobSnapshot,
  events: GenerationJobEvent[],
  artifact: unknown,
): string | undefined {
  const resultQuestion = asString(asRecord(result?.request)?.question);
  if (resultQuestion) return resultQuestion;

  const answerReady = readEventPayload(events, 'answer_ready', 'result');
  const answerPackQuestion = asString(asRecord(asRecord(answerReady)?.evidence)?.pack
    && asRecord(asRecord(asRecord(answerReady)?.evidence)?.pack)?.question);
  if (answerPackQuestion) return answerPackQuestion;

  const artifactQuestion = asString(asRecord(asRecord(artifact)?.schema)?.ragMetadata
    && asRecord(asRecord(asRecord(artifact)?.schema)?.ragMetadata)?.originalQuestion);
  if (artifactQuestion) return artifactQuestion;

  const inputQuestion = rootJob.inputSummary.question;
  if (typeof inputQuestion === 'string') return inputQuestion;
  return asString(asRecord(inputQuestion)?.questionPreview);
}

function readEventPayload(events: GenerationJobEvent[], type: string, key: string): unknown {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === type && key in event) return event[key];
  }
  return undefined;
}

function readQualityReport(value: unknown): unknown {
  const answer = asRecord(value)?.answer;
  const answerQuality = asRecord(value)?.qualityReport;
  return answerQuality ?? asRecord(answer)?.qualityReport;
}

function asRagSessionGenerationResult(value: unknown): RagSessionGenerationResult | undefined {
  const record = asRecord(value);
  if (!record || record.type !== 'rag_session_generation_result') return undefined;
  if (!('answer' in record) || typeof record.visualizationStatus !== 'string') return undefined;
  return record as unknown as RagSessionGenerationResult;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function containsSanitizedSummary(value: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (typeof value === 'string') {
    return value === '[html omitted]' || value === '[truncated]' || value === '[object]' || /^\[array\(\d+\)\]$/.test(value);
  }
  if (Array.isArray(value)) return value.some((item) => containsSanitizedSummary(item, depth + 1));
  const record = asRecord(value);
  if (!record) return false;
  return Object.entries(record).some(([key, child]) => {
    if (/(prompt|question|answerText|currentHtml|html|systemPrompt|developerPrompt)(Preview|Length)$/i.test(key)) {
      return true;
    }
    return containsSanitizedSummary(child, depth + 1);
  });
}

function redactExportValue(value: unknown, key = 'value'): unknown {
  if (SECRET_KEY_PATTERN.test(key)) return REDACTED;
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;

  if (typeof value === 'string') return redactString(value);

  if (Array.isArray(value)) {
    return value.map((item, index) => redactExportValue(item, `${key}_${index}`));
  }

  const record = asRecord(value);
  if (record) {
    const next: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(record)) {
      next[childKey] = redactExportValue(childValue, childKey);
    }
    return next;
  }

  return redactString(String(value));
}

function redactString(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]+/g, REDACTED)
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, `Bearer ${REDACTED}`)
    .replace(/token\s*[:=]\s*["']?[^"',\s]+/gi, `token=${REDACTED}`)
    .replace(/api[_-]?key\s*[:=]\s*["']?[^"',\s]+/gi, `apiKey=${REDACTED}`)
    .replace(/SECRET[_:-][A-Z0-9_:-]*/gi, REDACTED)
    .replace(/PRIVATE[_:-][A-Z0-9_:-]*/gi, REDACTED)
    .replace(/PASSWORD[_:-][A-Z0-9_:-]*/gi, REDACTED)
    .replace(/COOKIE[_:-][A-Z0-9_:-]*/gi, REDACTED)
    .replace(/AUTHORIZATION[_:-][A-Z0-9_:-]*/gi, REDACTED);
}
