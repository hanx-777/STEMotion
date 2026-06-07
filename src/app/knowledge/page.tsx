import { ArrowRight, Database, FileText, Gauge, Layers3, ShieldCheck, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import { getKnowledgeHealth, type KnowledgeSubjectHealth, type KnowledgeValidationStatus } from '@/features/knowledge/knowledgeHealth';
import { StemotionMetricCard, StemotionPageShell, StemotionPanel } from '@/components/ui/stemotion';

const statusLabel: Record<KnowledgeValidationStatus, string> = {
  healthy: '健康',
  partial: '部分就绪',
  missing: '缺失',
};

const statusClass: Record<KnowledgeValidationStatus, string> = {
  healthy: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  partial: 'border-amber-200 bg-amber-50 text-amber-700',
  missing: 'border-rose-200 bg-rose-50 text-rose-700',
};

export default async function KnowledgePage() {
  const report = await getKnowledgeHealth();
  const summaryCards = [
    {
      label: '目标学科',
      value: report.summary.totalSubjects,
      detail: `${report.summary.healthySubjects} 健康 / ${report.summary.partialSubjects} 部分`,
      icon: Database,
    },
    {
      label: '来源文件',
      value: report.summary.totalSourceFiles,
      detail: 'skills knowledge_base/sources',
      icon: FileText,
    },
    {
      label: '静态片段',
      value: report.summary.totalProcessedChunks,
      detail: 'processed manifest chunks',
      icon: Layers3,
    },
    {
      label: '运行时片段',
      value: report.summary.totalRuntimeChunks,
      detail: `${report.summary.runtimeReadySubjects} 个 runtime manifest`,
      icon: Gauge,
    },
  ];

  return (
    <AppShell>
      <StemotionPageShell
        data-knowledge-workbench
        eyebrow="知识库"
        title="知识库健康度"
        description={`生成时间：${formatDateTime(report.generatedAt)}`}
        actions={(
          <Link
            href="/learn"
            className="stemotion-pressable inline-flex min-h-10 w-fit items-center gap-2 rounded-lg border border-teal-200 bg-[var(--stemotion-primary-soft)] px-3 py-2 text-sm font-semibold text-[var(--stemotion-primary-strong)] transition hover:border-teal-300 hover:bg-white"
          >
            <span>学习面板</span>
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        )}
      >

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => (
              <StemotionMetricCard
                key={card.label}
                label={card.label}
                value={card.value}
                detail={card.detail}
                icon={card.icon}
              />
            ))}
          </section>

          <StemotionPanel className="px-3 py-3">
            <div className="grid gap-4 text-sm text-[var(--stemotion-muted)] md:grid-cols-[1fr_auto] md:items-center">
              <p>{report.processedVsRuntimeNote}</p>
              <code className="block max-w-full overflow-x-auto rounded-lg border border-[var(--stemotion-border)] bg-[var(--stemotion-surface-strong)] px-3 py-2 text-xs font-semibold text-[var(--stemotion-ink)]">
                {report.reingestCommandExample}
              </code>
            </div>
          </StemotionPanel>

          <section className="grid gap-4 lg:grid-cols-2">
            {report.subjects.map((subject) => (
              <SubjectHealthCard key={subject.subject} subject={subject} />
            ))}
          </section>
      </StemotionPageShell>
    </AppShell>
  );
}

function SubjectHealthCard({ subject }: { subject: KnowledgeSubjectHealth }) {
  return (
    <StemotionPanel className="p-4" screenLabel={`知识库 ${subject.displayName}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-[var(--stemotion-ink)]">{subject.displayName}</p>
          <p className="mt-1 break-all text-xs text-[var(--stemotion-muted)]">{subject.subject}</p>
        </div>
        <span className={`inline-flex w-fit items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold ${statusClass[subject.validationStatus]}`}>
          {subject.validationStatus === 'healthy' ? <ShieldCheck size={14} aria-hidden="true" /> : <TriangleAlert size={14} aria-hidden="true" />}
          {statusLabel[subject.validationStatus]}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="sources" value={subject.sourceFileCount} />
        <Metric label="processed" value={subject.processedChunkCount} />
        <Metric label="runtime" value={subject.runtimeChunkCount} />
        <Metric label="score" value={`${subject.healthScore}%`} />
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-lg bg-slate-100">
        <div
          className="h-full rounded-lg bg-[var(--stemotion-primary)]"
          style={{ width: `${subject.healthScore}%` }}
          aria-hidden="true"
        />
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <InfoBlock label="静态 Manifest" value={subject.processedManifestExists ? '存在' : '缺失'} />
        <InfoBlock label="运行时 Manifest" value={subject.runtimeManifestExists ? '存在' : '缺失'} />
        <InfoBlock label="索引文件" value={subject.processedIndexFiles.join(', ') || '无'} />
        <InfoBlock label="最后更新" value={formatDateTime(subject.lastUpdated)} />
      </dl>

      <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
        <TextList label="覆盖模块" items={subject.coverageModules} empty="无来源模块" />
        <TextList label="缺失模块" items={subject.missingModules} empty="未发现缺失" />
      </div>

      <div className="mt-4 border-t border-[var(--stemotion-border)] pt-3 text-xs leading-5 text-[var(--stemotion-muted)]">
        {subject.notes.join(' ')}
      </div>
    </StemotionPanel>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="min-h-16 border-l border-[var(--stemotion-border)] pl-3">
      <p className="text-[10px] font-bold uppercase text-[var(--stemotion-muted)]">{label}</p>
      <p className="mt-1 text-xl font-bold text-[var(--stemotion-ink)]">{value}</p>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold text-[var(--stemotion-muted)]">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-[var(--stemotion-ink)]">{value}</dd>
    </div>
  );
}

function TextList({ label, items, empty }: { label: string; items: string[]; empty: string }) {
  const visibleItems = items.slice(0, 8);
  const remainingCount = items.length - visibleItems.length;

  return (
    <div>
      <p className="text-xs font-bold text-[var(--stemotion-muted)]">{label}</p>
      <p className="mt-1 text-[var(--stemotion-ink)]">
        {visibleItems.length > 0 ? visibleItems.join(', ') : empty}
        {remainingCount > 0 ? ` 等 ${remainingCount + visibleItems.length} 项` : ''}
      </p>
    </div>
  );
}

function formatDateTime(value: string): string {
  if (!value || value === 'not available') return value || 'not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
