'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Send } from 'lucide-react';
import type {
  DeepInteractionType,
  GuidedClarificationAnswer,
  GuidedClarificationQuestion,
  GuidedGenerationPlan,
  GuidedPlanningResult,
  InteractionArtifact,
  InteractionSession,
} from '@/lib/deep-interaction/types';
import { interactionTypeMeta } from '@/lib/deep-interaction/rendererRegistry';
import { makeId } from '@/lib/utils/makeId';
import FollowUpInput from './FollowUpInput';
import GenerationProgressPanel from './GenerationProgressPanel';
import GuidedPlanningPanel from './GuidedPlanningPanel';
import AgentReviewPanel from './AgentReviewPanel';
import QualityExplanationPanel from './QualityExplanationPanel';
import StudyModePanel from './StudyModePanel';
import TemplateMatchPanel from './TemplateMatchPanel';
import { useDeepInteractionUIStore } from '@/lib/stores/deepInteractionUIStore';
import { useResearchLogStore } from '@/lib/stores/researchLogStore';

export default function DeepInteractionRightPanel({
  selectedType,
  currentArtifact,
  currentSession,
  isGenerating,
  isFollowingUp = false,
  mobile = false,
  onGenerate,
  onFollowUp,
}: {
  selectedType: DeepInteractionType;
  currentArtifact: InteractionArtifact | null;
  currentSession: InteractionSession | null;
  isGenerating: boolean;
  isFollowingUp?: boolean;
  mobile?: boolean;
  onGenerate: (prompt: string, guidedPlan?: GuidedGenerationPlan) => void;
  onFollowUp: (prompt: string) => void;
}) {
  const searchParams = useSearchParams();
  const setPendingPrompt = useDeepInteractionUIStore((state) => state.setPendingPrompt);
  const [prompt, setPrompt] = useState(() => searchParams.get('prompt') ?? '');
  const [pendingApplied, setPendingApplied] = useState(false);

  const pendingPrompt = useSyncExternalStore(
    useDeepInteractionUIStore.subscribe,
    () => useDeepInteractionUIStore.getState().pendingPrompt,
    () => '',
  );

  if (pendingPrompt && !pendingApplied) {
    setPendingApplied(true);
    setPrompt(pendingPrompt);
    setPendingPrompt('');
  }

  if (!pendingPrompt && pendingApplied) {
    setPendingApplied(false);
  }
  const [planningPrompt, setPlanningPrompt] = useState('');
  const [planningSessionId, setPlanningSessionId] = useState('');
  const [planningRound, setPlanningRound] = useState(0);
  const [planningLoading, setPlanningLoading] = useState(false);
  const [planningError, setPlanningError] = useState<string | null>(null);
  const [clarificationQuestions, setClarificationQuestions] = useState<GuidedClarificationQuestion[]>([]);
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, string>>({});
  const [guidedPlan, setGuidedPlan] = useState<GuidedGenerationPlan | null>(null);
  const selectedMeta = interactionTypeMeta[selectedType];
  const logResearchEvent = useResearchLogStore((state) => state.logEvent);

  useEffect(() => {
    if (!currentArtifact?.qualityReport) return;
    logResearchEvent({
      type: 'quality_report_viewed',
      sessionId: currentArtifact.sessionId,
      artifactId: currentArtifact.id,
      payload: {
        qualityLevel: currentArtifact.qualityReport.level,
        artifactId: currentArtifact.id,
        templateId: currentArtifact.templateMetadata?.templateId,
      },
    });
  }, [currentArtifact?.id, currentArtifact?.qualityReport, currentArtifact?.sessionId, currentArtifact?.templateMetadata?.templateId, logResearchEvent]);

  const submit = () => {
    if (!prompt.trim() || isGenerating || planningLoading) return;
    const nextPlanningSessionId = makeId('planning');
    void requestPlanning(prompt.trim(), [], 0, nextPlanningSessionId);
  };

  const requestPlanning = async (
    sourcePrompt: string,
    answers: GuidedClarificationAnswer[],
    clarificationRound: number,
    sessionId: string,
  ) => {
    setPlanningLoading(true);
    setPlanningError(null);
    setPlanningPrompt(sourcePrompt);
    setPlanningSessionId(sessionId);

    if (clarificationRound === 0 && answers.length === 0) {
      logResearchEvent({
        type: 'planning_started',
        payload: {
          promptLength: sourcePrompt.length,
          preferredType: selectedType,
          planningSessionId: sessionId,
        },
      });
    }

    try {
      const response = await fetch('/api/v1/deep-interaction/planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: sourcePrompt,
          preferredType: selectedType,
          planningSessionId: sessionId,
          answers,
          clarificationRound,
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorData.error ?? '规划失败，请稍后重试。');
      }

      const result = (await response.json()) as GuidedPlanningResult;
      setPlanningRound(result.clarificationRound);

      if (result.status === 'clarification_required') {
        setGuidedPlan(null);
        setClarificationQuestions(result.questions);
        setClarificationAnswers({});
      } else {
        setClarificationQuestions([]);
        setClarificationAnswers({});
        setGuidedPlan(result.plan);
      }
    } catch (error) {
      setPlanningError(error instanceof Error ? error.message : '规划失败，请稍后重试。');
    } finally {
      setPlanningLoading(false);
    }
  };

  const submitClarificationAnswers = () => {
    const answers = clarificationQuestions
      .map((question) => ({
        questionId: question.id,
        answer: clarificationAnswers[question.id]?.trim() ?? '',
      }))
      .filter((answer) => answer.answer);

    if (!answers.length || !planningPrompt || !planningSessionId) return;

    logResearchEvent({
      type: 'clarification_answered',
      payload: {
        planningSessionId,
        clarificationRound: planningRound,
        answerCount: answers.length,
      },
    });
    void requestPlanning(planningPrompt, answers, planningRound, planningSessionId);
  };

  const approveGuidedPlan = () => {
    if (!guidedPlan || !planningPrompt || isGenerating) return;
    const approvedPlan = { ...guidedPlan, approvedAt: new Date().toISOString() };
    logResearchEvent({
      type: 'plan_approved',
      payload: {
        planningSessionId: approvedPlan.planningSessionId,
        subjectDomain: approvedPlan.subjectDomain,
        topic: approvedPlan.topic,
        interactionType: approvedPlan.interactionType,
        templateId: approvedPlan.possibleTemplate?.templateId,
        clarificationCount: planningRound,
      },
    });
    onGenerate(planningPrompt, approvedPlan);
    resetPlanning();
    setPrompt('');
  };

  const resetPlanning = () => {
    setPlanningPrompt('');
    setPlanningSessionId('');
    setPlanningRound(0);
    setPlanningLoading(false);
    setPlanningError(null);
    setClarificationQuestions([]);
    setClarificationAnswers({});
    setGuidedPlan(null);
  };

  return (
    <div
      className={
        mobile
          ? 'max-h-[56vh] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl'
          : 'flex h-full flex-col overflow-hidden'
      }
    >
      <div className="border-b border-slate-100 p-5">
        <h2 className="text-base font-black">AI 交互生成</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          先选择交互方式，再输入学习主题。系统会生成可运行的 HTML/SVG/Canvas 互动页，并自动保存到交互库。
        </p>
        <div className={`mt-4 rounded-lg border px-3 py-2 text-xs font-bold ${selectedMeta.accent}`}>
          将生成：{selectedMeta.label}
        </div>
      </div>

      <div className="custom-scrollbar flex-1 space-y-5 overflow-y-auto p-5">
        <div>
          <label className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-400">
            生成提示词
          </label>
          <div className="flex gap-2">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit();
              }}
              placeholder="例如：生成一个酸碱中和滴定动画"
              className="min-h-24 flex-1 resize-none rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
            <button
              type="button"
              onClick={submit}
              disabled={!prompt.trim() || isGenerating || planningLoading}
              aria-label="生成交互"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400"
            >
              {isGenerating || planningLoading ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
            </button>
          </div>
        </div>

        <GuidedPlanningPanel
          loading={planningLoading}
          error={planningError}
          questions={clarificationQuestions}
          answers={clarificationAnswers}
          plan={guidedPlan}
          onAnswerChange={(questionId, answer) =>
            setClarificationAnswers((current) => ({ ...current, [questionId]: answer }))
          }
          onSubmitAnswers={submitClarificationAnswers}
          onApprove={approveGuidedPlan}
          onReset={resetPlanning}
        />

        <GenerationProgressPanel />

        <TemplateMatchPanel templateMetadata={currentArtifact?.templateMetadata} />

        <AgentReviewPanel />

        <QualityExplanationPanel
          qualityReport={currentArtifact?.qualityReport}
          blueprint={currentArtifact?.blueprint}
          templateMetadata={currentArtifact?.templateMetadata}
        />

        <StudyModePanel />

        {currentSession && (
          <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 text-xs font-black uppercase tracking-wider text-slate-400">会话消息</div>
            <div className="space-y-2">
              {currentSession.messages.slice(-5).map((message) => (
                <div
                  key={message.id}
                  className={`rounded-lg p-3 text-xs leading-relaxed ${
                    message.role === 'user' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'
                  }`}
                >
                  {message.content}
                </div>
              ))}
            </div>
          </section>
        )}

        {currentArtifact && (
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-2 text-xs font-black uppercase tracking-wider text-slate-400">当前交互</div>
            <h3 className="text-sm font-black">{currentArtifact.title}</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">{currentArtifact.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {currentArtifact.schema.learningGoals.map((goal) => (
                <span key={goal} className="rounded-md bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700">
                  {goal}
                </span>
              ))}
            </div>
            <div className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
              已保存到交互库
            </div>
          </section>
        )}

        {currentArtifact && <FollowUpInput disabled={isGenerating} loading={isFollowingUp} onSubmit={onFollowUp} />}
      </div>
    </div>
  );
}
