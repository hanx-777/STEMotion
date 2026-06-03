'use client';

import { FastForward, Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import { useExperimentStore } from '@/lib/stores/experimentStore';
import { usePlaybackStore } from '@/lib/stores/playbackStore';
import { playbackEngine } from '@/lib/playback/playbackEngine';

export default function PlaybackControls() {
  const { status, currentStepIndex, speed, setSpeed } = usePlaybackStore();
  const config = useExperimentStore((state) => state.config);

  if (!config) return null;

  const stepsCount = config.explanationSteps.length;
  const progress = ((currentStepIndex + (status === 'completed' ? 1 : 0)) / Math.max(1, stepsCount)) * 100;
  const activeStep = config.explanationSteps[Math.min(currentStepIndex, stepsCount - 1)];

  return (
    <div className="relative flex min-h-20 items-center justify-between gap-4 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(15,23,42,0.04)] lg:px-8">
      <div className="absolute left-0 top-0 h-1.5 w-full bg-slate-100">
        <div className="h-full bg-blue-600 transition-all duration-500" style={{ width: `${Math.min(progress, 100)}%` }} />
      </div>

      <div className="min-w-0 text-slate-900">
        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Experiment timeline</div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">{Math.min(currentStepIndex + 1, stepsCount)} / {stepsCount}</span>
          <span className="hidden truncate text-sm text-slate-500 sm:block">{activeStep?.title}</span>
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <button
          onClick={() => playbackEngine.reset()}
          title="Reset experiment"
          className="rounded-lg p-3 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <RotateCcw size={21} />
        </button>
        <button
          onClick={() => playbackEngine.previousStep()}
          title="Previous step"
          className="rounded-lg p-3 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <SkipBack size={21} />
        </button>
        <button
          onClick={() => (status === 'playing' ? playbackEngine.pause() : playbackEngine.play())}
          title={status === 'playing' ? 'Pause' : 'Play'}
          className={`flex h-12 w-12 items-center justify-center rounded-lg shadow-sm transition-colors ${
            status === 'playing' ? 'bg-slate-900 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {status === 'playing' ? <Pause size={25} fill="currentColor" /> : <Play size={25} className="ml-0.5" fill="currentColor" />}
        </button>
        <button
          onClick={() => playbackEngine.nextStep()}
          title="Next step"
          className="rounded-lg p-3 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <SkipForward size={21} />
        </button>
        <button
          onClick={() => playbackEngine.enterLiveMode()}
          title="Live simulation"
          className="rounded-lg p-3 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <FastForward size={21} />
        </button>
      </div>

      <div className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1 lg:flex">
        {[0.75, 1, 1.5, 2].map((value) => (
          <button
            key={value}
            onClick={() => setSpeed(value)}
            className={`rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors ${
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
