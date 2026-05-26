'use client';

import type { InteractionArtifact } from '@/lib/deep-interaction/types';
import { interactionTypeMeta } from '@/lib/deep-interaction/rendererRegistry';
import { useInteractionSessionStore } from '@/lib/stores/interactionSessionStore';

export default function ArtifactCard({ artifact }: { artifact: InteractionArtifact }) {
  const setCurrentArtifact = useInteractionSessionStore((state) => state.setCurrentArtifact);
  const currentSession = useInteractionSessionStore((state) => state.getCurrentSession());
  const active = currentSession?.currentArtifactId === artifact.id;

  return (
    <button
      type="button"
      onClick={() => setCurrentArtifact(artifact.sessionId, artifact.id)}
      className={`w-full rounded-lg border p-3 text-left transition-colors ${
        active ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="line-clamp-1 text-sm font-bold">{artifact.title}</span>
        <div className="flex shrink-0 items-center gap-1">
          {artifact.finalScore != null && (
            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-black ${
              artifact.finalScore >= 85 ? 'bg-emerald-100 text-emerald-700' :
              artifact.finalScore >= 70 ? 'bg-amber-100 text-amber-700' :
              'bg-red-100 text-red-700'
            }`}>
              {artifact.finalScore}
            </span>
          )}
          <span className="rounded-md bg-white px-2 py-1 text-[10px] font-black text-slate-500">
            v{artifact.version}
          </span>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[11px] font-medium text-slate-500">{interactionTypeMeta[artifact.type].label}</span>
        {artifact.blueprint && (
          <span className="text-[10px] text-blue-500">{artifact.blueprint.subjectDomain} / {artifact.blueprint.topic}</span>
        )}
        {artifact.templateMetadata && artifact.templateMetadata.generationMode !== 'free_generation' && (
          <span className="rounded-sm bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
            Verified Template
          </span>
        )}
        {artifact.generationIterations != null && artifact.generationIterations > 1 && (
          <span className="text-[10px] text-slate-400">{artifact.generationIterations} 轮评审</span>
        )}
      </div>
    </button>
  );
}
