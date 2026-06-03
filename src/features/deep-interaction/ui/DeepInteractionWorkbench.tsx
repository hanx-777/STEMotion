'use client';

import { Suspense } from 'react';
import ErrorBoundary from '@/components/ErrorBoundary';
import DeepInteractionShell from '@/components/deep-interaction/DeepInteractionShell';

export default function DeepInteractionWorkbench() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="p-6 text-sm text-slate-500" role="status" aria-live="polite">正在加载深度交互模式...</div>}>
        <DeepInteractionShell />
      </Suspense>
    </ErrorBoundary>
  );
}
