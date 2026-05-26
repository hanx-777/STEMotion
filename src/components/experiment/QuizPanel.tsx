'use client';

import { useState } from 'react';
import { CheckCircle2, HelpCircle } from 'lucide-react';
import { useExperimentStore } from '@/lib/stores/experimentStore';
import { usePlaybackStore } from '@/lib/stores/playbackStore';

export default function QuizPanel() {
  const config = useExperimentStore((state) => state.config);
  const activeQuizId = usePlaybackStore((state) => state.activeQuizId);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);

  const quiz = config?.quiz.find((question) => question.id === activeQuizId) ?? config?.quiz[0];
  if (!quiz) return null;

  const isAnswered = selectedAnswer !== null;
  const isCorrect = selectedAnswer === String(quiz.correctAnswer);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
        <HelpCircle size={15} />
        <span>Class check</span>
      </div>
      <p className="mb-3 text-sm font-semibold leading-relaxed text-slate-800">{quiz.question}</p>

      {quiz.options && (
        <div className="space-y-2">
          {quiz.options.map((option) => (
            <button
              key={option}
              onClick={() => setSelectedAnswer(option)}
              className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                selectedAnswer === option
                  ? 'border-blue-400 bg-blue-50 text-blue-900'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      )}

      {isAnswered && (
        <div
          className={`mt-3 rounded-md border p-3 text-sm ${
            isCorrect ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          <div className="mb-1 flex items-center gap-2 font-bold">
            <CheckCircle2 size={15} />
            <span>{isCorrect ? '回答正确' : '再想一想'}</span>
          </div>
          {quiz.explanation}
        </div>
      )}
    </section>
  );
}
