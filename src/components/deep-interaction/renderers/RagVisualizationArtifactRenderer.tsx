'use client';

import { BadgeCheck, BookOpenCheck, ClipboardList, Database } from 'lucide-react';
import { VisualizationRenderer } from '@/components/visualization/VisualizationRenderer';
import type { InteractionArtifact, RagVisualizationSchema } from '@/lib/deep-interaction/types';
import HtmlWidgetRenderer from './HtmlWidgetRenderer';

export default function RagVisualizationArtifactRenderer({
  artifact,
  schema,
}: {
  artifact: InteractionArtifact;
  schema: RagVisualizationSchema;
}) {
  const qualityLabel = artifact.qualityReport
    ? qualityLevelLabel(artifact.qualityReport.level)
    : '未评分';
  const brief = schema.brief ?? schema.visualizationSpec.brief;
  const plan = schema.visualizationPlan;

  return (
    <div className="flex h-full min-h-[640px] flex-col bg-white text-slate-900">
      <div className="border-b border-slate-200 p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-teal-700">
          <BookOpenCheck size={15} />
          RAG 可视化 Artifact
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-lg font-black text-slate-900">{schema.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{schema.description}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-700">
            <BadgeCheck size={15} />
            {qualityLabel}
            {artifact.finalScore != null ? ` ${artifact.finalScore}` : ''}
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_320px]">
        <div data-rag-visualization-stage className="flex min-h-[560px] min-w-0 overflow-hidden p-4 lg:p-5">
          {schema.htmlWidget?.html ? (
            <div className="min-h-0 flex-1">
              <HtmlWidgetRenderer artifact={artifact} />
            </div>
          ) : (
            <VisualizationRenderer spec={schema.visualizationSpec} />
          )}
        </div>

        <aside data-rag-explanation-panel className="custom-scrollbar min-h-0 overflow-y-auto border-t border-slate-200 bg-slate-50 p-4 lg:border-l lg:border-t-0">
          {brief && (
            <section className="mb-5 rounded-lg border border-teal-100 bg-white p-3 text-sm leading-relaxed text-slate-700">
              <div className="text-xs font-black uppercase tracking-wider text-teal-700">题目情境</div>
              <div className="mt-2 font-bold text-slate-900">{brief.knowledgePoint}</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{brief.originalQuestion}</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">{brief.visualGoal}</p>
              {brief.variables.length > 0 && (
                <div className="mt-3 grid gap-1">
                  {brief.variables.map((variable) => (
                    <div key={`${variable.name}-${variable.value}`} className="flex items-center justify-between rounded bg-slate-50 px-2 py-1 text-xs">
                      <span className="font-semibold text-slate-600">{variable.label}</span>
                      <span className="font-mono text-slate-900">{variable.value}{variable.unit ?? ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {plan && (
            <section className="mb-5 rounded-lg border border-blue-100 bg-white p-3 text-sm leading-relaxed text-slate-700">
              <div className="text-xs font-black uppercase tracking-wider text-blue-700">演示计划</div>
              <div className="mt-2 font-bold text-slate-900">{plan.knowledgePoint}</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{plan.problemRestatement}</p>
              <div className="mt-3 space-y-2 text-xs">
                <div>
                  <span className="font-bold text-slate-700">对象：</span>
                  <span className="text-slate-600">{plan.visualObjects.join('、')}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-700">操作：</span>
                  <span className="text-slate-600">{plan.controls.join('、')}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-700">指标：</span>
                  <span className="text-slate-600">{plan.metrics.join('、')}</span>
                </div>
              </div>
            </section>
          )}

          <section>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500">
              <BookOpenCheck size={14} />
              学习目标
            </div>
            <ul className="mt-2 space-y-2 text-sm leading-relaxed text-slate-700">
              {schema.learningGoals.map((goal) => (
                <li key={goal} className="rounded-lg bg-white px-3 py-2 shadow-sm">
                  {goal}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-5">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500">
              <ClipboardList size={14} />
              讲解步骤
            </div>
            <ol className="mt-2 space-y-2 text-sm leading-relaxed text-slate-700">
              {schema.explanationSteps.slice(0, 6).map((step) => (
                <li key={step.id} className="rounded-lg bg-white px-3 py-2 shadow-sm">
                  <div className="font-bold text-slate-800">{step.title}</div>
                  <div className="mt-1 text-xs leading-relaxed text-slate-500">{step.narration}</div>
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-5 rounded-lg border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-500">
            <div className="mb-2 flex items-center gap-2 font-black uppercase tracking-wider text-slate-500">
              <Database size={14} />
              审计与来源
            </div>
            {artifact.qualityReport && (
              <>
                <div>质量：{qualityLabel} / {artifact.qualityReport.finalScore}</div>
                <div>轮次：{artifact.feedbackLoop?.iterations.length ?? 0}</div>
              </>
            )}
            <div>页面：{schema.ragMetadata.source === 'teacher' ? '教师助教' : '学生问答'}</div>
            <div>学科：{schema.ragMetadata.subject}</div>
            <div>任务：{schema.ragMetadata.taskType}</div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function qualityLevelLabel(level: NonNullable<InteractionArtifact['qualityReport']>['level']): string {
  if (level === 'excellent') return '质量优秀';
  if (level === 'good') return '质量良好';
  if (level === 'usable') return '质量可用';
  if (level === 'needs_improvement') return '需要改进';
  return '未通过';
}
