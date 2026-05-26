'use client';

import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BookOpenCheck,
  ChevronDown,
  Clipboard,
  Database,
  Eye,
  FileText,
  Globe2,
  Loader2,
  Play,
  Search,
  X,
} from 'lucide-react';

type TaskType = 'knowledge_qa' | 'step_solution' | 'misconception_diagnosis' | 'teacher_prep';

interface SubjectInfo {
  name: string;
  display_name: string;
  description: string;
  retrieval: {
    top_k: number;
    score_threshold: number;
    enable_web_search: boolean;
    web_top_k: number;
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
  answer: string;
  answer_sections?: AnswerSection[];
  visualization_hint?: VisualizationHint;
  citations: Citation[];
  source_summary: {
    local_count: number;
    web_count: number;
  };
  retrieved_chunks: Array<{
    content: string;
    score: number;
    metadata: Record<string, unknown>;
  }>;
  demo_fallback?: boolean;
}

interface DemoCase {
  id: string;
  title: string;
  taskType: TaskType;
  question: string;
  note: string;
}

const TASK_MODES: Array<{ id: TaskType; label: string; description: string }> = [
  { id: 'knowledge_qa', label: '知识问答', description: '讲清概念与适用条件' },
  { id: 'step_solution', label: '分步解题', description: '提取信息并推导公式' },
  { id: 'misconception_diagnosis', label: '错因诊断', description: '定位常见错误与修正路径' },
  { id: 'teacher_prep', label: '教师备课', description: '生成课堂讲解与演示建议' },
];

const DEMO_CASES: DemoCase[] = [
  {
    id: 'projectile',
    title: '斜抛运动分步解题',
    taskType: 'step_solution',
    question: '一个小球以20m/s初速度、30度角斜抛，求最大高度和水平射程。',
    note: '稳定展示本地课程资料、分步推导和轨迹图。',
  },
  {
    id: 'circular',
    title: '圆周运动概念讲解',
    taskType: 'knowledge_qa',
    question: '为什么匀速圆周运动速度大小不变，却仍然有加速度？',
    note: '适合展示概念解释和来源追溯。',
  },
  {
    id: 'mistake',
    title: '学生错误答案诊断',
    taskType: 'misconception_diagnosis',
    question: '学生把斜抛最大高度直接写成 v0²/2g，这个错误在哪里？',
    note: '适合展示错因诊断和教学反馈。',
  },
  {
    id: 'teacher',
    title: '教师课堂演示生成',
    taskType: 'teacher_prep',
    question: '请设计一个讲解斜抛运动最大高度和射程的5分钟课堂演示。',
    note: '适合展示助教备课场景。',
  },
];

const DEFAULT_QUESTION = DEMO_CASES[0].question;

export default function SubjectRagConsole() {
  const [subjects, setSubjects] = useState<SubjectInfo[]>([]);
  const [subject, setSubject] = useState('physics_mechanics');
  const [taskType, setTaskType] = useState<TaskType>('step_solution');
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [useWebSearch, setUseWebSearch] = useState(true);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [asking, setAsking] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RagResult | null>(null);
  const [activeDemoId, setActiveDemoId] = useState<string | null>('projectile');
  const [skillOpen, setSkillOpen] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [showTrajectory, setShowTrajectory] = useState(false);
  const [showAnimation, setShowAnimation] = useState(false);
  const loadingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch('/api/subjects')
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

  const activeSubject = useMemo(
    () => subjects.find((item) => item.name === subject),
    [subject, subjects],
  );
  const activeDemo = DEMO_CASES.find((item) => item.id === activeDemoId) ?? null;
  const activeTask = TASK_MODES.find((item) => item.id === taskType) ?? TASK_MODES[1];
  const localCitations = result?.citations.filter((citation) => citation.source_type === 'local') ?? [];
  const webCitations = result?.citations.filter((citation) => citation.source_type === 'web') ?? [];
  const visualizationHint = result?.visualization_hint ?? parseProjectileHint(question);
  const lowLocalMatch = result
    ? result.retrieved_chunks.some((chunk) => chunk.metadata.source_type === 'local' && normalizeScore(chunk.score) < 35)
    : false;

  const ask = async () => {
    if (!question.trim()) {
      setError('请输入问题');
      return;
    }

    setAsking(true);
    setError(null);
    setShowTrajectory(false);
    setShowAnimation(false);
    startLoadingSteps();
    try {
      const response = await fetch('/api/rag/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          subject,
          use_web_search: useWebSearch,
          task_type: taskType,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? '问答请求失败');
      setResult(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : '问答请求失败';
      if (activeDemo) {
        setResult(createDemoFallback(activeDemo, activeSubject));
        setError('RAG 请求失败，已切换为演示样例结果。');
      } else {
        setError(message);
      }
    } finally {
      stopLoadingSteps();
      setAsking(false);
    }
  };

  const applyDemo = (demo: DemoCase) => {
    setActiveDemoId(demo.id);
    setTaskType(demo.taskType);
    setQuestion(demo.question);
    setResult(null);
    setError(null);
    setShowTrajectory(false);
    setShowAnimation(false);
  };

  const toggleSource = (key: string) => {
    setExpandedSources((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const copyAnswer = async () => {
    if (!result) return;
    const text = (result.answer_sections ?? []).map((section) => `${section.title}\n${section.content}`).join('\n\n') || result.answer;
    await navigator.clipboard?.writeText(text);
  };

  function startLoadingSteps() {
    stopLoadingSteps();
    setLoadingStep(0);
    loadingTimerRef.current = window.setInterval(() => {
      setLoadingStep((step) => Math.min(step + 1, 2));
    }, 850);
  }

  function stopLoadingSteps() {
    if (loadingTimerRef.current) {
      window.clearInterval(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
    setLoadingStep(0);
  }

  useEffect(() => () => stopLoadingSteps(), []);

  return (
    <div className="stemotion-page flex h-full min-h-0 flex-col overflow-hidden">
      <section className="border-b border-[var(--stemotion-border)] bg-[rgba(255,253,248,0.92)] px-5 py-5 lg:px-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-[var(--stemotion-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--stemotion-primary-strong)]">
                <BookOpenCheck size={16} />
                <span>学科 RAG</span>
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
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
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
        <div className="mx-auto grid w-full max-w-7xl gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
          <main className="min-w-0 space-y-5">
            <section className="stemotion-elevated rounded-lg p-4">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-[var(--stemotion-ink)]">教学任务</h2>
                  <p className="mt-1 text-xs text-[var(--stemotion-muted)]">选择展示场景，系统会按任务组织回答结构。</p>
                </div>
                <div className="grid gap-1 rounded-lg border border-[var(--stemotion-border)] bg-[#f1eee6] p-1 sm:grid-cols-2 lg:grid-cols-4">
                  {TASK_MODES.map((mode) => (
                    <button
                      type="button"
                      key={mode.id}
                      onClick={() => {
                        setTaskType(mode.id);
                        setResult(null);
                      }}
                      className={`min-h-11 rounded-md border px-3 py-2 text-left text-sm transition ${
                        taskType === mode.id
                          ? 'border-white bg-white font-semibold text-[var(--stemotion-primary-strong)] shadow-sm'
                          : 'border-transparent text-slate-600 hover:bg-white/70 hover:text-[var(--stemotion-ink)]'
                      }`}
                    >
                      {mode.label}
                      <span className="mt-0.5 block text-[11px] font-normal leading-4 text-[var(--stemotion-muted)]">{mode.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {DEMO_CASES.map((demo) => (
                  <button
                    type="button"
                    key={demo.id}
                    onClick={() => applyDemo(demo)}
                    className={`stemotion-pressable min-h-[112px] rounded-lg border p-3 text-left transition ${
                      activeDemoId === demo.id
                        ? 'border-teal-300 bg-[var(--stemotion-primary-soft)] shadow-sm'
                        : 'border-[var(--stemotion-border)] bg-[#fbfaf6] hover:border-teal-200 hover:bg-white'
                    }`}
                  >
                    <p className="text-sm font-semibold text-[var(--stemotion-ink)]">{demo.title}</p>
                    <p className="mt-2 text-xs leading-5 text-[var(--stemotion-muted)]">{demo.note}</p>
                  </button>
                ))}
              </div>

              <label className="text-sm font-semibold text-[var(--stemotion-ink)]" htmlFor="rag-question">
                问题输入
              </label>
              <textarea
                id="rag-question"
                value={question}
                onChange={(event) => {
                  setQuestion(event.target.value);
                  setActiveDemoId(null);
                }}
                rows={5}
                placeholder="请输入一个大学物理力学问题，如：斜抛运动最大高度如何计算？"
                className="mt-2 w-full resize-none rounded-lg border border-[var(--stemotion-border)] bg-[#fbfaf6] px-3 py-3 text-sm leading-6 text-[var(--stemotion-ink)] transition focus:border-[var(--stemotion-primary)] focus:bg-white"
              />

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-[var(--stemotion-muted)]">
                  当前任务：{activeTask.label} · 默认学科：大学物理力学
                </p>
                <button
                  type="button"
                  onClick={ask}
                  disabled={asking || loadingSubjects}
                  className="stemotion-pressable inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--stemotion-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--stemotion-primary-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {asking ? <Loader2 size={17} className="animate-spin" /> : <Search size={17} />}
                  {asking ? loadingLabels[loadingStep] : '开始问答'}
                </button>
              </div>
              {asking && <LoadingProgress step={loadingStep} />}
              {error && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-[var(--stemotion-amber-soft)] px-3 py-2 text-sm text-[var(--stemotion-amber)]" role="alert">
                  {error}
                </p>
              )}
            </section>

            <section className="stemotion-elevated rounded-lg p-5" aria-live="polite">
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
                <div className="space-y-4">
                  <p className="rounded-lg border border-teal-100 bg-[var(--stemotion-primary-soft)] px-3 py-2 text-sm leading-6 text-[var(--stemotion-primary-strong)]">
                    本回答优先基于本地知识库生成；网络检索结果仅作为补充参考。
                  </p>
                  {(result.answer_sections ?? fallbackSections(result.answer, result.citations)).map((section, index) => (
                    <section key={section.id} className="relative rounded-lg border border-[var(--stemotion-border)] bg-[#fbfaf6] p-4 pl-14">
                      <span className="absolute left-4 top-4 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--stemotion-primary)] text-xs font-bold text-white shadow-sm">
                        {index + 1}
                      </span>
                      <div className="absolute bottom-4 left-[29px] top-12 w-px bg-teal-100" />
                      <h3 className="text-sm font-semibold text-[var(--stemotion-ink)]">{section.title}</h3>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                        {section.content || '暂无结构化内容。'}
                      </p>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-[var(--stemotion-border-strong)] bg-[#fbfaf6] px-4 py-10 text-center text-sm text-[var(--stemotion-muted)]">
                  选择一个典型案例，或输入大学物理力学问题开始演示。
                </div>
              )}
            </section>

            <VisualizationPanel
              hint={visualizationHint}
              showTrajectory={showTrajectory}
              showAnimation={showAnimation}
              onShowTrajectory={() => setShowTrajectory(true)}
              onShowAnimation={() => {
                setShowTrajectory(true);
                setShowAnimation(true);
              }}
              onCopy={copyAnswer}
            />
          </main>

          <aside className="min-w-0 space-y-5">
            <section className="stemotion-elevated rounded-lg p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--stemotion-ink)]">
                <Database size={17} />
                可信来源台账
              </h3>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <SourceCount label="本地课程资料" count={result?.source_summary.local_count ?? 0} tone="local" />
                <SourceCount label="网络补充资料" count={result?.source_summary.web_count ?? 0} tone="web" />
              </div>
              {lowLocalMatch && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-[var(--stemotion-amber-soft)] px-3 py-2 text-xs leading-5 text-[var(--stemotion-amber)]">
                  当前本地知识库匹配度较低，建议补充课程讲义或启用网络检索。
                </p>
              )}
            </section>

            <CitationPanel
              title="本地课程资料"
              description="优先可信来源"
              icon={<Database size={17} />}
              emptyText="暂无本地课程资料引用"
              citations={localCitations}
              chunks={result?.retrieved_chunks ?? []}
              expandedSources={expandedSources}
              onToggle={toggleSource}
            />
            <CitationPanel
              title="网络检索资料"
              description="补充参考来源"
              icon={<Globe2 size={17} />}
              emptyText="暂无网络补充资料"
              citations={webCitations}
              chunks={result?.retrieved_chunks ?? []}
              expandedSources={expandedSources}
              onToggle={toggleSource}
            />
            {result && (
              <section className="stemotion-panel rounded-lg p-4">
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
          </aside>
        </div>
      </div>

      {skillOpen && activeSubject && (
        <SkillModal subject={activeSubject} onClose={() => setSkillOpen(false)} />
      )}
    </div>
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

function LoadingProgress({ step }: { step: number }) {
  return (
    <div className="mt-4 rounded-lg border border-teal-100 bg-[var(--stemotion-primary-soft)] px-3 py-3">
      <div className="grid gap-2 sm:grid-cols-3">
        {loadingLabels.map((label, index) => {
          const active = index <= step;
          return (
            <div key={label} className="flex items-center gap-2 text-xs font-semibold">
              <span className={`h-2.5 w-2.5 rounded-full ${active ? 'bg-[var(--stemotion-primary)]' : 'bg-white ring-1 ring-teal-200'}`} />
              <span className={active ? 'text-[var(--stemotion-primary-strong)]' : 'text-[var(--stemotion-muted)]'}>{label}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white">
        <div className="h-full rounded-full bg-[var(--stemotion-primary)] transition-all duration-300" style={{ width: `${((step + 1) / loadingLabels.length) * 100}%` }} />
      </div>
    </div>
  );
}

function CitationPanel({
  title,
  description,
  icon,
  emptyText,
  citations,
  chunks,
  expandedSources,
  onToggle,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  emptyText: string;
  citations: Citation[];
  chunks: RagResult['retrieved_chunks'];
  expandedSources: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <section className="stemotion-panel rounded-lg p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--stemotion-ink)]">
        {icon}
        {title}
      </h3>
      <p className="mt-1 text-xs text-[var(--stemotion-muted)]">{description}</p>
      <div className="mt-3 space-y-3">
        {citations.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--stemotion-border)] bg-[#fbfaf6] px-3 py-3 text-sm text-[var(--stemotion-muted)]">{emptyText}</p>
        ) : (
          citations.map((citation) => {
            const key = citation.source_type === 'local' ? citation.chunk_id : citation.url;
            const chunk = chunks.find((item) => item.metadata.chunk_id === key || item.metadata.url === key);
            const expanded = expandedSources.has(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => onToggle(key)}
                aria-expanded={expanded}
                className="stemotion-pressable w-full rounded-lg border border-[var(--stemotion-border)] bg-[#fbfaf6] p-3 text-left text-xs leading-5 text-slate-600 transition hover:border-teal-200 hover:bg-white"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {citation.source_type === 'local' ? (
                      <>
                        <p className="font-semibold text-[var(--stemotion-ink)]">{citation.file_name}</p>
                        <p>{citation.page ? `第 ${citation.page} 页 · ` : ''}{citation.chunk_id}</p>
                        <p className="truncate">{citation.source}</p>
                      </>
                    ) : (
                      <>
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

function VisualizationPanel({
  hint,
  showTrajectory,
  showAnimation,
  onShowTrajectory,
  onShowAnimation,
  onCopy,
}: {
  hint?: VisualizationHint;
  showTrajectory: boolean;
  showAnimation: boolean;
  onShowTrajectory: () => void;
  onShowAnimation: () => void;
  onCopy: () => void;
}) {
  return (
    <section className="stemotion-elevated rounded-lg p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[var(--stemotion-primary-strong)]">STEMotion 可视化</p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--stemotion-ink)]">可视化参数与运动轨迹</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onShowTrajectory} className="stemotion-pressable inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--stemotion-border)] bg-white px-3 text-sm font-semibold text-[var(--stemotion-ink)] transition hover:border-teal-200 hover:bg-[var(--stemotion-primary-soft)] hover:text-[var(--stemotion-primary-strong)]">
            <Activity size={16} />
            生成运动轨迹图
          </button>
          <button type="button" onClick={onShowAnimation} className="stemotion-pressable inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--stemotion-border)] bg-white px-3 text-sm font-semibold text-[var(--stemotion-ink)] transition hover:border-teal-200 hover:bg-[var(--stemotion-primary-soft)] hover:text-[var(--stemotion-primary-strong)]">
            <Play size={16} />
            打开动态演示
          </button>
          <button type="button" onClick={onCopy} className="stemotion-pressable inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--stemotion-ink)] px-3 text-sm font-semibold text-white transition hover:bg-[var(--stemotion-primary-strong)]">
            <Clipboard size={16} />
            复制解题步骤
          </button>
        </div>
      </div>

      {hint ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="rounded-lg border border-teal-100 bg-[var(--stemotion-primary-soft)] p-4 text-sm text-[var(--stemotion-primary-strong)]">
            <p className="font-semibold">建议演示：斜抛运动轨迹</p>
            <dl className="mt-3 space-y-2">
              <div className="flex justify-between gap-3 rounded-md bg-white/70 px-2 py-1.5">
                <dt>初速度 v0</dt>
                <dd>{hint.parameters.v0 ?? '待补充'} m/s</dd>
              </div>
              <div className="flex justify-between gap-3 rounded-md bg-white/70 px-2 py-1.5">
                <dt>角度 θ</dt>
                <dd>{hint.parameters.angle_deg ?? '待补充'}°</dd>
              </div>
              <div className="flex justify-between gap-3 rounded-md bg-white/70 px-2 py-1.5">
                <dt>重力加速度 g</dt>
                <dd>{hint.parameters.g} m/s²</dd>
              </div>
            </dl>
          </div>
          {showTrajectory ? (
            <ProjectileSvg hint={hint} animate={showAnimation} />
          ) : (
            <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-[var(--stemotion-border-strong)] bg-[#fbfaf6] px-4 text-center text-sm text-[var(--stemotion-muted)]">
              点击“生成运动轨迹图”查看斜抛运动可视化。
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-[var(--stemotion-border-strong)] bg-[#fbfaf6] px-4 py-8 text-center text-sm text-[var(--stemotion-muted)]">
          当前问题暂未识别到可视化参数。斜抛运动问题会自动生成轨迹图。
        </div>
      )}
    </section>
  );
}

function ProjectileSvg({ hint, animate }: { hint: VisualizationHint; animate: boolean }) {
  const { v0 = 20, angle_deg: angle = 30, g } = hint.parameters;
  const theta = angle * Math.PI / 180;
  const flightTime = Math.max(0.1, (2 * v0 * Math.sin(theta)) / g);
  const range = Math.max(0.1, (v0 ** 2 * Math.sin(2 * theta)) / g);
  const maxHeight = Math.max(0.1, (v0 ** 2 * Math.sin(theta) ** 2) / (2 * g));
  const points = Array.from({ length: 50 }, (_, index) => {
    const t = flightTime * index / 49;
    const x = v0 * Math.cos(theta) * t;
    const y = v0 * Math.sin(theta) * t - 0.5 * g * t ** 2;
    const sx = 34 + (x / range) * 500;
    const sy = 190 - (y / maxHeight) * 145;
    return `${sx.toFixed(1)},${sy.toFixed(1)}`;
  }).join(' ');
  const markerX = animate ? 34 + 500 * 0.62 : 34 + 250;
  const markerT = animate ? flightTime * 0.62 : flightTime / 2;
  const markerYValue = v0 * Math.sin(theta) * markerT - 0.5 * g * markerT ** 2;
  const markerY = 190 - (markerYValue / maxHeight) * 145;

  return (
    <div className="rounded-lg border border-[var(--stemotion-border)] bg-[#fbfaf6] p-3">
      <svg viewBox="0 0 580 230" role="img" aria-label="斜抛运动轨迹图" className="h-auto w-full">
        <defs>
          <pattern id="projectile-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#e5ded2" strokeWidth="1" />
          </pattern>
        </defs>
        <rect x="20" y="18" width="535" height="190" rx="8" fill="url(#projectile-grid)" />
        <line x1="30" y1="190" x2="545" y2="190" stroke="#8a978f" strokeWidth="2" />
        <line x1="34" y1="198" x2="34" y2="30" stroke="#8a978f" strokeWidth="2" />
        <polyline points={points} fill="none" stroke="#0f766e" strokeWidth="4" strokeLinecap="round" />
        <circle cx="34" cy="190" r="6" fill="#172033" />
        <circle cx={markerX} cy={markerY} r="7" fill="#b45309" className={animate ? 'projectile-pulse' : undefined} />
        <text x="38" y="214" fontSize="13" fill="#667085">发射点</text>
        <text x="422" y="214" fontSize="13" fill="#667085">射程 R ≈ {range.toFixed(2)} m</text>
        <text x="70" y="48" fontSize="13" fill="#667085">最大高度 H ≈ {maxHeight.toFixed(2)} m</text>
      </svg>
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

function fallbackSections(answer: string, citations: Citation[]): AnswerSection[] {
  return [
    { id: 'answer', title: '回答内容', content: answer },
    { id: 'citations', title: '引用来源', content: citations.length ? citations.map((item, index) => item.source_type === 'local' ? `[${index + 1}] ${item.file_name}` : `[${index + 1}] ${item.title}`).join('\n') : '暂无引用来源。' },
  ];
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
  const hint = parseProjectileHint(demo.question);
  return {
    subject: subject?.name ?? 'physics_mechanics',
    subject_display_name: subject?.display_name ?? '大学物理力学',
    task_type: demo.taskType,
    answer: '演示样例结果：本回答优先基于本地知识库生成；网络检索结果仅作为补充参考。',
    answer_sections: [
      { id: 'extract', title: '题目信息提取', content: demo.question },
      { id: 'model', title: '物理模型判断', content: hint ? '该问题属于斜抛运动模型，默认忽略空气阻力。' : '该案例用于演示教学任务流程。' },
      { id: 'derivation', title: '分步推导', content: hint ? '先分解初速度，再分别分析水平匀速运动和竖直匀变速运动。最高点满足 vy = 0，同高落地时射程可由飞行时间和水平速度得到。' : '演示样例用于保障比赛现场流程稳定。' },
      { id: 'result', title: '结果', content: hint ? '最大高度和射程可由可视化参数卡继续计算与演示。' : '暂无数值结果。' },
      { id: 'pitfalls', title: '易错点', content: '不要把网络检索资料伪装为本地课程资料；不要忽略公式适用条件。' },
      { id: 'citations', title: '引用来源', content: '[1] projectile_motion.md（本地课程资料演示引用）' },
    ],
    visualization_hint: hint,
    citations: [{
      source_type: 'local',
      source: 'projectile_motion.md',
      chunk_id: 'demo_projectile_motion_001',
      subject: subject?.name ?? 'physics_mechanics',
      file_name: 'projectile_motion.md',
    }],
    retrieved_chunks: [{
      content: '斜抛运动演示样例片段：忽略空气阻力，速度分解后分别处理水平和竖直方向运动。',
      score: 0.82,
      metadata: {
        source: 'projectile_motion.md',
        subject: subject?.name ?? 'physics_mechanics',
        file_name: 'projectile_motion.md',
        chunk_id: 'demo_projectile_motion_001',
        created_at: new Date().toISOString(),
        source_type: 'local',
      },
    }],
    source_summary: { local_count: 1, web_count: 0 },
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

const loadingLabels = ['检索知识库中', '生成答案中', '整理引用中'];
