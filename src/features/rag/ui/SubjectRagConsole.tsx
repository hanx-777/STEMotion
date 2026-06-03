'use client';

import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  Database,
  Eye,
  FileText,
  History,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { askRagFromBrowser } from '@/features/rag/client/ragClient';
import { attributeAskError } from '@/features/rag/state/ragAskErrorAttribution';
import { useRagSessionStore, type RagSessionRecord } from '@/features/rag/state/ragSessionStore';
import {
  completeRagVisualizationFailure,
  completeRagVisualizationSuccess,
  createRagVisualizationDraftResult,
  idleVisualizationState,
  restoreRagVisualizationGenerationState,
  shouldStartRagVisualization,
  type RagVisualizationFailureDiagnostics,
  type RagVisualizationGenerationUiState,
  type RagVisualizationStatus,
} from '@/features/rag/state/ragVisualizationFlow';
import { DEMO_CASES, type DemoCase } from '@/lib/rag/demoCases';
import { citationRefForCitation, citationSourceKey, resolveCitationRef } from '@/lib/rag/citation_refs';
import { renderLatexToString } from '@/lib/rag/math_render';
import { parseMarkdownLite, type MarkdownInlineToken, type MarkdownLiteBlock } from '@/lib/rag/markdown_lite';
import ArtifactRenderer from '@/components/deep-interaction/ArtifactRenderer';
import type { DeepInteractionStreamEvent } from '@/lib/deep-interaction/events';
import type { InteractionArtifact } from '@/lib/deep-interaction/types';
import type { RagQualityReport, RagTaskType } from '@/lib/rag/types';
import { getSubjectModeConfig, type RagMode } from '@/lib/rag/modeConfigs';
import { createRagStages } from '@/lib/progress/progressStages';
import type { ProgressModel, ProgressStatus as ProgressStageStatus } from '@/lib/progress/progressTypes';
import RealisticProgressPanel from '@/components/progress/RealisticProgressPanel';
import { useGsapReveal } from '@/lib/animation/useGsapReveal';
import { prefersReducedMotion, stemotionMotion } from '@/lib/animation/motionTokens';
import { SaveToInteractionsButton } from './SaveToInteractionsButton';
import { useToast } from '@/lib/stores/toastStore';

type TaskType = RagTaskType;

interface SubjectInfo {
  name: string;
  display_name: string;
  description: string;
  retrieval: {
    top_k: number;
    score_threshold: number;
    enable_web_search: boolean;
    web_top_k: number;
    lexical_top_k?: number;
    embedding_top_k?: number;
    rerank_top_k?: number;
    evidence_threshold?: number;
    enable_embedding?: boolean;
  };
  tools: string[];
  answer_requirements: string[];
  knowledge_status?: {
    file_count: number;
    chunk_count: number;
    indexed: boolean;
    manifest_updated_at?: string;
  };
}

type Citation =
  | {
      source_type: 'local';
      source: string;
      page?: number;
      chunk_id: string;
      subject: string;
      file_name: string;
    }
  | {
      source_type: 'web';
      title: string;
      url: string;
      snippet: string;
    };

interface AnswerSection {
  id: string;
  title: string;
  content: string;
}

interface VisualizationHint {
  type: 'projectile_motion';
  parameters: {
    v0?: number;
    angle_deg?: number;
    g: number;
  };
}

interface RagResult {
  subject: string;
  subject_display_name: string;
  task_type: TaskType;
  answer_protocol?: 'json' | 'markdown_fallback';
  answer: string;
  answer_sections?: AnswerSection[];
  formula_blocks?: Array<{ id: string; label?: string; latex: string; explanation?: string; citation_refs?: string[] }>;
  final_results?: Array<{ label: string; value: string; unit?: string; citation_refs?: string[] }>;
  visualization_hint?: VisualizationHint;
  visualization_spec?: import('@/lib/rag/visualization/types').VisualizationSpec;
  citations: Citation[];
  source_summary: {
    local_count: number;
    web_count: number;
  };
  retrieval_report?: {
    local_candidate_count: number;
    local_reliable_count: number;
    web_count: number;
    top_local_score: number;
    lexical_top_k: number;
    embedding_top_k: number;
    rerank_top_k: number;
    evidence_threshold: number;
    used_embedding: boolean;
    triggered_web_search: boolean;
    low_evidence: boolean;
    rewritten_queries: string[];
    keywords: string[];
  };
  evidence_pack?: {
    subject: string;
    question: string;
    task_type: TaskType;
    no_evidence: boolean;
    local_blocks: Array<{ ref: string; source_type: 'local' | 'web'; source: string; content: string; score: number }>;
    web_blocks: Array<{ ref: string; source_type: 'local' | 'web'; source: string; content: string; score: number }>;
    guidance: string;
  };
  retrieved_chunks: Array<{
    content: string;
    score: number;
    metadata: Record<string, unknown>;
  }>;
  quality_report?: RagQualityReport;
  demo_fallback?: boolean;
  should_generate_visualization?: boolean;
  visualization_artifact?: InteractionArtifact;
  visualization_status?: RagVisualizationStatus;
  visualization_error?: string;
  auto_saved_at?: string;
}

type TaskGroupId = 'student' | 'teacher' | 'visualization';


export default function SubjectRagConsole({ mode = 'student' }: { mode?: RagMode }) {
  const toast = useToast();
  const [subjects, setSubjects] = useState<SubjectInfo[]>([]);
  const [subject, setSubject] = useState('physics_mechanics');
  const modeConfig = useMemo(() => getSubjectModeConfig(mode, subject), [mode, subject]);
  const [taskType, setTaskType] = useState<TaskType>(modeConfig.defaultTaskType);
  const [question, setQuestion] = useState(modeConfig.defaultQuestion);
  const [useWebSearch, setUseWebSearch] = useState(true);
  const [fastMode, setFastMode] = useState(false);
  const [visualizationMode, setVisualizationMode] = useState<'auto' | 'manual' | 'off'>('auto');
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [asking, setAsking] = useState(false);
  const [progressModel, setProgressModel] = useState<ProgressModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RagResult | null>(null);
  const [visualizationGeneration, setVisualizationGeneration] = useState<RagVisualizationGenerationUiState>(idleVisualizationState);
  const [generatedVisualizationArtifact, setGeneratedVisualizationArtifact] = useState<InteractionArtifact | null>(null);
  const [activeDemoId, setActiveDemoId] = useState<string | null>(null);
  const [skillOpen, setSkillOpen] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [highlightedSourceKey, setHighlightedSourceKey] = useState<string | null>(null);
  const [activeSubId, setActiveSubId] = useState<string>(modeConfig.defaultSubId);
  const [sessionCollapsed, setSessionCollapsed] = useState(true);
  const heroMotionRef = useGsapReveal<HTMLDivElement>({
    selector: '[data-rag-hero-motion]',
    stagger: stemotionMotion.stagger.item,
    duration: stemotionMotion.duration.page,
    y: 14,
    delay: 0.04,
  });
  const workspaceMotionRef = useGsapReveal<HTMLDivElement>({
    selector: '[data-rag-motion]',
    stagger: stemotionMotion.stagger.tight,
    duration: stemotionMotion.duration.item,
    y: 12,
    delay: 0.08,
  });
  const answerMotionRef = useRef<HTMLDivElement>(null);
  const progressStartTimeRef = useRef<number>(0);
  const highlightTimerRef = useRef<number | null>(null);
  const visualizationRequestRef = useRef(0);
  const userEditedRef = useRef(false);
  const sessions = useRagSessionStore((state) => state.sessions);
  const currentSessionId = useRagSessionStore((state) => state.currentSessionId);
  const saveSession = useRagSessionStore((state) => state.saveSession);
  const selectSession = useRagSessionStore((state) => state.selectSession);
  const deleteStoredSession = useRagSessionStore((state) => state.deleteSession);
  const clearStoredSessions = useRagSessionStore((state) => state.clearSessions);
  const renameStoredSession = useRagSessionStore((state) => state.renameSession);

  useEffect(() => {
    let mounted = true;
    fetch('/api/v1/subjects')
      .then((res) => res.json())
      .then((data) => {
        if (!mounted) return;
        setSubjects(data.subjects ?? []);
        setSubject(data.defaultSubject ?? 'physics_mechanics');
      })
      .catch(() => setError('学科配置加载失败'))
      .finally(() => {
        if (mounted) setLoadingSubjects(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!userEditedRef.current) {
      setQuestion(modeConfig.defaultQuestion);
    }
  }, [modeConfig.defaultQuestion]);

  const activeSubject = useMemo(
    () => subjects.find((item) => item.name === subject),
    [subject, subjects],
  );
  const activeDemo = DEMO_CASES.find((item) => item.id === activeDemoId) ?? null;
  const activeTask = modeConfig.tasks.find((t) => t.subId === activeSubId) ?? modeConfig.tasks[0];
  const demosByGroup = useMemo(() => {
    const grouped: Record<TaskGroupId, DemoCase[]> = { student: [], teacher: [], visualization: [] };
    for (const demo of DEMO_CASES) {
      grouped[demo.group].push(demo);
    }
    return grouped;
  }, []);
  const showExampleCards = modeConfig.examplesDisplayMode === 'cards';
  const localCitations = result?.citations.filter((citation) => citation.source_type === 'local') ?? [];
  const webCitations = result?.citations.filter((citation) => citation.source_type === 'web') ?? [];
  const lowLocalMatch = result
    ? result.retrieved_chunks.some((chunk) => chunk.metadata.source_type === 'local' && normalizeScore(chunk.score) < 35)
    : false;
  const presentationIssue = result?.quality_report?.checks.find((check) => check.name === '最终呈现质量' && !check.passed);
  const visualizationArtifact = result?.visualization_artifact ?? generatedVisualizationArtifact;
  const visualizationSchema = visualizationArtifact?.schema.type === 'rag_visualization'
    ? visualizationArtifact.schema
    : null;
  const hasManualVisualizationHint = visualizationMode === 'manual' && Boolean(result?.visualization_hint);
  const shouldShowVisualizationPanel = Boolean(visualizationArtifact)
    || visualizationGeneration.status === 'generating'
    || visualizationGeneration.status === 'error'
    || hasManualVisualizationHint;

  const updateStage = (stageId: string, status: ProgressStageStatus, detail?: string) => {
    setProgressModel((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        currentStageId: stageId,
        stages: prev.stages.map((s) =>
          s.id === stageId
            ? {
                ...s,
                status,
                detail,
                ...(status === 'running' ? { startedAt: Date.now() } : {}),
                ...(status === 'completed' || status === 'skipped' || status === 'error' || status === 'warning'
                  ? { completedAt: Date.now() }
                  : {}),
              }
            : s,
        ),
        message: detail ?? prev.message,
      };
    });
  };

  const startVisualizationGeneration = async (
    ragResult: RagResult,
    sessionId: string,
    context: {
      question: string;
      subject: string;
      taskType: TaskType;
      useWebSearch: boolean;
      source: 'student' | 'teacher';
    },
  ) => {
    const requestId = ++visualizationRequestRef.current;
    setGeneratedVisualizationArtifact(null);
    setVisualizationGeneration({
      status: 'generating',
      progress: 6,
      message: '正在启动多 Agent 可视化生成...',
      logs: ['正在启动多 Agent 可视化生成...'],
    });
    updateStage('visualization', 'running', '正在生成互动可视化 artifact...');

    try {
      const response = await fetch('/api/v1/rag/visualization/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: context.question,
          answerText: ragResult.answer,
          answerSections: ragResult.answer_sections,
          formulaBlocks: ragResult.formula_blocks,
          finalResults: ragResult.final_results,
          citations: ragResult.citations,
          subject: context.subject,
          taskType: context.taskType,
          source: context.source,
          preferredType: 'interactive_html',
        }),
      });

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({ error: '可视化生成请求失败。' }));
        throw new Error(data.error ?? '可视化生成请求失败。');
      }

      await readRagVisualizationEventStream(response.body, (event) => {
        if (requestId !== visualizationRequestRef.current) return;
        handleRagVisualizationEvent(event, ragResult, sessionId, context);
      });
    } catch (err) {
      if (requestId !== visualizationRequestRef.current) return;
      const message = err instanceof Error ? err.message : '可视化生成失败';
      const failedResult = completeRagVisualizationFailure(ragResult, { error: message });
      setVisualizationGeneration((prev) => ({
        status: 'error',
        progress: 100,
        message,
        logs: [...prev.logs, message].slice(-8),
      }));
      setResult(failedResult);
      saveSession({
        id: sessionId,
        question: context.question,
        subject: context.subject,
        taskType: context.taskType,
        useWebSearch: context.useWebSearch,
        result: failedResult,
      });
      updateStage('visualization', 'error', message);
      toast.error('互动可视化生成失败，回答已自动保存到本地学习会话。', 4500);
    }
  };

  const triggerManualVisualization = () => {
    if (!result) return;
    // 确保有 sessionId
    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = saveSession({
        question,
        subject,
        taskType,
        useWebSearch,
        result,
      });
    }
    void startVisualizationGeneration(result, sessionId, {
      question,
      subject,
      taskType,
      useWebSearch,
      source: mode === 'student' ? 'student' : 'teacher',
    });
  };

  const handleRagVisualizationEvent = (
    event: DeepInteractionStreamEvent,
    ragResult: RagResult,
    sessionId: string,
    context: {
      question: string;
      subject: string;
      taskType: TaskType;
      useWebSearch: boolean;
      source: 'student' | 'teacher';
    },
  ) => {
    const progress = 'progress' in event ? event.progress : visualizationGeneration.progress;
    const message = labelRagVisualizationEvent(event);

    if (event.type === 'artifact_ready') {
      const artifact = event.artifact;
      const readyResult = completeRagVisualizationSuccess(ragResult, { artifact });
      setGeneratedVisualizationArtifact(artifact);
      setVisualizationGeneration((prev) => ({
        status: 'ready',
        progress: 100,
        message: '互动可视化已生成',
        logs: [...prev.logs, '互动可视化已通过多 Agent 审计。'].slice(-8),
      }));
      updateStage('visualization', 'completed', '互动可视化已通过多 Agent 审计');
      setProgressModel((prev) => prev
        ? {
            ...prev,
            message: '已自动保存到本地学习会话',
            summary: {
              ...(prev.summary ?? {}),
              '可视化演示': '已生成并自动保存',
            },
          }
        : prev);
      setResult((prev) => {
        const base = prev ?? readyResult;
        const next = completeRagVisualizationSuccess(base, { artifact });
        saveSession({
          id: sessionId,
          question: context.question,
          subject: context.subject,
          taskType: context.taskType,
          useWebSearch: context.useWebSearch,
          result: next,
        });
        return next;
      });
      toast.success('互动可视化已生成，已自动保存到本地学习会话。', 4000);
      return;
    }

    if (event.type === 'error') {
      const diagnosticSummary = formatVisualizationDiagnostics(event.diagnostics);
      const errorMessage = diagnosticSummary ? `${event.message}\n${diagnosticSummary}` : event.message;
      const failedResult = completeRagVisualizationFailure(ragResult, { error: errorMessage });
      setVisualizationGeneration((prev) => ({
        status: 'error',
        progress: 100,
        message: event.message,
        logs: [...prev.logs, event.message, ...(diagnosticSummary ? [diagnosticSummary] : [])].slice(-8),
        diagnostics: event.diagnostics,
      }));
      setResult(failedResult);
      saveSession({
        id: sessionId,
        question: context.question,
        subject: context.subject,
        taskType: context.taskType,
        useWebSearch: context.useWebSearch,
        result: failedResult,
      });
      updateStage('visualization', 'error', errorMessage);
      setProgressModel((prev) => prev
        ? {
            ...prev,
            message: '回答已自动保存，可视化生成失败',
            summary: {
              ...(prev.summary ?? {}),
              '可视化演示': '生成失败，回答已保存',
            },
          }
        : prev);
      toast.error('互动可视化生成失败，回答已自动保存到本地学习会话。', 4500);
      return;
    }

    if (message) {
      setVisualizationGeneration((prev) => ({
        status: 'generating',
        progress,
        message,
        logs: [...prev.logs, message].slice(-8),
      }));
    }
  };

  const ask = async () => {
    if (!question.trim()) {
      setError('请输入问题');
      return;
    }

    setAsking(true);
    setError(null);
    setGeneratedVisualizationArtifact(null);
    setVisualizationGeneration(idleVisualizationState());

    progressStartTimeRef.current = Date.now();
    setProgressModel({ mode: 'rag', stages: createRagStages(), message: '正在解析问题...' });
    updateStage('parse', 'running');

    await new Promise((r) => setTimeout(r, 300));
    updateStage('parse', 'completed');
    updateStage('retrieve_local', 'running', '正在检索本地课程资料...');

    try {
      const data = await askRagFromBrowser({
        question,
        subjectId: subject,
        taskType,
        retrieval: { useWebSearch },
        quality: { mode: fastMode ? 'fast' : 'highQuality' },
        visualization: { mode: visualizationMode },
      });
      const ragResult = data as unknown as RagResult;

      const localCount = ragResult.source_summary?.local_count ?? 0;
      const webCount = ragResult.source_summary?.web_count ?? 0;

      updateStage(
        'retrieve_local',
        localCount > 0 ? 'completed' : 'warning',
        localCount > 0 ? `找到 ${localCount} 条本地资料` : '本地资料匹配度较低',
      );

      if (useWebSearch) {
        updateStage(
          'retrieve_web',
          webCount > 0 ? 'completed' : 'completed',
          webCount > 0 ? `找到 ${webCount} 条网络资料` : '未找到补充资料',
        );
      } else {
        updateStage('retrieve_web', 'skipped');
      }

      updateStage('generate', 'completed', '结构化回答已生成');
      updateStage(
        'citations',
        ragResult.citations?.length > 0 ? 'completed' : 'skipped',
        `${ragResult.citations?.length ?? 0} 条引用来源`,
      );

      const shouldGenerateVisualization = shouldStartRagVisualization({
        visualizationMode,
        demoFallback: ragResult.demo_fallback,
        backendShouldGenerate: ragResult.should_generate_visualization,
      });
      const resultToSave = createRagVisualizationDraftResult(ragResult, {
        visualizationMode: shouldGenerateVisualization ? 'auto' : 'off',
      });

      const hasManualHint = visualizationMode === 'manual' && Boolean(ragResult.visualization_hint);

      if (shouldGenerateVisualization) {
        updateStage('visualization', 'running', '正在启动多 Agent 互动可视化生成...');
      } else if (hasManualHint) {
        updateStage('visualization', 'completed', '可点击「生成互动可视化」按钮手动触发');
      } else {
        updateStage('visualization', 'skipped');
      }

      setProgressModel((prev) =>
        prev
          ? {
              ...prev,
              message: '生成完成',
              summary: {
                '本地课程资料': `${localCount} 条`,
                '网络补充资料': `${webCount} 条`,
                '引用来源': `${ragResult.citations?.length ?? 0} 条`,
                '可视化演示': shouldGenerateVisualization
                  ? '互动可视化生成中'
                  : hasManualHint ? '可手动触发生成' : '未生成',
                '总耗时': `${((Date.now() - progressStartTimeRef.current) / 1000).toFixed(1)} 秒`,
              },
            }
          : prev,
      );

      setResult(resultToSave);
      toast.success(
        shouldGenerateVisualization
          ? '回答已自动保存，正在生成互动可视化。'
          : '回答已自动保存到本地学习会话。',
        4000,
      );
      const sessionId = saveSession({
        question,
        subject,
        taskType,
        useWebSearch,
        result: resultToSave,
      });
      if (shouldGenerateVisualization) {
        void startVisualizationGeneration(resultToSave, sessionId, {
          question,
          subject,
          taskType,
          useWebSearch,
          source: mode === 'student' ? 'student' : 'teacher',
        });
      }
    } catch (err) {
      const attribution = attributeAskError(err);
      setProgressModel((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          message: '生成失败',
          stages: prev.stages.map((s) => {
            if (attribution.stageId !== null) {
              // Route the error to a specific stage (e.g. visualization);
              // mark anything still running as completed so the UI doesn't
              // claim e.g. "检索失败" when retrieval actually succeeded.
              if (s.id === attribution.stageId) {
                return { ...s, status: 'error' as const, detail: attribution.userMessage };
              }
              if (s.status === 'running') {
                return { ...s, status: 'completed' as const, completedAt: Date.now() };
              }
              return s;
            }
            // No specific attribution — fail whichever stage is running (legacy behaviour).
            return s.status === 'running'
              ? { ...s, status: 'error' as const, detail: attribution.userMessage }
              : s;
          }),
        };
      });

      const message = attribution.userMessage;
      toast.error('生成失败，请重试');
      if (activeDemo) {
        const fallback = createDemoFallback(activeDemo, activeSubject);
        setResult(fallback);
        setGeneratedVisualizationArtifact(null);
        setVisualizationGeneration(idleVisualizationState());
        saveSession({
          question,
          subject,
          taskType,
          useWebSearch,
          result: fallback,
          demoFallback: true,
        });
        setError('RAG 请求失败，已切换为演示样例结果。');
      } else {
        setError(message);
      }
    } finally {
      setAsking(false);
    }
  };

  const startNewSession = () => {
    selectSession(null);
    setActiveDemoId(null);
    userEditedRef.current = false;
    setQuestion('');
    setResult(null);
    setGeneratedVisualizationArtifact(null);
    setVisualizationGeneration(idleVisualizationState());
    setError(null);
  };

  const restoreSession = (session: RagSessionRecord) => {
    selectSession(session.id);
    setSubject(session.subject);
    setTaskType(session.taskType);
    setQuestion(session.question);
    setUseWebSearch(session.useWebSearch);
    setResult(session.result as RagResult | null);
    setGeneratedVisualizationArtifact((session.result as RagResult | null)?.visualization_artifact ?? null);
    setVisualizationGeneration(
      restoreRagVisualizationGenerationState(session.result as RagResult | null),
    );
    setActiveDemoId(null);
    setError(null);
    const matchedTask = modeConfig.tasks.find((t) => t.taskType === session.taskType);
    if (matchedTask) setActiveSubId(matchedTask.subId);
  };

  const renameSession = (session: RagSessionRecord) => {
    const nextTitle = window.prompt('会话名称', session.title);
    if (nextTitle?.trim()) renameStoredSession(session.id, nextTitle);
  };

  const deleteSession = (session: RagSessionRecord) => {
    deleteStoredSession(session.id);
    if (currentSessionId === session.id) {
      setResult(null);
      setGeneratedVisualizationArtifact(null);
      setVisualizationGeneration(idleVisualizationState());
      setError(null);
    }
  };

  const clearSessions = () => {
    clearStoredSessions();
    setResult(null);
    setGeneratedVisualizationArtifact(null);
    setVisualizationGeneration(idleVisualizationState());
    setError(null);
  };

  const applyDemo = (demo: DemoCase) => {
    selectSession(null);
    setActiveDemoId(demo.id);
    setSubject(demo.subject);
    setTaskType(demo.taskType);
    setQuestion(demo.question);
    setResult(null);
    setGeneratedVisualizationArtifact(null);
    setVisualizationGeneration(idleVisualizationState());
    setError(null);
    const matchingTask = modeConfig.tasks.find((t) => t.taskType === demo.taskType);
    if (matchingTask) setActiveSubId(matchingTask.subId);
  };

  const toggleSource = (key: string) => {
    setExpandedSources((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const focusCitationRef = (ref: string) => {
    if (!result) return;
    const resolved = resolveCitationRef(ref, result.citations);
    const key = resolved?.key;
    if (!key) return;
    setExpandedSources((current) => new Set(current).add(key));
    setHighlightedSourceKey(key);
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    window.requestAnimationFrame(() => {
      const sourceEl = document.getElementById(sourceDomId(key));
      sourceEl?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      if (sourceEl && !prefersReducedMotion()) {
        gsap.fromTo(
          sourceEl,
          { scale: 0.985, boxShadow: '0 0 0 0 rgba(37, 99, 235, 0)' },
          {
            scale: 1,
            boxShadow: '0 0 0 4px rgba(37, 99, 235, 0.14)',
            duration: stemotionMotion.duration.quick,
            ease: stemotionMotion.ease.emphasis,
            repeat: 1,
            yoyo: true,
            overwrite: 'auto',
            clearProps: 'transform,boxShadow',
          },
        );
      }
    });
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedSourceKey(null);
      highlightTimerRef.current = null;
    }, 1800);
  };

  useEffect(() => () => {
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
  }, []);

  useEffect(() => {
    const container = answerMotionRef.current;
    if (!container || !result || prefersReducedMotion()) return;

    const targets = Array.from(container.querySelectorAll('[data-result-motion]'));
    if (targets.length === 0) return;

    gsap.fromTo(
      targets,
      { autoAlpha: 0, y: 10, scale: 0.995 },
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: stemotionMotion.duration.item,
        stagger: stemotionMotion.stagger.tight,
        ease: stemotionMotion.ease.standard,
        overwrite: 'auto',
      },
    );
  }, [result]);

  return (
    <div className="stemotion-page flex h-full min-h-0 flex-col overflow-hidden">
      <section className="border-b border-[var(--stemotion-border)] bg-[rgba(255,253,248,0.92)] px-5 py-5 lg:px-6">
        <div ref={heroMotionRef} className="mx-auto flex w-full max-w-7xl flex-col gap-5">
          <div data-rag-hero-motion className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-[var(--stemotion-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--stemotion-primary-strong)]">
                <BookOpenCheck size={16} />
                <span>学科助学</span>
              </div>
              <h1 className="mt-3 text-2xl font-bold text-[var(--stemotion-ink)] lg:text-3xl">大学物理力学智能助学系统</h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--stemotion-muted)]">
                基于课程知识库与网络检索的可追溯 RAG 问答、分步推导与运动可视化
              </p>
            </div>

            <div className="grid w-full gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] xl:w-[720px]">
              <label className="min-w-0 text-sm font-semibold text-[var(--stemotion-ink)]">
                当前学科 Skill
                <select
                  value={subject}
                  onChange={(event) => {
                    setSubject(event.target.value);
                    setResult(null);
                    setSkillOpen(false);
                  }}
                  disabled={loadingSubjects}
                  className="mt-1 h-11 w-full rounded-lg border border-[var(--stemotion-border)] bg-[var(--stemotion-surface-strong)] px-3 text-sm text-[var(--stemotion-ink)] shadow-sm transition focus:border-[var(--stemotion-primary)] disabled:opacity-60"
                >
                  {subjects.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.display_name}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => setSkillOpen(true)}
                disabled={!activeSubject}
                className="stemotion-pressable inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-lg border border-[var(--stemotion-border)] bg-[var(--stemotion-surface-strong)] px-3 text-sm font-semibold text-[var(--stemotion-ink)] shadow-sm transition hover:border-teal-200 hover:bg-[var(--stemotion-primary-soft)] hover:text-[var(--stemotion-primary-strong)] disabled:opacity-60"
              >
                <Eye size={16} />
                查看 Skill 配置
              </button>

              <label
                className="stemotion-pressable flex h-11 items-center gap-2 self-end rounded-lg border border-[var(--stemotion-border)] bg-[var(--stemotion-surface-strong)] px-3 text-sm font-semibold text-[var(--stemotion-ink)] shadow-sm"
                title="本地知识库不足时补充公开资料，网络结果仅作为补充参考。"
              >
                <input
                  type="checkbox"
                  checked={useWebSearch}
                  onChange={(event) => setUseWebSearch(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[var(--stemotion-primary)]"
                />
                网络检索
              </label>

              <label
                className="stemotion-pressable flex h-11 items-center gap-2 self-end rounded-lg border border-[var(--stemotion-border)] bg-[var(--stemotion-surface-strong)] px-3 text-sm font-semibold text-[var(--stemotion-ink)] shadow-sm"
                title="跳过质量审核，生成速度更快（约3秒），但可能降低答案质量。"
              >
                <input
                  type="checkbox"
                  checked={fastMode}
                  onChange={(event) => setFastMode(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[var(--stemotion-primary)]"
                />
                快速模式
              </label>

              <div
                className="flex h-11 items-center gap-2 self-end rounded-lg border border-[var(--stemotion-border)] bg-[var(--stemotion-surface-strong)] px-3 text-sm font-semibold text-[var(--stemotion-ink)] shadow-sm"
                title="控制可视化生成：自动（关键词检测）、手动（仅提示）、关闭（不生成）"
              >
                <span className="text-xs text-[var(--stemotion-muted)]">可视化：</span>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name="visualizationMode"
                    value="auto"
                    checked={visualizationMode === 'auto'}
                    onChange={(e) => setVisualizationMode(e.target.value as 'auto')}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-xs">自动</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name="visualizationMode"
                    value="manual"
                    checked={visualizationMode === 'manual'}
                    onChange={(e) => setVisualizationMode(e.target.value as 'manual')}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-xs">手动</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name="visualizationMode"
                    value="off"
                    checked={visualizationMode === 'off'}
                    onChange={(e) => setVisualizationMode(e.target.value as 'off')}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-xs">关闭</span>
                </label>
              </div>
            </div>
          </div>

          <div data-rag-hero-motion className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <SkillStatus subject={activeSubject} />
            <div className="stemotion-panel flex flex-wrap items-center gap-2 rounded-lg px-4 py-3 text-xs text-[var(--stemotion-primary-strong)]">
              <span className="mr-1 font-semibold text-[var(--stemotion-ink)]">能力标签</span>
              {(activeSubject?.tools.length ? activeSubject.tools : ['分步推导', '单位检查', '运动可视化', '错因诊断']).map((tool) => (
                <span key={tool} className="rounded-full border border-teal-100 bg-white px-2.5 py-1 font-semibold shadow-sm">
                  {toolLabel(tool)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5 lg:px-6">
        <div ref={workspaceMotionRef} className="mx-auto w-full max-w-7xl space-y-5">
          <div className="grid w-full gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
          <main className="min-w-0 space-y-5">
            <section data-rag-motion className="stemotion-elevated rounded-lg p-4">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-[var(--stemotion-ink)]">{modeConfig.title}</h2>
                <p className="mt-1 text-xs text-[var(--stemotion-muted)]">{modeConfig.subtitle}</p>
              </div>

              <h3 className="mb-2 text-sm font-semibold text-[var(--stemotion-muted)]">
                {modeConfig.title}任务
              </h3>
              <div className="mb-4 grid gap-1 rounded-lg border border-[var(--stemotion-border)] bg-[#f1eee6] p-1 sm:grid-cols-3">
                {modeConfig.tasks.map((task) => (
                  <button
                    type="button"
                    key={task.subId}
                    onClick={() => {
                      setTaskType(task.taskType);
                      setActiveSubId(task.subId);
                    }}
                    className={`min-h-11 rounded-md border px-3 py-2 text-left text-sm transition ${
                      activeSubId === task.subId
                        ? 'border-white bg-white font-semibold text-[var(--stemotion-primary-strong)] shadow-sm'
                        : 'border-transparent text-slate-600 hover:bg-white/70 hover:text-[var(--stemotion-ink)]'
                    }`}
                  >
                    {task.label}
                    <span className="mt-0.5 block text-[11px] font-normal leading-4 text-[var(--stemotion-muted)]">{task.description}</span>
                  </button>
                ))}
              </div>
              {showExampleCards && (
                <div className="mb-4 grid gap-2 md:grid-cols-3">
                  {demosByGroup[mode]?.map((demo) => (
                    <DemoCard key={demo.id} demo={demo} active={activeDemoId === demo.id} onClick={() => applyDemo(demo)} />
                  ))}
                </div>
              )}
              {mode === 'visualization' && (
                <p className="mb-4 rounded-lg border border-teal-100 bg-[var(--stemotion-primary-soft)] px-3 py-2 text-xs leading-5 text-[var(--stemotion-primary-strong)]">
                  可视化演示会由 RAG 可视化编排器判断类型，并优先生成可保存、可打开的交互 artifact。
                </p>
              )}

              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-[var(--stemotion-ink)]" htmlFor="rag-question">
                  问题输入
                </label>
                <button
                  type="button"
                  onClick={() => {
                    userEditedRef.current = false;
                    setQuestion(modeConfig.defaultQuestion);
                  }}
                  className="text-xs text-teal-600 hover:text-teal-700 hover:underline"
                >
                  使用默认问题
                </button>
              </div>
              <textarea
                id="rag-question"
                value={question}
                onChange={(event) => {
                  userEditedRef.current = true;
                  setQuestion(event.target.value);
                  setActiveDemoId(null);
                }}
                rows={7}
                placeholder={activeTask.recommendedQuestion}
                className="mt-2 w-full resize-none rounded-lg border border-[var(--stemotion-border)] bg-[#fbfaf6] px-3 py-3 text-sm leading-6 text-[var(--stemotion-ink)] transition focus:border-[var(--stemotion-primary)] focus:bg-white"
              />
              <p className="mt-1 text-[11px] text-[var(--stemotion-muted)]">
                当前默认问题为大学课程综合任务，包含模型假设、参数分析、单位检查和可视化参数。
              </p>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--stemotion-muted)]">
                  <span>当前模块：<strong className="text-[var(--stemotion-ink)]">{modeConfig.title}</strong></span>
                  <span>当前任务：<strong className="text-[var(--stemotion-ink)]">{activeTask.label}</strong></span>
                  <span>默认学科：<strong className="text-[var(--stemotion-ink)]">大学物理力学</strong></span>
                </div>
                <button
                  type="button"
                  onClick={ask}
                  disabled={asking || loadingSubjects}
                  className="stemotion-pressable inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--stemotion-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--stemotion-primary-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {asking ? <Loader2 size={17} className="animate-spin" /> : <Search size={17} />}
                  {asking ? (progressModel?.message || '处理中...') : '开始问答'}
                </button>
              </div>
              {error && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-[var(--stemotion-amber-soft)] px-3 py-2 text-sm text-[var(--stemotion-amber)]" role="alert">
                  {error}
                </p>
              )}
            </section>

            <section data-rag-motion className="stemotion-elevated rounded-lg p-5" aria-live="polite">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-[var(--stemotion-primary-strong)]">智能回答</p>
                  <h2 className="mt-1 text-lg font-semibold text-[var(--stemotion-ink)]">
                    {result?.subject_display_name ?? activeSubject?.display_name ?? '大学物理力学'}
                  </h2>
                </div>
                {result && (
                  <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                    {result.demo_fallback && <span className="rounded-full bg-[var(--stemotion-amber-soft)] px-2.5 py-1 text-[var(--stemotion-amber)]">演示样例结果</span>}
                    <span className="rounded-full bg-[var(--stemotion-primary-soft)] px-2.5 py-1 text-[var(--stemotion-primary-strong)]">本地 {result.source_summary.local_count}</span>
                    <span className="rounded-full bg-[var(--stemotion-blue-soft)] px-2.5 py-1 text-[var(--stemotion-blue)]">网络 {result.source_summary.web_count}</span>
                  </div>
                )}
              </div>

              {result ? (
                <div ref={answerMotionRef} className="space-y-4">
                  <div data-result-motion>
                    <AnswerMetaBar result={result} />
                  </div>
                  {presentationIssue && (
                    <p data-result-motion className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700">
                      最终呈现检查提醒：{presentationIssue.message}
                    </p>
                  )}
                  {result.final_results && result.final_results.length > 0 && (
                    <div data-result-motion>
                      <FinalResultsPanel results={result.final_results} />
                    </div>
                  )}
                  {result.formula_blocks && result.formula_blocks.length > 0 && (
                    <div data-result-motion>
                      <FormulaBlocksPanel formulas={result.formula_blocks} />
                    </div>
                  )}
                  {(result.answer_sections ?? fallbackSections(result.answer, result.citations, result.task_type as TaskType)).map((section, index) => (
                    <section key={section.id} data-result-motion className="relative rounded-lg border border-[var(--stemotion-border)] bg-white/75 p-4 pl-14 shadow-[0_1px_0_rgba(15,23,42,0.03)]">
                      <span className="absolute left-4 top-4 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--stemotion-primary-soft)] text-xs font-bold text-[var(--stemotion-primary-strong)] ring-1 ring-teal-100">
                        {index + 1}
                      </span>
                      <div className="absolute bottom-4 left-[29px] top-12 w-px bg-[var(--stemotion-border)]" />
                      <h3 className="text-sm font-semibold text-[var(--stemotion-ink)]">{section.title}</h3>
                      {section.id === 'citations' ? (
                        <StructuredCitationList citations={result.citations} fallback={section.content} />
                      ) : (
                        <MarkdownBlock
                          content={section.content || '暂无结构化内容。'}
                          sectionTitle={section.title}
                          citations={result.citations}
                          onCitationClick={focusCitationRef}
                        />
                      )}
                    </section>
                  ))}
                  {result.quality_report && (
                    <div data-result-motion>
                      <RagQualityPanel report={result.quality_report} />
                    </div>
                  )}
                  <p data-result-motion className="rounded-lg border border-[var(--stemotion-border)] bg-white px-3 py-2 text-xs leading-5 text-[var(--stemotion-muted)]">
                    AI 生成内容，仅供学习参考，请结合课程教材与教师要求核验。
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-[var(--stemotion-border-strong)] bg-[#fbfaf6] px-4 py-10 text-center">
                  <p className="text-sm font-semibold text-[var(--stemotion-ink)]">推荐演示流程</p>
                  <p className="mt-2 text-xs leading-5 text-[var(--stemotion-muted)]">
                    {mode === 'student' ? (
                      <>
                        1. 保留默认大学物理综合问题，或输入自己的学习问题。<br />
                        2. 选择「知识讲解 / 分步解题 / 错因诊断」任务类型。<br />
                        3. 点击「开始问答」。<br />
                        4. 查看结构化回答、引用来源和可视化参数。
                      </>
                    ) : (
                      <>
                        1. 选择一个任务卡片或点击下方案例<br />
                        2. 点击「开始问答」查看结构化回答<br />
                        3. 展开右侧「知识依据」查看引用来源
                      </>
                    )}
                  </p>
                  {showExampleCards && (
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                      {(demosByGroup[mode] ?? []).slice(0, 3).map((demo) => (
                        <button
                          key={demo.id}
                          type="button"
                          onClick={() => applyDemo(demo)}
                          className="rounded-full border border-teal-200 bg-white px-3 py-1.5 text-xs font-semibold text-[var(--stemotion-primary-strong)] transition hover:bg-[var(--stemotion-primary-soft)]"
                        >
                          {demo.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>

          </main>

          <aside className="min-w-0 space-y-5">
            {progressModel && (
              <div data-rag-motion>
                <RealisticProgressPanel model={progressModel} />
              </div>
            )}

            <div data-rag-motion>
              <KnowledgeBasisPanel
                localCount={result?.source_summary.local_count ?? 0}
                webCount={result?.source_summary.web_count ?? 0}
                lowLocalMatch={lowLocalMatch}
                localCitations={localCitations}
                webCitations={webCitations}
                chunks={result?.retrieved_chunks ?? []}
                expandedSources={expandedSources}
                highlightedSourceKey={highlightedSourceKey}
                onToggle={toggleSource}
              />
            </div>

            {result && (
              <section data-rag-motion className="stemotion-panel rounded-lg p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--stemotion-ink)]">
                  <FileText size={17} />
                  检索片段
                </h3>
                <div className="mt-3 space-y-3">
                  {result.retrieved_chunks.slice(0, 5).map((chunk, index) => {
                    const percent = normalizeScore(chunk.score);
                    const tone = similarityTone(percent);
                    return (
                      <div key={`${chunk.metadata.chunk_id ?? index}`} className="rounded-lg border border-[var(--stemotion-border)] bg-[#fbfaf6] p-3">
                        <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-slate-600">
                          <span className="truncate">{String(chunk.metadata.file_name ?? chunk.metadata.title ?? 'chunk')}</span>
                          <span className={tone.badgeClass}>{relevanceLabel(percent)}</span>
                        </div>
                        <div className="mb-2">
                          <div className="mb-1 flex items-center justify-between text-xs text-[var(--stemotion-muted)]">
                            <span>相似度</span>
                            <span className="font-semibold text-[var(--stemotion-ink)]">{percent}%</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-[#e9e2d8]">
                            <div className={`h-full rounded-full ${tone.barClass}`} style={{ width: `${percent}%` }} />
                          </div>
                        </div>
                        <p className="line-clamp-4 text-xs leading-5 text-slate-600">{chunk.content}</p>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {!sessionCollapsed && (
              <div data-rag-motion>
                <RagSessionPanel
                  sessions={sessions}
                  currentSessionId={currentSessionId}
                  onNew={startNewSession}
                  onRestore={restoreSession}
                  onRename={renameSession}
                  onDelete={deleteSession}
                  onClear={clearSessions}
                />
              </div>
            )}
            <button
              type="button"
              onClick={() => setSessionCollapsed((c) => !c)}
              className="w-full rounded-lg border border-[var(--stemotion-border)] bg-[#fbfaf6] px-3 py-2 text-xs font-semibold text-[var(--stemotion-muted)] transition hover:bg-white"
            >
              {sessionCollapsed ? '展开本地学习会话' : '收起本地学习会话'}
            </button>
          </aside>
          </div>

          {shouldShowVisualizationPanel && (
            <RagVisualizationPanel
              artifact={visualizationArtifact}
              schemaReady={Boolean(visualizationSchema)}
              generation={visualizationGeneration}
              source={mode === 'student' ? 'student' : 'teacher'}
              subject={activeSubject?.name || 'physics_mechanics'}
              originalQuestion={question}
              taskType={activeTask.taskType}
              qualityReport={result?.quality_report}
              manualHint={hasManualVisualizationHint ? result?.visualization_hint : undefined}
              onManualTrigger={hasManualVisualizationHint ? triggerManualVisualization : undefined}
            />
          )}
        </div>
      </div>

      {skillOpen && activeSubject && (
        <SkillModal subject={activeSubject} onClose={() => setSkillOpen(false)} />
      )}
    </div>
  );
}

function RagVisualizationPanel({
  artifact,
  schemaReady,
  generation,
  source,
  subject,
  originalQuestion,
  taskType,
  qualityReport,
  manualHint,
  onManualTrigger,
}: {
  artifact: InteractionArtifact | null;
  schemaReady: boolean;
  generation: RagVisualizationGenerationUiState;
  source: 'student' | 'teacher';
  subject: string;
  originalQuestion: string;
  taskType: string;
  qualityReport?: RagQualityReport;
  manualHint?: VisualizationHint | null;
  onManualTrigger?: () => void;
}) {
  const isManualWaiting = Boolean(manualHint) && !artifact && generation.status === 'idle';
  return (
    <section data-rag-motion className="min-h-[760px] rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col justify-between gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-end lg:p-5">
        <div>
          <div className="text-xs font-black uppercase tracking-wider text-blue-600">
            多 Agent 互动可视化
          </div>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
            {artifact?.title ?? (isManualWaiting ? '可视化提示' : '正在生成题目专属互动可视化')}
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-600">
            {artifact?.description ?? (isManualWaiting
              ? '已检测到可可视化的内容，点击下方按钮手动生成互动可视化。'
              : (generation.message || 'RAG 回答已完成，下方正在通过题目提取、HTML 生成、Pedagogy/UX/Safety/Runtime 审计与修复流程生成互动 artifact。'))}
          </p>
        </div>
        {artifact && schemaReady && (
          <SaveToInteractionsButton
            artifact={artifact}
            source={source}
            subject={subject}
            originalQuestion={originalQuestion}
            taskType={taskType}
            qualityReport={qualityReport}
          />
        )}
      </div>

      <div className="min-h-[680px] overflow-hidden bg-white">
        {artifact && schemaReady ? (
          <ArtifactRenderer artifact={artifact} />
        ) : isManualWaiting ? (
          <div className="flex min-h-[680px] flex-col items-center justify-center gap-6 p-6">
            <div className="w-full max-w-lg rounded-lg border border-blue-200 bg-blue-50 p-5 text-center">
              <p className="text-sm font-semibold text-blue-800">检测到可视化提示</p>
              <p className="mt-2 text-xs leading-5 text-blue-700">
                类型：<strong>{manualHint!.type}</strong>
                {manualHint!.parameters.v0 != null && <> · 初速度 {manualHint!.parameters.v0} m/s</>}
                {manualHint!.parameters.angle_deg != null && <> · 角度 {manualHint!.parameters.angle_deg}°</>}
              </p>
            </div>
            {onManualTrigger && (
              <button
                type="button"
                onClick={onManualTrigger}
                className="stemotion-pressable inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                生成互动可视化
              </button>
            )}
          </div>
        ) : (
          <RagVisualizationSkeleton generation={generation} />
        )}
      </div>
    </section>
  );
}

function RagVisualizationSkeleton({ generation }: { generation: RagVisualizationGenerationUiState }) {
  const failed = generation.status === 'error';
  const missing = generation.diagnostics?.missing?.filter(Boolean) ?? [];
  const repairAttempts = generation.diagnostics?.repairAttempts;
  return (
    <div className="grid min-h-[680px] gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-h-[560px] items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-4xl rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-black uppercase tracking-wider text-slate-500">
                {failed ? '生成未通过' : 'Artifact Skeleton'}
              </div>
              <div className="mt-2 text-lg font-black text-slate-900">
                {failed ? '互动可视化暂未生成' : generation.message || '多 Agent 审计生成中'}
              </div>
            </div>
            {!failed && <Loader2 size={24} className="animate-spin text-blue-600" />}
            {failed && <AlertTriangle size={24} className="text-amber-600" />}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${failed ? 'bg-amber-500' : 'bg-blue-600'}`}
              style={{ width: `${Math.max(8, generation.progress)}%` }}
            />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {['题目提取', 'HTML 生成', '多 Agent 审计'].map((label, index) => (
              <div key={label} className="min-h-[92px] rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs font-black uppercase tracking-wider text-slate-400">0{index + 1}</div>
                <div className="mt-2 text-sm font-bold text-slate-800">{label}</div>
                <div className="mt-1 text-xs leading-relaxed text-slate-500">
                  {index === 0 && '还原原题、变量和观察目标'}
                  {index === 1 && '生成自包含 SVG/Canvas 互动页'}
                  {index === 2 && 'Pedagogy / UX / Safety / Runtime'}
                </div>
              </div>
            ))}
          </div>
          {failed && (missing.length > 0 || repairAttempts !== undefined) && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
              {repairAttempts !== undefined && (
                <div className="font-bold">已尝试 {repairAttempts} 轮修复。</div>
              )}
              {missing.length > 0 && (
                <div className="mt-1">
                  缺失合约项：{missing.slice(0, 8).join('、')}
                </div>
              )}
              <div className="mt-1 text-amber-800">
                可以重试生成，或在设置中切换更稳定的模型。
              </div>
            </div>
          )}
        </div>
      </div>
      <aside className="border-t border-slate-200 bg-slate-50 p-4 lg:border-l lg:border-t-0">
        <div className="text-xs font-black uppercase tracking-wider text-slate-500">生成日志</div>
        <div className="mt-3 space-y-2">
          {(generation.logs.length ? generation.logs : ['等待生成任务...']).map((item, index) => (
            <div key={`${item}-${index}`} className="rounded-lg bg-white px-3 py-2 text-xs leading-relaxed text-slate-600 shadow-sm">
              {item}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function formatVisualizationDiagnostics(diagnostics?: RagVisualizationFailureDiagnostics): string {
  if (!diagnostics) return '';
  const parts: string[] = [];
  if (diagnostics.repairAttempts !== undefined) parts.push(`已尝试 ${diagnostics.repairAttempts} 轮修复`);
  if (diagnostics.missing?.length) parts.push(`缺失合约项：${diagnostics.missing.slice(0, 8).join('、')}`);
  return parts.join('；');
}

function DemoCard({ demo, active, onClick }: { demo: DemoCase; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`stemotion-pressable min-h-[112px] rounded-lg border p-3 text-left transition ${
        active
          ? 'border-teal-300 bg-[var(--stemotion-primary-soft)] shadow-sm'
          : 'border-[var(--stemotion-border)] bg-[#fbfaf6] hover:border-teal-200 hover:bg-white'
      }`}
    >
      <p className="text-sm font-semibold text-[var(--stemotion-ink)]">{demo.title}</p>
      <p className="mt-2 text-xs leading-5 text-[var(--stemotion-muted)]">{demo.description}</p>
    </button>
  );
}

function KnowledgeBasisPanel({
  localCount,
  webCount,
  lowLocalMatch,
  localCitations,
  webCitations,
  chunks,
  expandedSources,
  highlightedSourceKey,
  onToggle,
}: {
  localCount: number;
  webCount: number;
  lowLocalMatch: boolean;
  localCitations: Citation[];
  webCitations: Citation[];
  chunks: RagResult['retrieved_chunks'];
  expandedSources: Set<string>;
  highlightedSourceKey: string | null;
  onToggle: (key: string) => void;
}) {
  return (
    <section className="stemotion-elevated rounded-lg p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--stemotion-ink)]">
        <Database size={17} />
        知识依据
      </h3>
      <p className="mt-1 text-xs text-[var(--stemotion-muted)]">
        本地课程资料 {localCount} 条 / 网络补充资料 {webCount} 条
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <SourceCount label="本地课程资料" count={localCount} tone="local" />
        <SourceCount label="网络补充资料" count={webCount} tone="web" />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-[var(--stemotion-muted)]">
        <span>优先可信来源</span>
        <span>补充参考来源</span>
      </div>
      {lowLocalMatch && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-[var(--stemotion-amber-soft)] px-3 py-2 text-xs leading-5 text-[var(--stemotion-amber)]">
          当前本地知识库匹配度较低，建议补充课程讲义或启用网络检索。
        </p>
      )}
      <div className="mt-3 space-y-3">
        {[...localCitations, ...webCitations].length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--stemotion-border)] bg-[#fbfaf6] px-3 py-3 text-sm text-[var(--stemotion-muted)]">
            暂无引用来源。完成一次问答后会在这里展示本地课程资料和网络补充资料。
          </p>
        ) : (
          [...localCitations, ...webCitations].map((citation) => {
            const key = citationSourceKey(citation);
            const chunk = chunks.find((item) => item.metadata.chunk_id === key || item.metadata.url === key);
            const expanded = expandedSources.has(key);
            const highlighted = highlightedSourceKey === key;
            const isLocal = citation.source_type === 'local';
            const refLabel = isLocal
              ? `[L${localCitations.indexOf(citation) + 1}]`
              : `[W${webCitations.indexOf(citation) + 1}]`;
            return (
              <button
                key={key}
                id={sourceDomId(key)}
                type="button"
                onClick={() => onToggle(key)}
                aria-expanded={expanded}
                className={`stemotion-pressable w-full rounded-lg border p-3 text-left text-xs leading-5 text-slate-600 transition hover:border-teal-200 hover:bg-white ${
                  highlighted
                    ? 'border-[var(--stemotion-blue)] bg-white shadow-[0_0_0_3px_rgba(37,99,235,0.12)]'
                    : 'border-[var(--stemotion-border)] bg-[#fbfaf6]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {isLocal ? (
                      <>
                        <p className="font-semibold text-[var(--stemotion-ink)]">{refLabel} 本地课程资料</p>
                        <p className="font-semibold text-[var(--stemotion-ink)]">{citation.file_name}</p>
                        <p>{citation.page ? `第 ${citation.page} 页 · ` : ''}{citation.chunk_id}</p>
                      </>
                    ) : (
                      <>
                        <p className="font-semibold text-[var(--stemotion-blue)]">{refLabel} 网络补充资料</p>
                        <p className="font-semibold text-[var(--stemotion-blue)]">{citation.title}</p>
                        <p className="mt-1">{citation.snippet}</p>
                        <p className="mt-1 truncate text-slate-400">{citation.url}</p>
                      </>
                    )}
                  </div>
                  <ChevronDown size={15} className={`mt-0.5 shrink-0 transition ${expanded ? 'rotate-180' : ''}`} />
                </div>
                {expanded && (
                  <p className="mt-3 rounded-md border border-[var(--stemotion-border)] bg-white px-3 py-2 text-xs leading-5 text-slate-600">
                    {chunk?.content ?? '暂无原文片段。'}
                  </p>
                )}
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}

function RagSessionPanel({
  sessions,
  currentSessionId,
  onNew,
  onRestore,
  onRename,
  onDelete,
  onClear,
}: {
  sessions: RagSessionRecord[];
  currentSessionId: string | null;
  onNew: () => void;
  onRestore: (session: RagSessionRecord) => void;
  onRename: (session: RagSessionRecord) => void;
  onDelete: (session: RagSessionRecord) => void;
  onClear: () => void;
}) {
  return (
    <section className="stemotion-elevated rounded-lg p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--stemotion-ink)]">
          <History size={17} />
          本地学习会话
        </h3>
        <button
          type="button"
          onClick={onNew}
          className="stemotion-pressable inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--stemotion-border)] bg-white px-2.5 text-xs font-semibold text-[var(--stemotion-ink)] transition hover:border-teal-200 hover:bg-[var(--stemotion-primary-soft)] hover:text-[var(--stemotion-primary-strong)]"
        >
          <Plus size={14} />
          新建
        </button>
      </div>
      <p className="mt-1 text-xs leading-5 text-[var(--stemotion-muted)]">
        最近 {sessions.length}/30 条回答仅保存在本机浏览器，不包含 API Key。
      </p>
      <div className="mt-3 space-y-2">
        {sessions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--stemotion-border)] bg-[#fbfaf6] px-3 py-3 text-sm text-[var(--stemotion-muted)]">
            还没有本地会话。完成一次学科问答后会自动保存。
          </p>
        ) : (
          sessions.slice(0, 6).map((session) => {
            const active = session.id === currentSessionId;
            return (
              <div
                key={session.id}
                className={`rounded-lg border p-2 transition ${
                  active
                    ? 'border-teal-200 bg-[var(--stemotion-primary-soft)]'
                    : 'border-[var(--stemotion-border)] bg-[#fbfaf6]'
                }`}
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => onRestore(session)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-xs font-semibold text-[var(--stemotion-ink)]">{session.title}</p>
                    <p className="mt-1 truncate text-[11px] text-[var(--stemotion-muted)]">
                      {taskTypeLabel(session.taskType)} · {formatSessionTime(session.updatedAt)}
                      {session.demoFallback ? ' · 演示样例' : ''}
                      {session.result?.auto_saved_at ? ' · 已自动保存' : ''}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRename(session)}
                    className="rounded-md px-2 py-1 text-[11px] font-semibold text-[var(--stemotion-primary-strong)] hover:bg-white"
                    aria-label={`重命名 ${session.title}`}
                  >
                    改名
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(session)}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-red-600"
                    aria-label={`删除 ${session.title}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
      {sessions.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="mt-3 text-xs font-semibold text-slate-500 transition hover:text-red-600"
        >
          清空本地会话
        </button>
      )}
    </section>
  );
}

function SkillStatus({ subject }: { subject?: SubjectInfo }) {
  const status = subject?.knowledge_status;
  return (
    <div className="stemotion-panel rounded-lg px-4 py-3 text-sm text-slate-700">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold text-[var(--stemotion-ink)]">知识库状态</span>
        <span>已加载 {status?.file_count ?? 0} 个文件 / {status?.chunk_count ?? 0} 个片段</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
          status?.indexed ? 'bg-emerald-50 text-emerald-700' : 'bg-[var(--stemotion-amber-soft)] text-[var(--stemotion-amber)]'
        }`}>
          {status?.indexed ? '已索引' : '待构建索引'}
        </span>
      </div>
    </div>
  );
}

function SourceCount({ label, count, tone }: { label: string; count: number; tone: 'local' | 'web' }) {
  return (
    <div className={`rounded-lg border px-3 py-3 ${
      tone === 'local'
        ? 'border-teal-100 bg-[var(--stemotion-primary-soft)] text-[var(--stemotion-primary-strong)]'
        : 'border-blue-100 bg-[var(--stemotion-blue-soft)] text-[var(--stemotion-blue)]'
    }`}>
      <p className="text-xs font-semibold">{label}</p>
      <p className="mt-1 text-2xl font-bold">{count}</p>
    </div>
  );
}

function AnswerMetaBar({ result }: { result: RagResult }) {
  const report = result.retrieval_report;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-teal-100 bg-[var(--stemotion-primary-soft)] px-3 py-2 text-xs text-[var(--stemotion-primary-strong)]">
      <span className="font-semibold">本地资料优先</span>
      <span className="text-[var(--stemotion-muted)]">网络检索仅作补充</span>
      <span className="rounded-full bg-white/80 px-2 py-0.5 font-semibold">
        {result.answer_protocol === 'json' ? '结构化回答' : 'Markdown 兜底'}
      </span>
      <span className="rounded-full bg-white/80 px-2 py-0.5 font-semibold">
        本地可靠 {report?.local_reliable_count ?? result.source_summary.local_count} 条
      </span>
      <span className="rounded-full bg-white/80 px-2 py-0.5 font-semibold">
        {report?.used_embedding ? '混合检索' : '词法检索'}
      </span>
      {report?.low_evidence && (
        <span className="rounded-full bg-[var(--stemotion-amber-soft)] px-2 py-0.5 font-semibold text-[var(--stemotion-amber)]">
          依据不足
        </span>
      )}
    </div>
  );
}

function FinalResultsPanel({ results }: { results: NonNullable<RagResult['final_results']> }) {
  return (
    <section className="rounded-lg border border-teal-100 bg-white px-3 py-3">
      <p className="text-sm font-semibold text-[var(--stemotion-ink)]">结构化结果</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {results.map((item) => (
          <div key={`${item.label}-${item.value}`} className="rounded-lg border border-[var(--stemotion-border)] bg-[#fbfaf6] px-3 py-2">
            <p className="text-xs text-[var(--stemotion-muted)]">{item.label}</p>
            <p className="mt-1 text-lg font-semibold text-[var(--stemotion-ink)]">
              {item.value}{item.unit ? ` ${item.unit}` : ''}
            </p>
            {item.citation_refs && item.citation_refs.length > 0 && (
              <p className="mt-1 text-[11px] font-semibold text-[var(--stemotion-blue)]">{item.citation_refs.join(' ')}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function FormulaBlocksPanel({ formulas }: { formulas: NonNullable<RagResult['formula_blocks']> }) {
  return (
    <section className="rounded-lg border border-[var(--stemotion-border)] bg-white px-3 py-3">
      <p className="text-sm font-semibold text-[var(--stemotion-ink)]">公式块</p>
      <div className="mt-3 space-y-3">
        {formulas.map((formula) => (
          <div key={formula.id} className="rounded-lg border border-[var(--stemotion-border)] bg-[#fbfaf6] px-3 py-2">
            {formula.label && <p className="text-xs font-semibold text-[var(--stemotion-ink)]">{formula.label}</p>}
            <MathBlock latex={formula.latex} raw={formula.latex} />
            {formula.explanation && <p className="text-xs leading-5 text-[var(--stemotion-muted)]">{formula.explanation}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

function RagQualityPanel({ report }: { report: RagQualityReport }) {
  const visibleChecks = report.checks;
  const agentReviews = report.agent_reviews ?? [];
  const decision = qualityDecisionMeta(report.decision, report.passed);
  const failedChecks = visibleChecks.filter((check) => !check.passed);
  const riskCheck = [...failedChecks].sort((a, b) => qualitySeverityRank(b.severity) - qualitySeverityRank(a.severity))[0];
  const presentationCheck = visibleChecks.find((check) => check.name === '最终呈现质量');
  const detailsCount = visibleChecks.length + agentReviews.length + (report.revision_trace?.length ?? 0);
  return (
    <section className="rounded-lg border border-[var(--stemotion-border)] bg-white px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={17} className={report.passed ? 'text-[var(--stemotion-primary)]' : 'text-[var(--stemotion-amber)]'} />
          <div>
            <p className="text-sm font-semibold text-[var(--stemotion-ink)]">多 Agent 复核</p>
            <p className="text-xs text-[var(--stemotion-muted)]">
              默认收纳细则，优先保留答案阅读空间。
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${decision.className}`}>
            {decision.label}
          </span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            report.passed
              ? 'bg-[var(--stemotion-primary-soft)] text-[var(--stemotion-primary-strong)]'
              : 'bg-[var(--stemotion-amber-soft)] text-[var(--stemotion-amber)]'
          }`}>
            复核分 {report.score}
          </span>
          {presentationCheck && (
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              presentationCheck.passed
                ? 'bg-[var(--stemotion-primary-soft)] text-[var(--stemotion-primary-strong)]'
                : 'bg-red-50 text-red-700'
            }`}>
              呈现{presentationCheck.passed ? '正常' : '需检查'}
            </span>
          )}
        </div>
      </div>
      {riskCheck && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-[var(--stemotion-amber-soft)] px-3 py-2 text-xs leading-5 text-[var(--stemotion-amber)]">
          <span className="font-semibold">最高风险提示：</span>{riskCheck.message}
        </div>
      )}
      <details className="group mt-3">
        <summary className="stemotion-pressable flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-[var(--stemotion-border)] bg-[#fbfaf6] px-3 py-2 text-xs font-semibold text-[var(--stemotion-ink)] marker:hidden">
          <span>查看复核细则（{detailsCount} 项）</span>
          <ChevronDown size={16} className="shrink-0 text-[var(--stemotion-muted)] transition group-open:rotate-180" />
        </summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {visibleChecks.map((check) => (
            <div key={check.name} className="rounded-lg border border-[var(--stemotion-border)] bg-[#fbfaf6] px-3 py-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--stemotion-ink)]">
                {check.passed ? (
                  <CheckCircle2 size={14} className="text-[var(--stemotion-primary)]" />
                ) : (
                  <AlertTriangle size={14} className={check.severity === 'error' ? 'text-red-600' : 'text-[var(--stemotion-amber)]'} />
                )}
                {check.name}
              </div>
              <p className="mt-1 text-xs leading-5 text-[var(--stemotion-muted)]">{check.message}</p>
            </div>
          ))}
        </div>
        {agentReviews.length > 0 && (
          <div className="mt-3 space-y-2">
            {agentReviews.map((review) => (
              <div key={review.agent_name} className="rounded-lg border border-[var(--stemotion-border)] bg-[#fbfaf6] px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[var(--stemotion-ink)]">{agentReviewLabel(review.agent_name)}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    review.passed
                      ? 'bg-[var(--stemotion-primary-soft)] text-[var(--stemotion-primary-strong)]'
                      : 'bg-[var(--stemotion-amber-soft)] text-[var(--stemotion-amber)]'
                  }`}>
                    {review.score}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-[var(--stemotion-muted)]">{review.summary}</p>
                {review.issues.slice(0, 2).map((issue, issueIndex) => (
                  <p key={`${review.agent_name}-${issueIndex}`} className="mt-1 text-xs leading-5 text-[var(--stemotion-muted)]">
                    <span className="font-semibold text-[var(--stemotion-ink)]">{issue.severity}</span>
                    {' · '}
                    {issue.message}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}
        {report.revision_trace && report.revision_trace.length > 0 && (
          <div className="mt-3 rounded-lg border border-teal-100 bg-[var(--stemotion-primary-soft)] px-3 py-2 text-xs leading-5 text-[var(--stemotion-primary-strong)]">
            {report.revision_trace.map((trace) => (
              <p key={trace.round}>
                第 {trace.round} 轮定向改写：{trace.applied ? '已应用' : '未应用'}。{trace.reason}
              </p>
            ))}
          </div>
        )}
      </details>
    </section>
  );
}

function qualitySeverityRank(severity: string) {
  if (severity === 'critical') return 4;
  if (severity === 'error') return 3;
  if (severity === 'warning') return 2;
  return 1;
}

function qualityDecisionMeta(decision: RagQualityReport['decision'], passed: boolean) {
  if (decision === 'accept') {
    return { label: '通过', className: 'bg-[var(--stemotion-primary-soft)] text-[var(--stemotion-primary-strong)]' };
  }
  if (decision === 'accept_with_warnings') {
    return { label: '有提醒', className: 'bg-[var(--stemotion-amber-soft)] text-[var(--stemotion-amber)]' };
  }
  if (decision === 'revise') {
    return { label: '建议修订', className: 'bg-[var(--stemotion-amber-soft)] text-[var(--stemotion-amber)]' };
  }
  if (decision === 'reject') {
    return { label: '未通过', className: 'bg-red-50 text-red-700' };
  }
  return passed
    ? { label: '通过', className: 'bg-[var(--stemotion-primary-soft)] text-[var(--stemotion-primary-strong)]' }
    : { label: '需关注', className: 'bg-[var(--stemotion-amber-soft)] text-[var(--stemotion-amber)]' };
}

function agentReviewLabel(agentName: string): string {
  const labels: Record<string, string> = {
    CitationGroundingReviewer: '引用一致性',
    PhysicsReasoningReviewer: '物理推导',
    PedagogyReviewer: '教学表达',
    SafetyBoundaryReviewer: '安全边界',
    PresentationReviewer: '最终呈现质量',
  };
  return labels[agentName] ?? agentName;
}

function MarkdownBlock({
  content,
  sectionTitle,
  citations = [],
  onCitationClick,
}: {
  content: string;
  sectionTitle: string;
  citations?: Citation[];
  onCitationClick?: (ref: string) => void;
}) {
  const blocks = parseMarkdownLite(content, sectionTitle);
  if (blocks.length === 0) {
    return <p className="mt-2 text-sm leading-7 text-[var(--stemotion-muted)]">暂无结构化内容。</p>;
  }
  return (
    <div className="mt-3 space-y-3 text-sm leading-7 text-slate-700">
      {blocks.map((block, index) => renderMarkdownBlock(block, index, { citations, onCitationClick }))}
    </div>
  );
}

function renderMarkdownBlock(
  block: MarkdownLiteBlock,
  index: number,
  citationContext: CitationRenderContext,
) {
  if (block.type === 'math_block') {
    return <MathBlock key={`math-${index}`} latex={block.latex} raw={block.raw} />;
  }
  if (block.type === 'heading') {
    return (
      <h4 key={`heading-${index}`} className="mt-3 text-sm font-semibold text-[var(--stemotion-ink)]">
        {renderInlineTokens(block.tokens, citationContext)}
      </h4>
    );
  }
  if (block.type === 'list') {
    const ListTag = block.ordered ? 'ol' : 'ul';
    return (
      <ListTag key={`list-${index}`} className={`space-y-1 pl-5 ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
        {block.items.map((item, itemIndex) => (
          <li key={`item-${itemIndex}`} className="pl-1">
            {renderInlineTokens(item, citationContext)}
          </li>
        ))}
      </ListTag>
    );
  }
  return (
    <p key={`paragraph-${index}`} className="break-words">
      {renderInlineTokens(block.tokens, citationContext)}
    </p>
  );
}

interface CitationRenderContext {
  citations: Citation[];
  onCitationClick?: (ref: string) => void;
}

function renderInlineTokens(tokens: MarkdownInlineToken[], citationContext: CitationRenderContext) {
  return tokens.map((token, index) => {
    if (token.type === 'strong') {
      return <strong key={index} className="font-semibold text-[var(--stemotion-ink)]">{token.text}</strong>;
    }
    if (token.type === 'code') {
      return (
        <code key={index} className="rounded bg-white px-1.5 py-0.5 font-mono text-[0.92em] text-[var(--stemotion-primary-strong)] ring-1 ring-teal-100">
          {token.text}
        </code>
      );
    }
    if (token.type === 'citation') {
      const resolved = resolveCitationRef(token.text, citationContext.citations);
      if (resolved?.resolved) {
        return (
          <button
            key={index}
            type="button"
            onClick={() => citationContext.onCitationClick?.(token.text)}
            title={resolved.description}
            aria-label={resolved.description}
            className="mx-0.5 inline-flex cursor-pointer rounded-full bg-[var(--stemotion-blue-soft)] px-1.5 py-0.5 align-baseline text-[0.78em] font-semibold text-[var(--stemotion-blue)] ring-1 ring-blue-100 transition hover:bg-white hover:ring-[var(--stemotion-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--stemotion-blue)]"
          >
            {token.text}
          </button>
        );
      }
      return (
        <span
          key={index}
          title={resolved?.description ?? '未识别的引用标记'}
          className="mx-0.5 inline-flex rounded-full bg-slate-100 px-1.5 py-0.5 text-[0.78em] font-semibold text-slate-500 ring-1 ring-slate-200"
        >
          {token.text}
        </span>
      );
    }
    if (token.type === 'math_inline') {
      return <MathInline key={index} latex={token.latex} raw={token.raw} />;
    }
    return <span key={index}>{token.text}</span>;
  });
}

function MathInline({ latex, raw }: { latex: string; raw: string }) {
  const rendered = renderLatexToString(latex, false);
  if (!rendered.ok || !rendered.html) {
    return (
      <code title={rendered.error ?? '公式渲染失败'} className="rounded bg-red-50 px-1.5 py-0.5 font-mono text-[0.92em] text-red-700 ring-1 ring-red-100">
        {raw}
      </code>
    );
  }
  return (
    <span
      className="mx-0.5 inline-block align-baseline"
      dangerouslySetInnerHTML={{ __html: rendered.html }}
    />
  );
}

function MathBlock({ latex, raw }: { latex: string; raw: string }) {
  const rendered = renderLatexToString(latex, true);
  if (!rendered.ok || !rendered.html) {
    return (
      <div className="my-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2">
        <p className="text-xs font-semibold text-red-700">公式渲染失败</p>
        <code className="mt-2 block overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-red-700">{raw}</code>
      </div>
    );
  }
  return (
    <div className="my-3 overflow-x-auto rounded-lg border border-teal-100 bg-white px-3 py-3 shadow-sm">
      <div
        className="min-w-max text-center text-[var(--stemotion-ink)]"
        dangerouslySetInnerHTML={{ __html: rendered.html }}
      />
    </div>
  );
}

function StructuredCitationList({ citations, fallback }: { citations: Citation[]; fallback: string }) {
  if (citations.length === 0) {
    return <MarkdownBlock content={fallback || '当前知识库和网络检索中未找到可靠依据。'} sectionTitle="引用来源" />;
  }
  return (
    <div className="mt-3 space-y-2">
      {citations.map((citation) => (
        <div key={citation.source_type === 'local' ? citation.chunk_id : citation.url} className="rounded-lg border border-[var(--stemotion-border)] bg-white px-3 py-2 text-xs leading-5 text-slate-600">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 font-semibold ${
              citation.source_type === 'local'
                ? 'bg-[var(--stemotion-primary-soft)] text-[var(--stemotion-primary-strong)]'
                : 'bg-[var(--stemotion-blue-soft)] text-[var(--stemotion-blue)]'
            }`}>
              {citationRefForCitation(citation, citations)} {citation.source_type === 'local' ? '本地课程资料' : '网络补充资料'}
            </span>
            <span className="font-semibold text-[var(--stemotion-ink)]">
              {citation.source_type === 'local' ? citation.file_name : citation.title}
            </span>
          </div>
          {citation.source_type === 'local' ? (
            <p>{citation.page ? `第 ${citation.page} 页 · ` : ''}{citation.chunk_id}</p>
          ) : (
            <>
              <p>{citation.snippet}</p>
              <p className="mt-1 break-all text-slate-400">{citation.url}</p>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function SkillModal({ subject, onClose }: { subject: SubjectInfo; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#172033]/55 p-4 backdrop-blur-sm">
      <div className="stemotion-elevated custom-scrollbar max-h-[86vh] w-full max-w-2xl overflow-y-auto rounded-lg p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-[var(--stemotion-primary-strong)]">Skill 配置</p>
            <h2 className="mt-1 text-xl font-bold text-[var(--stemotion-ink)]">{subject.display_name}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--stemotion-muted)]">{subject.description}</p>
          </div>
          <button type="button" onClick={onClose} className="stemotion-pressable rounded-lg p-2 text-slate-500 transition hover:bg-[var(--stemotion-primary-soft)] hover:text-[var(--stemotion-primary-strong)]" aria-label="关闭 Skill 配置">
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <InfoBlock title="知识库来源">
            <p>文件数：{subject.knowledge_status?.file_count ?? 0}</p>
            <p>片段数：{subject.knowledge_status?.chunk_count ?? 0}</p>
            <p>索引状态：{subject.knowledge_status?.indexed ? '已索引' : '未索引'}</p>
          </InfoBlock>
          <InfoBlock title="检索配置">
            <p>top_k：{subject.retrieval.top_k}</p>
            <p>阈值：{Math.round(subject.retrieval.score_threshold * 100)}%</p>
            <p>网络检索：{subject.retrieval.enable_web_search ? '启用' : '关闭'}</p>
          </InfoBlock>
          <InfoBlock title="可用工具">
            <div className="flex flex-wrap gap-2">
              {subject.tools.map((tool) => <Tag key={tool}>{toolLabel(tool)}</Tag>)}
            </div>
          </InfoBlock>
          <InfoBlock title="回答规范">
            <div className="flex flex-wrap gap-2">
              {subject.answer_requirements.map((item) => <Tag key={item}>{item}</Tag>)}
            </div>
          </InfoBlock>
        </div>
      </div>
    </div>
  );
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--stemotion-border)] bg-[#fbfaf6] p-4 text-sm leading-6 text-slate-700">
      <h3 className="mb-2 font-semibold text-[var(--stemotion-ink)]">{title}</h3>
      {children}
    </section>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-teal-100 bg-white px-2.5 py-1 text-xs font-semibold text-[var(--stemotion-primary-strong)] shadow-sm">{children}</span>;
}

async function readRagVisualizationEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: DeepInteractionStreamEvent) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: !done });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        const line = part.split('\n').find((item) => item.startsWith('data: '));
        if (!line) continue;
        onEvent(JSON.parse(line.slice(6)) as DeepInteractionStreamEvent);
      }
    }
    if (done) break;
  }
}

function labelRagVisualizationEvent(event: DeepInteractionStreamEvent): string {
  if (event.type === 'progress') return event.message;
  if (event.type === 'schema_generated') return '题目提取与互动合约已生成。';
  if (event.type === 'validation_started') return event.message;
  if (event.type === 'feedback_started') return event.message;
  if (event.type === 'feedback_iteration_started') return event.message;
  if (event.type === 'evaluator_started') return event.message;
  if (event.type === 'evaluator_completed') {
    return `${event.evaluation.agentName}：${event.evaluation.score}/100${event.evaluation.passed ? ' 通过' : ' 待修复'}`;
  }
  if (event.type === 'judge_decision') {
    const label = event.decision.type === 'accept' ? '通过' : event.decision.type === 'repair' ? '修复' : event.decision.type;
    return `Judge：${label}（${event.decision.finalScore}/100）`;
  }
  if (event.type === 'repair_started') return event.message;
  if (event.type === 'repair_completed') return `修复完成：${event.changeLog.join('；') || '无变更'}`;
  if (event.type === 'feedback_completed') return `审计完成：${event.qualityReport.finalScore}/100`;
  return '';
}

function normalizeScore(rawScore: number): number {
  if (!Number.isFinite(rawScore)) return 0;
  if (rawScore <= 0) return 0;
  if (rawScore <= 1) return Math.round(rawScore * 100);
  return Math.max(0, Math.min(100, Math.round(rawScore)));
}

function relevanceLabel(percent: number): string {
  if (percent >= 70) return '相关度：高';
  if (percent >= 35) return '相关度：中';
  return '相关度：低';
}

function sourceDomId(key: string): string {
  return `citation-source-${encodeURIComponent(key)}`;
}

function similarityTone(percent: number): { badgeClass: string; barClass: string } {
  if (percent >= 70) {
    return {
      badgeClass: 'rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700',
      barClass: 'bg-emerald-600',
    };
  }
  if (percent >= 35) {
    return {
      badgeClass: 'rounded-full bg-[var(--stemotion-blue-soft)] px-2 py-0.5 text-[var(--stemotion-blue)]',
      barClass: 'bg-[var(--stemotion-blue)]',
    };
  }
  return {
    badgeClass: 'rounded-full bg-[var(--stemotion-amber-soft)] px-2 py-0.5 text-[var(--stemotion-amber)]',
    barClass: 'bg-[var(--stemotion-amber)]',
  };
}

function fallbackSections(answer: string, citations: Citation[], taskType: TaskType): AnswerSection[] {
  const citationContent = citations.length ? citations.map((item) => item.source_type === 'local' ? `${citationRefForCitation(item, citations)} ${item.file_name}` : `${citationRefForCitation(item, citations)} ${item.title}`).join('\n') : '暂无引用来源。';
  switch (taskType) {
    case 'step_solution':
      return [
        { id: 'extract', title: '题目信息提取', content: answer },
        { id: 'model', title: '物理模型判断', content: '' },
        { id: 'derivation', title: '分步推导', content: '' },
        { id: 'result', title: '计算结果', content: '' },
        { id: 'pitfalls', title: '易错点', content: '' },
        { id: 'citations', title: '引用来源', content: citationContent },
      ];
    case 'knowledge_qa':
      return [
        { id: 'concept', title: '核心概念', content: answer },
        { id: 'explanation', title: '物理解释', content: '' },
        { id: 'formulas', title: '关键公式', content: '' },
        { id: 'misconceptions', title: '常见误区', content: '' },
        { id: 'citations', title: '引用来源', content: citationContent },
      ];
    case 'misconception_diagnosis':
      return [
        { id: 'judgement', title: '判断结果', content: answer },
        { id: 'cause', title: '错因分析', content: '' },
        { id: 'correction', title: '纠正思路', content: '' },
        { id: 'practice', title: '巩固练习', content: '' },
        { id: 'citations', title: '引用来源', content: citationContent },
      ];
    case 'teacher_prep':
      return [
        { id: 'objectives', title: '教学目标', content: answer },
        { id: 'intro', title: '课堂导入', content: '' },
        { id: 'blackboard', title: '核心公式', content: '' },
        { id: 'visualization', title: '动态演示参数', content: '' },
        { id: 'questions', title: '互动提问', content: '' },
        { id: 'practice', title: '课后练习', content: '' },
        { id: 'citations', title: '引用来源', content: citationContent },
      ];
  }
}

function parseProjectileHint(question: string): VisualizationHint | undefined {
  if (!/(抛|斜抛|projectile)/i.test(question)) return undefined;
  const v0 = matchNumber(question, /(\d+(?:\.\d+)?)\s*(?:m\/s|米\/秒|米每秒)/i);
  const angle = matchNumber(question, /(\d+(?:\.\d+)?)\s*(?:°|度)/);
  return {
    type: 'projectile_motion',
    parameters: {
      v0,
      angle_deg: angle,
      g: 9.8,
    },
  };
}

function matchNumber(value: string, pattern: RegExp): number | undefined {
  const matched = pattern.exec(value);
  if (!matched) return undefined;
  const parsed = Number(matched[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function createDemoFallback(demo: DemoCase, subject?: SubjectInfo): RagResult {
  const hint = demo.fallbackVisualizationHint ?? parseProjectileHint(demo.question);
  const localCitations = demo.fallbackCitations.filter((citation) => citation.source_type === 'local');
  const webCitations = demo.fallbackCitations.filter((citation) => citation.source_type === 'web');
  return {
    subject: subject?.name ?? 'physics_mechanics',
    subject_display_name: subject?.display_name ?? '大学物理力学',
    task_type: demo.taskType,
    answer: '演示样例结果：本回答优先基于本地知识库生成；网络检索结果仅作为补充参考。',
    answer_sections: demo.fallbackAnswerSections,
    visualization_hint: hint,
    citations: demo.fallbackCitations,
    retrieved_chunks: [{
      content: demo.expectedHighlights.join('；'),
      score: demo.fallbackCitations.length ? 0.82 : 0,
      metadata: {
        source: localCitations[0]?.source ?? 'demo_fallback',
        subject: demo.subject,
        file_name: localCitations[0]?.file_name ?? demo.title,
        chunk_id: localCitations[0]?.chunk_id ?? `${demo.id}_demo_fallback`,
        created_at: new Date().toISOString(),
        source_type: localCitations.length ? 'local' : webCitations.length ? 'web' : undefined,
      },
    }],
    source_summary: { local_count: localCitations.length, web_count: webCitations.length },
    demo_fallback: true,
  };
}

function toolLabel(value: string): string {
  const labels: Record<string, string> = {
    formula_reasoning: '分步推导',
    unit_check: '单位检查',
    visualization_parameters: '运动可视化',
    symbolic_reasoning: '符号推理',
    error_hint: '错因提醒',
    reaction_check: '方程式检查',
    safety_hint: '安全提醒',
    code_reasoning: '代码解释',
    complexity_analysis: '复杂度分析',
    test_case_design: '测试建议',
  };
  return labels[value] ?? value;
}

function taskTypeLabel(value: TaskType): string {
  const labels: Record<TaskType, string> = {
    knowledge_qa: '知识讲解',
    step_solution: '分步解题',
    misconception_diagnosis: '错因诊断',
    teacher_prep: '教师备课',
  };
  return labels[value];
}

function formatSessionTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '刚刚';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
