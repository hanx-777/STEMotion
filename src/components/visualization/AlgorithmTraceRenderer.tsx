'use client';

import React, { useState } from 'react';
import type { AlgorithmTraceSpec } from '@/lib/rag/visualization/types';

interface Props {
  spec: AlgorithmTraceSpec;
}

export function AlgorithmTraceRenderer({ spec }: Props) {
  const [activeStep, setActiveStep] = useState(0);
  const step = spec.steps[activeStep];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <h4 className="mb-2 font-medium text-gray-800 dark:text-gray-200">{spec.title}</h4>
      <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">{spec.description}</p>

      <div className="mb-3 text-sm text-gray-600 dark:text-gray-300">
        输入：<code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-gray-800">{spec.inputExample}</code>
      </div>

      <div className="flex gap-4">
        {/* Step list */}
        <div className="w-1/3 space-y-1">
          {spec.steps.map((s, i) => (
            <button
              key={s.stepIndex}
              onClick={() => setActiveStep(i)}
              className={`w-full rounded px-2 py-1.5 text-left text-sm transition-colors ${
                i === activeStep
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              步骤 {s.stepIndex}: {s.operation}
            </button>
          ))}
        </div>

        {/* State visualization */}
        <div className="flex-1">
          {step && (
            <div>
              <div className="mb-2 rounded bg-gray-50 p-3 dark:bg-gray-800">
                <div className="text-xs text-gray-500 dark:text-gray-400">当前状态</div>
                <StateDisplay state={step.state} highlight={step.highlight} />
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300">{step.explanation}</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => setActiveStep(Math.max(0, activeStep - 1))}
          disabled={activeStep === 0}
          className="rounded bg-gray-100 px-3 py-1 text-sm hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-800 dark:hover:bg-gray-700"
        >
          上一步
        </button>
        <span className="text-sm text-gray-500">{activeStep + 1} / {spec.steps.length}</span>
        <button
          onClick={() => setActiveStep(Math.min(spec.steps.length - 1, activeStep + 1))}
          disabled={activeStep === spec.steps.length - 1}
          className="rounded bg-gray-100 px-3 py-1 text-sm hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-800 dark:hover:bg-gray-700"
        >
          下一步
        </button>
      </div>
    </div>
  );
}

function StateDisplay({ state, highlight }: { state: Record<string, unknown>; highlight?: string[] }) {
  return (
    <div className="mt-1 space-y-1">
      {Object.entries(state).map(([key, value]) => {
        const isHighlighted = highlight?.includes(key);
        return (
          <div key={key} className="flex items-start gap-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{key}:</span>
            <span className={`font-mono text-sm ${isHighlighted ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-gray-200'}`}>
              {formatValue(value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.join(', ')}]`;
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
}
