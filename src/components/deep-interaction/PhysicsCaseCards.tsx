'use client';

import { TrendingUp, Circle, Zap, ArrowLeftRight, Activity } from 'lucide-react';
import { PHYSICS_CASES } from '@/lib/deep-interaction/physicsMechanicsCases';
import { useGsapReveal } from '@/lib/animation/useGsapReveal';

const iconMap: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  TrendingUp,
  Circle,
  Zap,
  ArrowLeftRight,
  Activity,
};

export default function PhysicsCaseCards({ onSelect }: { onSelect: (prompt: string) => void }) {
  const casesRef = useGsapReveal<HTMLDivElement>({ stagger: 0.06, y: 16, delay: 0.15 });

  return (
    <section className="mb-6">
      <h3 className="mb-3 text-sm font-semibold text-slate-500">大学物理力学交互实验</h3>
      <div ref={casesRef} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {PHYSICS_CASES.map((c) => {
          const Icon = iconMap[c.icon] ?? TrendingUp;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.prompt)}
              className="group flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left transition-all hover:border-teal-200 hover:shadow-sm"
            >
              <Icon size={20} className="mt-0.5 shrink-0 text-teal-600" />
              <div>
                <div className="text-sm font-semibold text-slate-800">{c.title}</div>
                <div className="mt-0.5 text-xs leading-4 text-slate-500">{c.description}</div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
