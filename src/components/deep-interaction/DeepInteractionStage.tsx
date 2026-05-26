'use client';

import { Sparkles } from 'lucide-react';
import type { InteractionArtifact } from '@/lib/deep-interaction/types';
import ArtifactRenderer from './ArtifactRenderer';
import InteractionTypeCards from './InteractionTypeCards';

export default function DeepInteractionStage({
  artifact,
  isGenerating,
}: {
  artifact: InteractionArtifact | null;
  isGenerating: boolean;
}) {
  if (!artifact) {
    return (
      <div className="custom-scrollbar flex-1 overflow-y-auto p-5 lg:p-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-7 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Sparkles size={24} />
            </div>
            <h1 className="text-3xl font-black tracking-tight">深度交互模式</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">
              不是被动听讲，而是动手探索。选择一种交互方式，让知识变成可以观察、操作和修改的学习体验。
            </p>
          </div>
          <InteractionTypeCards />
          {isGenerating && <StageSkeleton />}
        </div>
      </div>
    );
  }

  return (
    <div className="custom-scrollbar flex-1 overflow-y-auto p-4 lg:p-6">
      <div className="mx-auto flex h-full min-h-[720px] max-w-6xl flex-col">
        <div className="mb-4 flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-blue-600">Interactive Artifact</div>
            <h1 className="mt-1 text-2xl font-black tracking-tight">{artifact.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">{artifact.description}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-500">
            Version {artifact.version}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <ArtifactRenderer artifact={artifact} />
        </div>
      </div>
    </div>
  );
}

function StageSkeleton() {
  return (
    <div className="mt-5 rounded-lg border border-slate-200 bg-white p-6">
      <div className="mb-4 h-4 w-52 animate-pulse rounded bg-slate-100" />
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-32 animate-pulse rounded-lg bg-slate-100" />
        ))}
      </div>
    </div>
  );
}
