'use client';

import { Check, Loader2, RotateCcw } from 'lucide-react';
import type {
  GuidedClarificationQuestion,
  GuidedGenerationPlan,
} from '@/lib/deep-interaction/types';

interface GuidedPlanningPanelProps {
  loading: boolean;
  error?: string | null;
  questions: GuidedClarificationQuestion[];
  answers: Record<string, string>;
  plan: GuidedGenerationPlan | null;
  onAnswerChange: (questionId: string, answer: string) => void;
  onSubmitAnswers: () => void;
  onApprove: () => void;
  onReset: () => void;
}

export default function GuidedPlanningPanel({
  loading,
  error,
  questions,
  answers,
  plan,
  onAnswerChange,
  onSubmitAnswers,
  onApprove,
  onReset,
}: GuidedPlanningPanelProps) {
  if (!loading && !error && questions.length === 0 && !plan) return null;

  return (
    <section className="rounded-lg border border-blue-100 bg-blue-50/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-wider text-blue-500">Guided Planning</div>
          <h3 className="text-sm font-black text-slate-950">生成前教学计划</h3>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-100 bg-white text-slate-500 hover:text-slate-900"
          aria-label="重新修改提示词"
        >
          <RotateCcw size={15} />
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-xs font-bold text-blue-700">
          <Loader2 size={15} className="animate-spin" />
          正在梳理教学目标与交互计划...
        </div>
      )}

      {error && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </div>
      )}

      {questions.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-slate-600">
            这个需求还需要一点教学上下文。回答后我会生成可批准计划。
          </p>
          {questions.map((question) => (
            <div key={question.id} className="rounded-md border border-blue-100 bg-white p-3">
              <label className="block text-xs font-bold text-slate-800">{question.question}</label>
              {question.reason && <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{question.reason}</p>}
              {question.options?.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {question.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => onAnswerChange(question.id, option)}
                      className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 hover:border-blue-300 hover:text-blue-700"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              ) : null}
              <input
                value={answers[question.id] ?? ''}
                onChange={(event) => onAnswerChange(question.id, event.target.value)}
                className="mt-2 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                placeholder="输入你的回答"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={onSubmitAnswers}
            disabled={loading || questions.some((question) => !(answers[question.id] ?? '').trim())}
            className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-xs font-black text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400"
          >
            提交回答并生成计划
          </button>
        </div>
      )}

      {plan && (
        <div className="space-y-3">
          <div className="rounded-md border border-blue-100 bg-white p-3">
            <div className="text-xs font-black text-slate-950">{plan.topic}</div>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">{plan.expectedInsight}</p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold">
              <span className="rounded bg-slate-100 px-2 py-1 text-slate-600">{plan.subjectDomain}</span>
              {plan.interactionType && <span className="rounded bg-slate-100 px-2 py-1 text-slate-600">{plan.interactionType}</span>}
              {plan.possibleTemplate?.templateId && (
                <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">Verified Template</span>
              )}
            </div>
          </div>

          <PlanList title="学习目标" items={plan.learningObjectives} />
          <PlanList title="核心变量" items={plan.coreVariables} />
          <PlanList title="知识约束" items={plan.knowledgeConstraints} />
          <PlanList title="交互结构" items={plan.interactionStructure} />
          <PlanList title="质量关注点" items={plan.qualityFocus} />

          {plan.assumptions.length > 0 && (
            <div className="rounded-md border border-amber-100 bg-amber-50 p-3">
              <div className="mb-1 text-[11px] font-black uppercase tracking-wider text-amber-700">Assumptions</div>
              <ul className="space-y-1 text-xs leading-relaxed text-amber-900">
                {plan.assumptions.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          )}

          <button
            type="button"
            onClick={onApprove}
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white hover:bg-slate-700 disabled:bg-slate-200 disabled:text-slate-400"
          >
            <Check size={15} />
            批准计划并开始生成
          </button>
        </div>
      )}
    </section>
  );
}

function PlanList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="mb-1 text-[11px] font-black uppercase tracking-wider text-slate-400">{title}</div>
      <ul className="space-y-1 rounded-md bg-white p-3 text-xs leading-relaxed text-slate-700">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}
