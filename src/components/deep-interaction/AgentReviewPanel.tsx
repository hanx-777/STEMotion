'use client';

import { ChevronDown, ChevronRight, CheckCircle2, XCircle, AlertTriangle, Star } from 'lucide-react';
import { useState } from 'react';
import { useGenerationProgressStore } from '@/lib/stores/generationProgressStore';
import type { AgentEvaluation, FeedbackIteration, QualityReport } from '@/features/deep-interaction/lib/types';

export default function AgentReviewPanel() {
  const { feedbackIterations, qualityReport } = useGenerationProgressStore();

  if (feedbackIterations.length === 0 && !qualityReport) return null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 text-xs font-black uppercase tracking-wider text-slate-400">Agent Review</div>

      {feedbackIterations.map((iteration) => (
        <IterationCard key={iteration.iteration} iteration={iteration} />
      ))}

      {qualityReport && <QualityReportCard report={qualityReport} />}
    </section>
  );
}

function IterationCard({ iteration }: { iteration: FeedbackIteration }) {
  const [expanded, setExpanded] = useState(true);
  const decisionColor =
    iteration.judgeDecision.type === 'accept' ? 'text-emerald-600' :
    iteration.judgeDecision.type === 'repair' ? 'text-amber-600' :
    'text-red-600';

  const decisionLabel =
    iteration.judgeDecision.type === 'accept' ? '通过' :
    iteration.judgeDecision.type === 'repair' ? '修复' :
    iteration.judgeDecision.type === 'reject' ? '拒绝' : '重生成';

  return (
    <div className="mb-3 rounded-lg border border-slate-100">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="font-bold">第 {iteration.iteration} 轮</span>
        <span className={`ml-auto font-bold ${decisionColor}`}>
          {decisionLabel}
        </span>
        <span className="text-slate-500">
          {iteration.judgeDecision.finalScore}/100
        </span>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-3 py-2 space-y-2">
          {iteration.evaluations.map((evaluation) => (
            <EvaluationRow key={evaluation.agentName} evaluation={evaluation} />
          ))}

          <div className="mt-2 rounded-md bg-slate-50 p-2 text-[11px]">
            <div className="font-bold text-slate-600">Judge 决策</div>
            <p className="mt-1 text-slate-500">{iteration.judgeDecision.reason}</p>
            {iteration.judgeDecision.repairInstruction && (
              <p className="mt-1 text-amber-600">修复指令：{iteration.judgeDecision.repairInstruction}</p>
            )}
          </div>

          {iteration.changeLog && iteration.changeLog.length > 0 && (
            <div className="rounded-md bg-blue-50 p-2 text-[11px]">
              <div className="font-bold text-blue-700">变更记录</div>
              <ul className="mt-1 space-y-0.5 text-blue-600">
                {iteration.changeLog.map((change, i) => (
                  <li key={i}>- {change}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EvaluationRow({ evaluation }: { evaluation: AgentEvaluation }) {
  const icon = evaluation.passed
    ? <CheckCircle2 size={12} className="text-emerald-500" />
    : <XCircle size={12} className="text-red-500" />;

  const scoreColor =
    evaluation.score >= 85 ? 'text-emerald-600' :
    evaluation.score >= 70 ? 'text-amber-600' :
    'text-red-600';

  return (
    <div className="flex items-center gap-2 text-[11px]">
      {icon}
      <span className="flex-1 font-medium text-slate-700">{evaluation.agentName}</span>
      <span className={`font-bold ${scoreColor}`}>{evaluation.score}/100</span>
      {evaluation.issues.length > 0 && (
        <span className="flex items-center gap-0.5 text-amber-500">
          <AlertTriangle size={10} />
          {evaluation.issues.length}
        </span>
      )}
      {evaluation.durationMs && (
        <span className="text-slate-400">{(evaluation.durationMs / 1000).toFixed(1)}s</span>
      )}
    </div>
  );
}

function QualityReportCard({ report }: { report: QualityReport }) {
  const [expanded, setExpanded] = useState(true);

  const levelColors: Record<string, string> = {
    excellent: 'bg-emerald-100 text-emerald-700',
    good: 'bg-blue-100 text-blue-700',
    usable: 'bg-amber-100 text-amber-700',
    needs_improvement: 'bg-orange-100 text-orange-700',
    failed: 'bg-red-100 text-red-700',
  };

  const levelLabels: Record<string, string> = {
    excellent: '优秀',
    good: '良好',
    usable: '可用',
    needs_improvement: '需改进',
    failed: '不达标',
  };

  return (
    <div className="rounded-lg border border-slate-200">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Star size={12} className="text-amber-500" />
        <span className="font-bold">质量报告</span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${levelColors[report.level]}`}>
          {levelLabels[report.level]} {report.finalScore}/100
        </span>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-3 py-2 space-y-2 text-[11px]">
          <p className="text-slate-600">{report.summary}</p>

          {report.strengths.length > 0 && (
            <div>
              <div className="font-bold text-emerald-600">优势</div>
              <ul className="mt-0.5 space-y-0.5 text-emerald-700">
                {report.strengths.map((s, i) => <li key={i}>+ {s}</li>)}
              </ul>
            </div>
          )}

          {report.weaknesses.length > 0 && (
            <div>
              <div className="font-bold text-red-600">不足</div>
              <ul className="mt-0.5 space-y-0.5 text-red-700">
                {report.weaknesses.map((w, i) => <li key={i}>- {w}</li>)}
              </ul>
            </div>
          )}

          {report.suggestions.length > 0 && (
            <div>
              <div className="font-bold text-blue-600">改进建议</div>
              <ul className="mt-0.5 space-y-0.5 text-blue-700">
                {report.suggestions.map((s, i) => <li key={i}>&bull; {s}</li>)}
              </ul>
            </div>
          )}

          {Object.keys(report.evaluatorScores).length > 0 && (
            <div>
              <div className="font-bold text-slate-500">各评估分数</div>
              <div className="mt-1 space-y-0.5">
                {Object.entries(report.evaluatorScores).map(([name, score]) => (
                  <div key={name} className="flex justify-between">
                    <span className="text-slate-600">{name}</span>
                    <span className={`font-bold ${score >= 85 ? 'text-emerald-600' : score >= 70 ? 'text-amber-600' : 'text-red-600'}`}>{score}/100</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(report.blueprintSummary || report.schemaValidation || hasBlueprintMetrics(report)) && (
            <div>
              <div className="font-bold text-slate-500">蓝图对齐</div>
              {report.blueprintSummary && (
                <p className="mt-1 text-slate-600">
                  {report.blueprintSummary.topic} · {report.blueprintSummary.subjectDomain} · {report.blueprintSummary.gradeRange[0]}-{report.blueprintSummary.gradeRange[1]} 年级
                </p>
              )}
              <div className="mt-1 space-y-0.5">
                {metricRow('蓝图对齐', report.blueprintAlignment)}
                {metricRow('目标覆盖', report.learningObjectiveCoverage)}
                {metricRow('变量覆盖', report.variableCoverage)}
                {metricRow('知识约束', report.knowledgeConstraintSatisfaction)}
                {metricRow('学科正确性', report.subjectCorrectness)}
              </div>
              {report.schemaValidation && (
                <p className={report.schemaValidation.passed ? 'mt-1 text-emerald-700' : 'mt-1 text-amber-700'}>
                  学科校验：{report.schemaValidation.passed ? '通过' : '有待修正'}
                  {report.schemaValidation.schemaKey ? ` · ${report.schemaValidation.schemaKey}` : ''}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function hasBlueprintMetrics(report: QualityReport): boolean {
  return [
    report.blueprintAlignment,
    report.learningObjectiveCoverage,
    report.variableCoverage,
    report.knowledgeConstraintSatisfaction,
    report.subjectCorrectness,
  ].some((value) => typeof value === 'number');
}

function metricRow(label: string, value?: number) {
  if (typeof value !== 'number') return null;
  return (
    <div key={label} className="flex justify-between">
      <span className="text-slate-600">{label}</span>
      <span className={`font-bold ${value >= 85 ? 'text-emerald-600' : value >= 70 ? 'text-amber-600' : 'text-red-600'}`}>{value}/100</span>
    </div>
  );
}
