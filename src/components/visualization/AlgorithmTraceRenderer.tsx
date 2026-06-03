'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import type { AlgorithmTraceSpec } from '@/lib/rag/visualization/types';
import { normalizeAlgorithmTraceSpec } from '@/lib/rag/visualization/algorithmTraceSpec';
import { prefersReducedMotion, stemotionMotion } from '@/lib/animation/motionTokens';

interface Props {
  spec: AlgorithmTraceSpec;
}

export function AlgorithmTraceRenderer({ spec }: Props) {
  const displaySpec = useMemo(() => normalizeAlgorithmTraceSpec(spec), [spec]);
  const [activeStep, setActiveStep] = useState(0);
  const stepListRef = useRef<HTMLDivElement>(null);
  const statePanelRef = useRef<HTMLDivElement>(null);
  const safeStepIndex = Math.min(activeStep, Math.max(0, displaySpec.steps.length - 1));
  const step = displaySpec.steps[safeStepIndex];

  useEffect(() => {
    const list = stepListRef.current;
    if (!list || prefersReducedMotion()) return;
    const targets = Array.from(list.children);
    const tween = gsap.fromTo(
      targets,
      { autoAlpha: 0, x: -8 },
      {
        autoAlpha: 1,
        x: 0,
        duration: stemotionMotion.duration.item,
        stagger: stemotionMotion.stagger.tight,
        ease: stemotionMotion.ease.standard,
        overwrite: 'auto',
      },
    );
    return () => {
      tween.kill();
    };
  }, [displaySpec.steps]);

  useEffect(() => {
    const panel = statePanelRef.current;
    if (!panel || prefersReducedMotion()) return;
    gsap.fromTo(
      panel,
      { autoAlpha: 0.72, y: 6 },
      {
        autoAlpha: 1,
        y: 0,
        duration: stemotionMotion.duration.quick,
        ease: stemotionMotion.ease.standard,
        overwrite: 'auto',
      },
    );
  }, [activeStep]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <h4 className="mb-2 font-medium text-gray-800 dark:text-gray-200">{displaySpec.title}</h4>
      <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">{displaySpec.description}</p>

      <div className="mb-3 text-sm text-gray-600 dark:text-gray-300">
        输入：<code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-gray-800">{displaySpec.inputExample}</code>
      </div>

      <div className="flex gap-4">
        {/* Step list */}
        <div ref={stepListRef} className="w-1/3 space-y-1">
          {displaySpec.steps.map((s, i) => (
            <button
              key={s.stepIndex}
              onClick={() => setActiveStep(i)}
              className={`w-full rounded px-2 py-1.5 text-left text-sm transition-colors ${
                i === safeStepIndex
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
            <div ref={statePanelRef}>
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
          onClick={() => setActiveStep(Math.max(0, safeStepIndex - 1))}
          disabled={safeStepIndex === 0}
          className="rounded bg-gray-100 px-3 py-1 text-sm hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-800 dark:hover:bg-gray-700"
        >
          上一步
        </button>
        <span className="text-sm text-gray-500">{safeStepIndex + 1} / {displaySpec.steps.length}</span>
        <button
          onClick={() => setActiveStep(Math.min(displaySpec.steps.length - 1, safeStepIndex + 1))}
          disabled={safeStepIndex === displaySpec.steps.length - 1}
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
