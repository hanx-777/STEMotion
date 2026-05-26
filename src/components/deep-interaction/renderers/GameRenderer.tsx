'use client';

import { useMemo, useState } from 'react';
import type { GameSchema } from '@/lib/deep-interaction/types';
import { useDeepInteractionUIStore } from '@/lib/stores/deepInteractionUIStore';

export default function GameRenderer({ schema }: { schema: GameSchema }) {
  const activeQuizId = useDeepInteractionUIStore((state) => state.activeQuizId);
  const questions = schema.quiz ?? [];
  const activeIndex = Math.max(0, questions.findIndex((question) => question.id === activeQuizId));
  const [index, setIndex] = useState(activeIndex === -1 ? 0 : activeIndex);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);

  const question = questions[index];
  const answered = selected !== null;
  const correct = selected === question?.correctAnswer;
  const progress = useMemo(() => ((index + (answered ? 1 : 0)) / Math.max(1, questions.length)) * 100, [answered, index, questions.length]);

  const choose = (option: string) => {
    if (answered) return;
    setSelected(option);
    if (option === question.correctAnswer) setScore((value) => value + (schema.scoring?.correctPoints ?? 10));
  };

  const next = () => {
    setSelected(null);
    setIndex((value) => Math.min(questions.length - 1, value + 1));
  };

  return (
    <div className="grid h-full min-h-[620px] grid-cols-1 bg-slate-50 lg:grid-cols-[1fr_300px]">
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-black uppercase tracking-wider text-amber-600">知识挑战</div>
              <h3 className="mt-1 text-2xl font-black">{schema.title}</h3>
            </div>
            <div className="rounded-lg bg-amber-50 px-4 py-2 text-sm font-black text-amber-700">{score} 分</div>
          </div>
          <div className="mb-5 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-amber-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          {question ? (
            <>
              <h4 className="text-lg font-black leading-relaxed">{question.question}</h4>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {question.options.map((option) => {
                  const isSelected = selected === option;
                  const isCorrect = answered && option === question.correctAnswer;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => choose(option)}
                      className={`min-h-14 rounded-lg border px-4 text-left text-sm font-bold transition ${
                        isCorrect
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                          : isSelected
                            ? 'border-red-300 bg-red-50 text-red-800'
                            : 'border-slate-200 bg-slate-50 hover:border-amber-300 hover:bg-amber-50'
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
              {answered && (
                <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className={`text-sm font-black ${correct ? 'text-emerald-700' : 'text-red-700'}`}>
                    {correct ? '回答正确' : '再想一想'}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{question.explanation}</p>
                  <button
                    type="button"
                    onClick={next}
                    disabled={index >= questions.length - 1}
                    className="mt-4 min-h-11 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white disabled:bg-slate-200 disabled:text-slate-500"
                  >
                    下一题
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500">这个游戏还没有题目。</p>
          )}
        </div>
      </section>
      <aside className="custom-scrollbar overflow-y-auto border-t border-slate-200 bg-white p-5 lg:border-l lg:border-t-0">
        <div className="text-xs font-black uppercase tracking-wider text-slate-400">规则</div>
        <ul className="mt-3 space-y-2 text-sm text-slate-600">
          {schema.rules.map((rule) => <li key={rule}>- {rule}</li>)}
        </ul>
        <div className="mt-6 text-xs font-black uppercase tracking-wider text-slate-400">关卡</div>
        <div className="mt-3 space-y-2">
          {schema.levels.map((level) => (
            <div key={level.id} className="rounded-lg border border-slate-200 p-3">
              <div className="text-sm font-bold">{level.title}</div>
              <p className="mt-1 text-xs text-slate-500">{level.challenge}</p>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
