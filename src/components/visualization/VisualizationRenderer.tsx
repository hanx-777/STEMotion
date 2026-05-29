'use client';

import React from 'react';
import type { VisualizationSpec } from '@/lib/rag/visualization/types';
import { FunctionGraphRenderer } from './FunctionGraphRenderer';
import { ForceDiagramRenderer } from './ForceDiagramRenderer';
import { AlgorithmTraceRenderer } from './AlgorithmTraceRenderer';

interface Props {
  spec: VisualizationSpec;
}

export function VisualizationRenderer({ spec }: Props) {
  return <VisualizationInner spec={spec} />;
}

function VisualizationInner({ spec }: Props) {
  switch (spec.type) {
    case 'function_graph':
      return <FunctionGraphRenderer spec={spec} />;
    case 'force_diagram':
      return <ForceDiagramRenderer spec={spec} />;
    case 'algorithm_trace':
      return <AlgorithmTraceRenderer spec={spec} />;
    case 'projectile_motion':
      return <ProjectileMotionFallback spec={spec} />;
    default:
      return null;
  }
}

function ProjectileMotionFallback({ spec }: { spec: Extract<VisualizationSpec, { type: 'projectile_motion' }> }) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
      <h4 className="font-medium text-blue-800 dark:text-blue-200">{spec.title}</h4>
      <p className="mt-1 text-sm text-blue-600 dark:text-blue-300">{spec.description}</p>
      <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
        <div className="rounded bg-white p-2 dark:bg-gray-800">
          <span className="text-gray-500">v₀</span>
          <span className="ml-1 font-mono">{spec.parameters.v0 ?? '?'} m/s</span>
        </div>
        <div className="rounded bg-white p-2 dark:bg-gray-800">
          <span className="text-gray-500">θ</span>
          <span className="ml-1 font-mono">{spec.parameters.angle_deg ?? '?'}°</span>
        </div>
        <div className="rounded bg-white p-2 dark:bg-gray-800">
          <span className="text-gray-500">g</span>
          <span className="ml-1 font-mono">{spec.parameters.g} m/s²</span>
        </div>
      </div>
    </div>
  );
}
