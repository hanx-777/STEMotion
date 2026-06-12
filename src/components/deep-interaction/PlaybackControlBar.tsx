'use client';

import type React from 'react';
import { Pause, Play, RotateCcw, SkipBack, SkipForward, Zap } from 'lucide-react';
import type { InteractionArtifact } from '@/features/deep-interaction/lib/types';
import { interactionPlaybackEngine } from '@/features/deep-interaction/lib/playback/playbackEngine';
import { useDeepInteractionUIStore } from '@/lib/stores/deepInteractionUIStore';

export default function PlaybackControlBar({ artifact }: { artifact: InteractionArtifact | null }) {
  const status = useDeepInteractionUIStore((state) => state.playbackStatus);
  const stepIndex = useDeepInteractionUIStore((state) => state.currentStepIndex);
  const speed = useDeepInteractionUIStore((state) => state.playbackSpeed);
  const setSpeed = useDeepInteractionUIStore((state) => state.setPlaybackSpeed);

  if (!artifact) return null;

  const steps = artifact.schema.explanationSteps ?? [];
  const activeStep = steps.length > 0 ? steps[Math.min(stepIndex, steps.length - 1)] : undefined;
  const progress = Math.min(((stepIndex + (status === 'completed' ? 1 : 0)) / Math.max(1, steps.length)) * 100, 100);

  return (
    <div className="relative flex min-h-20 items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(15,23,42,0.04)] lg:px-6">
      <div className="absolute left-0 top-0 h-1.5 w-full bg-slate-100" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label="播放进度">
        <div className="h-full bg-blue-600 transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>

      <div className="min-w-0">
        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">交互播放</div>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-sm font-black">{Math.min(stepIndex + 1, steps.length)} / {steps.length}</span>
          <span className="hidden truncate text-sm text-slate-500 sm:block">{activeStep?.title}</span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <IconButton label="重置" onClick={() => interactionPlaybackEngine.reset()}>
          <RotateCcw size={20} />
        </IconButton>
        <IconButton label="上一步" onClick={() => interactionPlaybackEngine.previousStep()}>
          <SkipBack size={20} />
        </IconButton>
        <button
          type="button"
          onClick={() => (status === 'playing' ? interactionPlaybackEngine.pause() : interactionPlaybackEngine.play(artifact))}
          aria-label={status === 'playing' ? '暂停' : '播放'}
          className={`flex h-12 w-12 items-center justify-center rounded-lg text-white shadow-sm transition ${
            status === 'playing' ? 'bg-slate-900' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {status === 'playing' ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-0.5" />}
        </button>
        <IconButton label="下一步" onClick={() => interactionPlaybackEngine.nextStep(artifact)}>
          <SkipForward size={20} />
        </IconButton>
        <IconButton label="实时探索" onClick={() => interactionPlaybackEngine.enterLiveMode()}>
          <Zap size={20} />
        </IconButton>
      </div>

      <div className="hidden items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 lg:flex">
        {[0.75, 1, 1.5, 2].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setSpeed(value)}
            className={`min-h-9 rounded-md px-2.5 text-xs font-black transition ${
              speed === value ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {value}x
          </button>
        ))}
      </div>
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
    >
      {children}
    </button>
  );
}
