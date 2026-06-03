'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useGsapReveal } from '@/lib/animation/useGsapReveal';
import { stemotionMotion } from '@/lib/animation/motionTokens';
import type { DeepInteractionStreamEvent } from '@/lib/deep-interaction/events';
import type { DeepInteractionType, GuidedGenerationPlan, InteractionArtifact } from '@/lib/deep-interaction/types';
import { handleMockFollowUp, type LLMFollowUpResult } from '@/lib/deep-interaction/followUpHandler';
import { interactionTypeMeta } from '@/lib/deep-interaction/rendererRegistry';
import { useArtifactStore } from '@/lib/stores/artifactStore';
import { useDeepInteractionUIStore } from '@/lib/stores/deepInteractionUIStore';
import { useGenerationProgressStore } from '@/lib/stores/generationProgressStore';
import { useInteractionSessionStore } from '@/lib/stores/interactionSessionStore';
import { useResearchLogStore } from '@/lib/stores/researchLogStore';
import { useToast } from '@/lib/stores/toastStore';
import {
  hasPersistedSessionArtifact,
  persistWithSingleRetry,
  repairInteractionPersistence,
} from '@/lib/stores/interactionPersistence';
import ArtifactCard from './ArtifactCard';
import DeepInteractionRightPanel from './DeepInteractionRightPanel';
import DeepInteractionStage from './DeepInteractionStage';
import InteractionTypeCards from './InteractionTypeCards';
import PhysicsCaseCards from './PhysicsCaseCards';
import PlaybackControlBar from './PlaybackControlBar';
import SessionList from './SessionList';

const EMPTY_ARTIFACTS_BY_SESSION: Record<string, InteractionArtifact[]> = {};
const subscribeToHydration = () => () => {};
const getHydratedSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

export default function DeepInteractionShell() {
  const shellSidebarRef = useGsapReveal<HTMLElement>({
    selector: '[data-deep-shell-motion]',
    stagger: stemotionMotion.stagger.item,
    duration: stemotionMotion.duration.page,
    y: 12,
    delay: 0.04,
  });
  const sessions = useInteractionSessionStore((state) => state.sessions);
  const currentSessionId = useInteractionSessionStore((state) => state.currentSessionId);
  const currentSession = useInteractionSessionStore((state) => state.getCurrentSession());
  const selectedType = useDeepInteractionUIStore((state) => state.selectedTypeFilter);
  const setPlaybackStatus = useDeepInteractionUIStore((state) => state.setPlaybackStatus);
  const setPendingPrompt = useDeepInteractionUIStore((state) => state.setPendingPrompt);
  const progressStore = useGenerationProgressStore();
  const logResearchEvent = useResearchLogStore((state) => state.logEvent);
  const artifactsBySession = useArtifactStore((state) => state.artifactsBySession);
  const toast = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFollowingUp, setIsFollowingUp] = useState(false);
  const hasMounted = useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerHydrationSnapshot,
  );

  const generationType: DeepInteractionType = selectedType === 'all' ? 'simulation' : selectedType;
  const visibleSessions = hasMounted ? sessions : [];
  const visibleCurrentSessionId = hasMounted ? currentSessionId : null;
  const visibleCurrentSession = hasMounted ? currentSession : null;
  const visibleArtifactsBySession = hasMounted ? artifactsBySession : EMPTY_ARTIFACTS_BY_SESSION;

  const artifacts = useMemo(
    () => (visibleCurrentSessionId ? visibleArtifactsBySession[visibleCurrentSessionId] ?? [] : []),
    [visibleArtifactsBySession, visibleCurrentSessionId],
  );

  const currentArtifact = useMemo(() => {
    if (!visibleCurrentSession) return null;
    return artifacts.find((artifact) => artifact.id === visibleCurrentSession.currentArtifactId) ?? artifacts.at(-1) ?? null;
  }, [artifacts, visibleCurrentSession]);

  const generate = async (prompt: string, guidedPlan?: GuidedGenerationPlan) => {
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    progressStore.start();
    setPlaybackStatus('idle');
    logResearchEvent({
      type: 'prompt_submitted',
      sessionId: visibleCurrentSession?.id,
      payload: {
        promptLength: prompt.length,
        subjectDomain: currentArtifact?.blueprint?.subjectDomain,
        topic: currentArtifact?.blueprint?.topic,
      },
    });

    try {
      const response = await fetch('/api/v1/deep-interaction/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          preferredType: generationType,
          existingSessionId: visibleCurrentSession?.id,
          currentArtifactId: currentArtifact?.id,
          guidedPlan,
        }),
      });

      if (!response.ok || !response.body) {
        const errorData = await response.json().catch(() => ({ error: '生成请求失败。' }));
        throw new Error(errorData.error ?? '生成请求失败。');
      }

      await readEventStream(response.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : '生成失败，请稍后重试。';
      progressStore.fail(message);
      const activeSession = useInteractionSessionStore.getState().getCurrentSession();
      if (activeSession?.id) {
        useInteractionSessionStore.getState().failSession(activeSession.id, `生成失败：${message}`);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const followUp = async (prompt: string) => {
    if (!visibleCurrentSession || !currentArtifact || !prompt.trim() || isFollowingUp) return;

    setIsFollowingUp(true);
    useDeepInteractionUIStore.getState().setPlaybackStatus('live');
    useInteractionSessionStore.getState().continueWithFollowUpPrompt(visibleCurrentSession.id, prompt);
    logResearchEvent({
      type: 'follow_up_submitted',
      sessionId: visibleCurrentSession.id,
      artifactId: currentArtifact.id,
      payload: {
        promptLength: prompt.length,
        templateId: currentArtifact.templateMetadata?.templateId,
        artifactId: currentArtifact.id,
      },
    });

    const currentHtml = currentArtifact.schema.htmlWidget?.html;

    if (!currentHtml) {
      const result = handleMockFollowUp(currentArtifact, prompt);
      const artifact = {
        ...result.artifact,
        blueprint: currentArtifact.blueprint,
        templateMetadata: currentArtifact.templateMetadata,
        planningMetadata: currentArtifact.planningMetadata,
      };
      useArtifactStore.getState().addArtifact(artifact);
      useInteractionSessionStore.getState().createArtifactVersion(visibleCurrentSession.id, artifact);
      useInteractionSessionStore.getState().appendMessage(visibleCurrentSession.id, {
        role: 'assistant',
        content: result.message,
        relatedArtifactId: artifact.id,
      });
      setIsFollowingUp(false);
      return;
    }

    try {
      const response = await fetch('/api/v1/deep-interaction/follow-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: visibleCurrentSession.id,
          currentHtml,
          prompt,
          title: currentArtifact.title,
          concept: currentArtifact.schema.title,
          blueprint: currentArtifact.blueprint,
          templateMetadata: currentArtifact.templateMetadata,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: '追问修改失败。' }));
        throw new Error(errorData.error ?? '追问修改失败。');
      }

      const data = (await response.json()) as LLMFollowUpResult;
      const now = new Date().toISOString();
      const newArtifact = {
        ...currentArtifact,
        id: `artifact_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        version: currentArtifact.version + 1,
        schema: {
          ...currentArtifact.schema,
          htmlWidget: {
            ...currentArtifact.schema.htmlWidget!,
            html: data.html,
          },
        },
        updatedAt: now,
        createdAt: now,
      };

      useArtifactStore.getState().addArtifact(newArtifact);
      useInteractionSessionStore.getState().createArtifactVersion(visibleCurrentSession.id, newArtifact);
      useInteractionSessionStore.getState().appendMessage(visibleCurrentSession.id, {
        role: 'assistant',
        content: data.message,
        relatedArtifactId: newArtifact.id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '追问修改失败，请稍后重试。';
      useInteractionSessionStore.getState().appendMessage(visibleCurrentSession.id, {
        role: 'assistant',
        content: `追问失败：${message}`,
      });
    } finally {
      setIsFollowingUp(false);
    }
  };

  const readEventStream = async (body: ReadableStream<Uint8Array>) => {
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
          try {
            handleStreamEvent(JSON.parse(line.slice(6)) as DeepInteractionStreamEvent);
          } catch (e) {
            console.warn('[SSE] Failed to parse event:', line, e);
          }
        }
      }
      if (done) break;
    }
  };

  const handleStreamEvent = (event: DeepInteractionStreamEvent) => {
    const sessionStore = useInteractionSessionStore.getState();
    const artifactStore = useArtifactStore.getState();
    const progress = useGenerationProgressStore.getState();

    if (event.type === 'session_created') {
      sessionStore.upsertSession(event.session);
      progress.addLog({ stage: 'planning', message: '已创建深度交互会话。', progress: event.progress });
      return;
    }

    if (event.type === 'progress') {
      const session = sessionStore.getCurrentSession();
      if (session) {
        sessionStore.updateSessionStatus(session.id, event.stage);
        sessionStore.updateSessionProgress(session.id, event.progress);
      }
      progress.addLog({ stage: event.stage, message: event.message, progress: event.progress });
      return;
    }

    if (event.type === 'type_selected') {
      const session = sessionStore.getCurrentSession();
      if (session) {
        sessionStore.updateSessionStatus(session.id, 'selecting_type');
        sessionStore.updateSessionProgress(session.id, event.progress);
      }
      progress.addLog({ stage: 'selecting_type', message: event.message, progress: event.progress });
      return;
    }

    if (event.type === 'outline_generated') {
      progress.setOutline(event.outline);
      progress.addLog({ stage: 'generating_outline', message: '交互大纲已生成。', progress: event.progress });
      return;
    }

    if (event.type === 'blueprint_generated') {
      progress.setBlueprint(event.blueprint);
      logResearchEvent({
        type: 'blueprint_generated',
        payload: {
          subjectDomain: event.blueprint.subjectDomain,
          topic: event.blueprint.topic,
        },
      });
      progress.addLog({ stage: 'blueprint', message: `教学蓝图已生成：${event.blueprint.topic}。`, progress: event.progress });
      return;
    }

    if (event.type === 'subject_validated') {
      progress.setSchemaValidation({
        passed: event.passed,
        schemaKey: event.schemaKey,
        violations: event.violations,
        warnings: event.warnings,
      });
      const status = event.passed ? '通过' : '发现待修正项';
      const schema = event.schemaKey ? `（${event.schemaKey}）` : '';
      progress.addLog({ stage: 'subject_validation', message: `学科约束校验${status}${schema}。`, progress: event.progress });
      return;
    }

    if (event.type === 'template_matched') {
      logResearchEvent({
        type: 'template_matched',
        payload: {
          templateId: event.templateId,
          matchScore: event.score,
        },
      });
      progress.addLog({ stage: 'template', message: `Verified template matched: ${event.title} (${event.score.toFixed(2)})`, progress: event.progress });
      return;
    }

    if (event.type === 'template_customized') {
      logResearchEvent({
        type: 'template_customized',
        payload: {
          templateId: event.templateId,
          appliedSlotCount: event.appliedSlotCount,
          warningCount: event.warnings.length,
        },
      });
      progress.addLog({ stage: 'template', message: `Template customization completed: ${event.appliedSlotCount} slots`, progress: event.progress });
      return;
    }

    if (event.type === 'schema_generated') {
      progress.setSchemaPreview(event.schemaPreview);
      progress.addLog({ stage: 'generating_schema', message: 'Widget 合约预览已生成。', progress: event.progress });
      return;
    }

    if (event.type === 'validation_started') {
      progress.addLog({ stage: 'validating', message: event.message, progress: event.progress });
      return;
    }

    if (event.type === 'artifact_ready') {
      const artifact = {
        ...event.artifact,
        blueprint: event.artifact.blueprint ?? progress.blueprint ?? undefined,
      };

      const result = persistWithSingleRetry({
        commit: () => {
          artifactStore.addArtifact(artifact);
          sessionStore.addArtifact(artifact.sessionId, artifact);
        },
        verify: () => hasPersistedSessionArtifact(artifact.sessionId, artifact.id),
        repairAndRetry: () => {
          const repaired = repairInteractionPersistence({
            sessions: useInteractionSessionStore.getState().sessions,
            currentSessionId: useInteractionSessionStore.getState().currentSessionId,
            artifactsBySession: useArtifactStore.getState().artifactsBySession,
          });
          useArtifactStore.setState({ artifactsBySession: repaired.artifactsBySession });
          useInteractionSessionStore.setState({
            sessions: repaired.sessions,
            currentSessionId: repaired.currentSessionId,
          });
          artifactStore.addArtifact(artifact);
          sessionStore.addArtifact(artifact.sessionId, artifact);
        },
      });

      if (result === 'failed') {
        toast.error('本地存储空间不足：新交互可能仅内存可见，刷新后可能丢失。', 4500);
      } else if (result === 'saved_after_retry') {
        toast.warning('本地存储空间不足，已自动清理部分旧会话并完成保存。', 3500);
      }

      logResearchEvent({
        type: 'artifact_generated',
        sessionId: artifact.sessionId,
        artifactId: artifact.id,
        payload: {
          artifactId: artifact.id,
          templateId: artifact.templateMetadata?.templateId,
          qualityLevel: artifact.qualityReport?.level,
          subjectDomain: artifact.blueprint?.subjectDomain,
          topic: artifact.blueprint?.topic,
        },
      });
      logResearchEvent({
        type: 'artifact_saved',
        sessionId: artifact.sessionId,
        artifactId: artifact.id,
        payload: {
          artifactId: artifact.id,
          templateId: artifact.templateMetadata?.templateId,
        },
      });
      sessionStore.appendMessage(artifact.sessionId, {
        role: 'assistant',
        content: `交互内容已生成并保存到交互库：${artifact.title}。`,
        relatedArtifactId: artifact.id,
      });
      progress.addLog({ stage: 'ready', message: '交互内容已生成，可以开始探索。', progress: 100 });
      progress.complete();
      return;
    }

    if (event.type === 'error') {
      progress.fail(event.message);
      const session = sessionStore.getCurrentSession();
      if (session) sessionStore.failSession(session.id, event.message);
      return;
    }

    // Feedback loop events
    if (event.type === 'feedback_started') {
      progress.addLog({ stage: 'feedback', message: event.message, progress: event.progress });
      return;
    }

    if (event.type === 'feedback_iteration_started') {
      progress.setCurrentIteration(event.iteration);
      progress.addLog({ stage: 'feedback', message: event.message, progress: event.progress });
      return;
    }

    if (event.type === 'evaluator_started') {
      progress.addLog({ stage: 'evaluation', message: event.message, progress: event.progress });
      return;
    }

    if (event.type === 'evaluator_completed') {
      const e = event.evaluation;
      const status = e.passed ? '通过' : '未通过';
      progress.addLog({ stage: 'evaluation', message: `${e.agentName}：${e.score}/100 ${status}（${e.issues.length} 个问题）`, progress: event.progress });
      return;
    }

    if (event.type === 'judge_decision') {
      const d = event.decision;
      const label = d.type === 'accept' ? '通过' : d.type === 'repair' ? '需要修复' : d.type === 'reject' ? '拒绝' : '重生成';
      progress.addLog({ stage: 'feedback', message: `Judge 决策：${label}（${d.finalScore}/100）- ${d.reason}`, progress: event.progress });
      return;
    }

    if (event.type === 'repair_started') {
      progress.addLog({ stage: 'repair', message: event.message, progress: event.progress });
      return;
    }

    if (event.type === 'repair_completed') {
      const changes = event.changeLog.join('；');
      progress.addLog({ stage: 'repair', message: `修复完成：${changes || '无变更'}`, progress: event.progress });
      return;
    }

    if (event.type === 'feedback_completed') {
      progress.setQualityReport(event.qualityReport);
      if (progress.feedbackIterations.length === 0) {
        for (const iteration of event.result.iterations) {
          useGenerationProgressStore.getState().addFeedbackIteration(iteration);
        }
      }
      const level = event.qualityReport.level;
      const label = level === 'excellent' ? '优秀' : level === 'good' ? '良好' : level === 'usable' ? '可用' : level === 'needs_improvement' ? '需改进' : '不达标';
      progress.addLog({ stage: 'feedback', message: `质量评审完成：${label}（${event.qualityReport.finalScore}/100）`, progress: event.progress });
      return;
    }
  };

  const selectedMeta = interactionTypeMeta[generationType];

  return (
    <div className="flex h-full min-h-0 bg-slate-50 text-slate-900">
      <aside ref={shellSidebarRef} className="hidden w-72 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
        <div data-deep-shell-motion className="border-b border-slate-100 p-5">
          <h1 className="text-lg font-black">深度交互模式</h1>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            先选择交互方式，再输入学习主题。系统会生成可运行、可播放、可继续修改的互动学习页。
          </p>
          <Link
            href="/interactions"
            className="mt-4 inline-flex rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700"
          >
            打开交互库
          </Link>
        </div>
        <div className="custom-scrollbar flex-1 space-y-5 overflow-y-auto p-4">
          <div data-deep-shell-motion>
            <InteractionTypeCards compact />
          </div>
          <div data-deep-shell-motion>
            <SessionList sessions={visibleSessions} currentSessionId={visibleCurrentSessionId} />
          </div>
          <div data-deep-shell-motion>
            <div className="mb-2 text-xs font-black uppercase tracking-wider text-slate-400">当前会话交互</div>
            <div className="space-y-2">
              {artifacts.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-400">
                  当前会话还没有生成交互。
                </p>
              ) : (
                artifacts
                  .slice()
                  .reverse()
                  .map((artifact) => <ArtifactCard key={artifact.id} artifact={artifact} />)
              )}
            </div>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className={`border-b px-4 py-2 text-xs font-bold ${selectedMeta.accent}`}>
          当前生成方式：{selectedMeta.label}
        </div>
        <div className="custom-scrollbar flex-1 overflow-y-auto">
          {!visibleCurrentSession && (
            <div className="p-4">
              <PhysicsCaseCards onSelect={(p) => setPendingPrompt(p)} />
            </div>
          )}
          <DeepInteractionStage artifact={currentArtifact} isGenerating={isGenerating} />
        </div>
        <PlaybackControlBar artifact={currentArtifact} />
      </main>

      <aside className="hidden w-96 shrink-0 border-l border-slate-200 bg-white xl:block">
        <DeepInteractionRightPanel
          selectedType={generationType}
          currentArtifact={currentArtifact}
          currentSession={visibleCurrentSession}
          isGenerating={isGenerating}
          isFollowingUp={isFollowingUp}
          onGenerate={generate}
          onFollowUp={followUp}
        />
      </aside>

      <div className="fixed inset-x-3 bottom-24 z-40 xl:hidden">
        <DeepInteractionRightPanel
          selectedType={generationType}
          currentArtifact={currentArtifact}
          currentSession={visibleCurrentSession}
          isGenerating={isGenerating}
          isFollowingUp={isFollowingUp}
          mobile
          onGenerate={generate}
          onFollowUp={followUp}
        />
      </div>
    </div>
  );
}
