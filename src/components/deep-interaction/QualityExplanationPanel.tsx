'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { InteractionArtifact, LearningBlueprint, QualityReport } from '@/lib/deep-interaction/types';

interface QualityExplanationPanelProps {
  qualityReport?: QualityReport | null;
  blueprint?: LearningBlueprint | null;
  templateMetadata?: InteractionArtifact['templateMetadata'];
}

export default function QualityExplanationPanel({
  qualityReport,
  blueprint,
  templateMetadata,
}: QualityExplanationPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const explanation = qualityReport?.qualityExplanation;

  if (!qualityReport && !blueprint && !templateMetadata) return null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-xs hover:bg-slate-50"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="font-black uppercase tracking-wider text-slate-500">Quality Explanation</span>
      </button>
      {expanded && (
        <div className="space-y-4 border-t border-slate-100 p-4 text-xs">
          <Block title="Expected Insight Check">
            <StatusPill status={explanation?.expectedInsightCheck?.status ?? 'unknown'} />
            <p className="mt-2 text-slate-600">{blueprint?.expectedInsight ?? '暂无 expected insight。'}</p>
            <Evidence items={explanation?.expectedInsightCheck?.evidence} />
          </Block>

          <Block title="Variable Coverage">
            {explanation?.variableChecks?.length ? (
              <div className="space-y-2">
                {explanation.variableChecks.map((item) => (
                  <div key={item.symbol} className="rounded-md bg-slate-50 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-700">{item.symbol} · {item.role}</span>
                      <StatusPill status={item.status} />
                    </div>
                    <Evidence items={item.evidence} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500">未检测到逐变量证据。</p>
            )}
          </Block>

          <Block title="Knowledge Constraints">
            {explanation?.constraintChecks?.length ? (
              <div className="space-y-2">
                {explanation.constraintChecks.map((item) => (
                  <div key={item.id} className="rounded-md bg-slate-50 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-700">{item.description}</span>
                      <StatusPill status={item.status} />
                    </div>
                    <p className="mt-1 text-slate-500">{item.severity}</p>
                    <Evidence items={item.evidence} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500">暂无可靠知识约束证据。</p>
            )}
          </Block>

          {templateMetadata && (
            <Block title="Template Preservation">
              <p className="text-slate-600">{templateMetadata.generationMode}</p>
              <Evidence items={explanation?.templatePreservationNotes} />
            </Block>
          )}

          {(qualityReport?.repairTrace?.length ?? 0) > 0 && (
            <Block title="Repair Trace">
              <div className="space-y-2">
                {qualityReport?.repairTrace?.map((item, index) => (
                  <div key={`${item.iteration}-${index}`} className="rounded-md bg-slate-50 p-2">
                    <div className="font-bold text-slate-700">#{item.iteration} · {item.trigger}</div>
                    <p className="mt-1 text-slate-600">{item.issue}</p>
                    <p className="mt-1 text-blue-700">{item.actionTaken}</p>
                  </div>
                ))}
              </div>
            </Block>
          )}
        </div>
      )}
    </section>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-400">{title}</div>
      {children}
    </div>
  );
}

function Evidence({ items }: { items?: string[] }) {
  const evidence = items?.length ? items : ['暂无可靠证据。'];
  return (
    <ul className="mt-2 space-y-1 text-slate-500">
      {evidence.map((item, index) => <li key={index}>- {item}</li>)}
    </ul>
  );
}

function StatusPill({ status }: { status: string }) {
  const className =
    status === 'satisfied' || status === 'covered'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'partially_satisfied' || status === 'partially_covered'
        ? 'bg-amber-100 text-amber-700'
        : status === 'violated' || status === 'missing' || status === 'not_satisfied'
          ? 'bg-red-100 text-red-700'
          : 'bg-slate-100 text-slate-500';
  const label =
    status === 'unknown' ? '未检测' :
    status === 'partially_satisfied' || status === 'partially_covered' ? '部分满足' :
    status === 'satisfied' || status === 'covered' ? '已满足' :
    status === 'violated' ? '违反' :
    status === 'missing' ? '缺失' :
    status === 'not_satisfied' ? '未满足' : status;
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${className}`}>{label}</span>;
}
