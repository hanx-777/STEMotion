'use client';

import { ShieldCheck } from 'lucide-react';
import type { InteractionArtifact } from '@/lib/deep-interaction/types';

export default function TemplateMatchPanel({
  templateMetadata,
}: {
  templateMetadata?: InteractionArtifact['templateMetadata'];
}) {
  if (!templateMetadata || templateMetadata.generationMode === 'free_generation') {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 text-xs font-black uppercase tracking-wider text-slate-400">Template</div>
        <p className="text-xs text-slate-500">未使用可信模板，当前 artifact 来自蓝图驱动自由生成。</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-700">
        <ShieldCheck size={14} />
        Verified Template
      </div>
      <h3 className="text-sm font-black text-emerald-950">{templateMetadata.templateTitle ?? templateMetadata.templateId}</h3>
      <p className="mt-2 text-xs leading-relaxed text-emerald-800">
        该实验基于可信原创模板改编，系统已尽量保留核心学科约束与交互结构。
      </p>
      <div className="mt-3 space-y-1 text-xs text-emerald-900">
        <div>模式：{modeLabel(templateMetadata.generationMode)}</div>
        {typeof templateMetadata.matchScore === 'number' && (
          <div>匹配分：{templateMetadata.matchScore.toFixed(2)}</div>
        )}
        {templateMetadata.reason && <div>原因：{templateMetadata.reason}</div>}
      </div>
      {(templateMetadata.appliedSlots?.length ?? 0) > 0 && (
        <div className="mt-3">
          <div className="text-xs font-bold text-emerald-900">改编 slots</div>
          <ul className="mt-1 space-y-1 text-xs text-emerald-800">
            {templateMetadata.appliedSlots?.map((slot) => (
              <li key={slot.key}>{slot.key}: {slot.reason}</li>
            ))}
          </ul>
        </div>
      )}
      {(templateMetadata.warnings?.length ?? 0) > 0 && (
        <div className="mt-3 rounded-md bg-white/70 p-2 text-xs text-amber-700">
          {templateMetadata.warnings?.join(' ')}
        </div>
      )}
    </section>
  );
}

function modeLabel(mode: NonNullable<InteractionArtifact['templateMetadata']>['generationMode']): string {
  if (mode === 'template_customized') return '模板可控改编';
  if (mode === 'template_fallback_original') return '改编失败，使用原模板';
  return '自由生成';
}

