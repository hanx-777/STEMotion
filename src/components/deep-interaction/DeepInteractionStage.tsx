'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { Sparkles } from 'lucide-react';
import type { InteractionArtifact } from '@/features/deep-interaction/lib/types';
import ArtifactRenderer from './ArtifactRenderer';
import InteractionTypeCards from './InteractionTypeCards';
import { useGsapReveal } from '@/lib/animation/useGsapReveal';
import { prefersReducedMotion, stemotionMotion } from '@/lib/animation/motionTokens';
import { labGenerationTypeOrder } from '@/features/deep-interaction/lib/rendererRegistry';

export default function DeepInteractionStage({
  artifact,
  isGenerating,
}: {
  artifact: InteractionArtifact | null;
  isGenerating: boolean;
}) {
  const emptyStageRef = useGsapReveal<HTMLDivElement>({
    selector: '[data-stage-motion]',
    stagger: stemotionMotion.stagger.item,
    duration: stemotionMotion.duration.page,
    y: 16,
  });
  const artifactStageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = artifactStageRef.current;
    if (!stage || !artifact || prefersReducedMotion()) return;

    const targets = Array.from(stage.querySelectorAll('[data-artifact-motion]'));
    const tween = gsap.fromTo(
      targets,
      { autoAlpha: 0, y: 12, scale: 0.995 },
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

    return () => {
      tween.kill();
    };
  }, [artifact]);

  if (!artifact) {
    return (
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4 lg:p-5">
        <div ref={emptyStageRef} className="mx-auto max-w-5xl">
          <div data-stage-motion className="mb-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Sparkles size={24} />
            </div>
            <h1 className="text-2xl font-black tracking-tight">深度交互模式</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              不是被动听讲，而是动手探索。选择一种交互方式，让知识变成可以观察、操作和修改的学习体验。
            </p>
          </div>
          <div data-stage-motion>
            <InteractionTypeCards types={labGenerationTypeOrder} />
          </div>
          {isGenerating && (
            <div data-stage-motion>
              <StageSkeleton />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div data-deep-artifact-stage className="flex min-h-0 flex-1 overflow-hidden p-2.5 sm:p-3 lg:p-4">
      <div ref={artifactStageRef} className="mx-auto flex h-full min-h-0 w-full max-w-none flex-col">
        <div data-artifact-motion className="mb-2 flex flex-col justify-between gap-2 lg:flex-row lg:items-center">
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-wider text-blue-600">Interactive Artifact</div>
            <h1 className="mt-0.5 truncate text-lg font-black tracking-tight sm:text-xl">{artifact.title}</h1>
            <p className="mt-1 line-clamp-1 max-w-4xl text-xs leading-relaxed text-slate-600 sm:line-clamp-2">{artifact.description}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-500">
            Version {artifact.version}
          </div>
        </div>
        <div data-artifact-motion data-deep-artifact-viewport className="min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
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
