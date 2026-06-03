'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { CheckCircle2, Circle, AlertCircle, Loader2, SkipForward } from 'lucide-react';
import type { ProgressModel, ProgressStatus } from '@/lib/progress/progressTypes';
import { calculateProgress } from '@/lib/progress/progressCalculator';
import { useGsapReveal } from '@/lib/animation/useGsapReveal';
import { prefersReducedMotion, stemotionMotion } from '@/lib/animation/motionTokens';

const statusIcon: Record<ProgressStatus, React.ReactNode> = {
  idle: <Circle size={16} className="text-slate-300" />,
  pending: <Circle size={16} className="text-slate-400" />,
  running: <Loader2 size={16} className="animate-spin text-teal-600" />,
  completed: <CheckCircle2 size={16} className="text-emerald-600" />,
  skipped: <SkipForward size={16} className="text-slate-400" />,
  warning: <AlertCircle size={16} className="text-amber-500" />,
  error: <AlertCircle size={16} className="text-red-500" />,
};

export default function RealisticProgressPanel({ model }: { model: ProgressModel }) {
  const stagesRef = useGsapReveal<HTMLDivElement>({ stagger: 0.05, y: 12 });
  const progressBarRef = useRef<HTMLDivElement>(null);
  const percent = calculateProgress(model);
  const currentStage = model.stages.find((s) => s.id === model.currentStageId);
  const isDone = model.stages.every((s) => s.status === 'completed' || s.status === 'skipped');
  const hasError = model.stages.some((s) => s.status === 'error');

  useEffect(() => {
    const bar = progressBarRef.current;
    if (!bar) return;

    gsap.to(bar, {
      width: `${percent}%`,
      duration: prefersReducedMotion() ? 0 : stemotionMotion.duration.item,
      ease: stemotionMotion.ease.standard,
      overwrite: 'auto',
    });
  }, [percent]);

  useEffect(() => {
    const container = stagesRef.current;
    if (!container || !model.currentStageId || prefersReducedMotion()) return;

    const row = container.querySelector(`[data-progress-stage="${model.currentStageId}"]`);
    if (!row) return;

    gsap.fromTo(
      row,
      { autoAlpha: 0.72, y: 4 },
      {
        autoAlpha: 1,
        y: 0,
        duration: stemotionMotion.duration.quick,
        ease: stemotionMotion.ease.standard,
        overwrite: 'auto',
      },
    );
  }, [model.currentStageId, stagesRef]);

  return (
    <div className="rounded-lg border border-[var(--stemotion-border)] bg-[var(--stemotion-surface)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-[var(--stemotion-ink)]">
          {hasError ? '生成失败' : isDone ? '生成完成' : model.message || '正在处理...'}
        </span>
        <span className="text-xs font-medium text-[var(--stemotion-muted)]">{percent}%</span>
      </div>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          ref={progressBarRef}
          className={`h-full rounded-full ${hasError ? 'bg-red-400' : 'bg-teal-500'}`}
          style={{ width: '0%' }}
        />
      </div>
      {currentStage && !isDone && !hasError && (
        <p className="mb-3 text-xs text-[var(--stemotion-muted)]">{currentStage.description}</p>
      )}
      <div ref={stagesRef} className="space-y-2">
        {model.stages.map((stage) => (
          <div key={stage.id} data-progress-stage={stage.id} className="flex items-start gap-2">
            {statusIcon[stage.status]}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-medium ${
                    stage.status === 'running'
                      ? 'text-teal-700'
                      : stage.status === 'completed'
                        ? 'text-emerald-700'
                        : 'text-slate-500'
                  }`}
                >
                  {stage.title}
                </span>
                {stage.status === 'skipped' && (
                  <span className="text-[10px] text-slate-400">跳过</span>
                )}
                {stage.startedAt && stage.completedAt && (
                  <span className="text-[10px] text-slate-400">
                    {((stage.completedAt - stage.startedAt) / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
              {(stage.status === 'running' || stage.detail) && (
                <p className="mt-0.5 text-[11px] text-[var(--stemotion-muted)]">
                  {stage.detail ?? stage.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
      {model.summary && isDone && (
        <div className="mt-4 rounded-md bg-slate-50 p-3 text-xs text-[var(--stemotion-muted)]">
          {Object.entries(model.summary).map(([key, value]) => (
            <div key={key} className="flex justify-between">
              <span>{key}</span>
              <span className="font-medium text-[var(--stemotion-ink)]">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
