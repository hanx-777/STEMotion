'use client';

import type React from 'react';
import { Box, FlaskConical, Gamepad2, LineChart, Network } from 'lucide-react';
import { interactionTypeMeta, interactionTypeOrder } from '@/lib/deep-interaction/rendererRegistry';
import type { DeepInteractionType } from '@/lib/deep-interaction/types';
import { useDeepInteractionUIStore } from '@/lib/stores/deepInteractionUIStore';
import { useGsapReveal } from '@/lib/animation/useGsapReveal';

const icons: Record<DeepInteractionType, React.ElementType> = {
  '3d_visualization': Box,
  simulation: FlaskConical,
  game: Gamepad2,
  mind_map: Network,
  rag_visualization: LineChart,
};

export default function InteractionTypeCards({ compact = false }: { compact?: boolean }) {
  const selected = useDeepInteractionUIStore((state) => state.selectedTypeFilter);
  const setTypeFilter = useDeepInteractionUIStore((state) => state.setTypeFilter);
  const cardsRef = useGsapReveal<HTMLDivElement>({ stagger: 0.12, y: 24 });

  return (
    <div>
      <div className="mb-2 text-xs font-black uppercase tracking-wider text-slate-400">交互方式</div>
      <div ref={cardsRef} className={compact ? 'space-y-2' : 'grid gap-3 md:grid-cols-2 xl:grid-cols-4'}>
        {interactionTypeOrder.map((type) => {
          const meta = interactionTypeMeta[type];
          const Icon = icons[type];
          const active = selected === type;
          return (
            <button
              key={type}
              type="button"
              aria-pressed={active}
              onClick={() => setTypeFilter(type)}
              className={`min-h-24 w-full rounded-lg border p-4 text-left transition-all focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                active ? meta.accent : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className="mb-3 flex items-center gap-2">
                <Icon size={20} />
                <span className="text-sm font-black">{meta.label}</span>
              </div>
              <p className="text-xs leading-relaxed text-slate-600">{meta.description}</p>
              {active && <div className="mt-3 text-[11px] font-black">将按此方式生成</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
