'use client';

import { FunctionSquare } from 'lucide-react';
import { useAssistantStore } from '@/lib/stores/assistantStore';
import { usePlaybackStore } from '@/lib/stores/playbackStore';

export default function FormulaPanel() {
  const formulas = useAssistantStore((state) => state.activeFormulas);
  const highlightedFormulaId = usePlaybackStore((state) => state.highlightedFormulaId);

  if (formulas.length === 0) return null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
        <FunctionSquare size={15} />
        <span>Reference formulas</span>
      </div>
      <div className="space-y-2">
        {formulas.map((formula) => (
          <div
            key={formula.id}
            className={`rounded-md border p-3 transition-colors ${
              highlightedFormulaId === formula.id
                ? 'border-blue-300 bg-blue-50 text-blue-950'
                : 'border-slate-200 bg-slate-50 text-slate-800'
            }`}
          >
            {formula.title && (
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {formula.title}
              </div>
            )}
            <div className="font-mono text-sm">{formula.latex}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
