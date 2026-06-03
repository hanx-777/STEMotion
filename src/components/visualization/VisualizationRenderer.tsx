'use client';

import React, { useRef, useEffect } from 'react';
import type { VisualizationSpec } from '@/lib/rag/visualization/types';
import { FunctionGraphRenderer } from './FunctionGraphRenderer';
import { ForceDiagramRenderer } from './ForceDiagramRenderer';
import { AlgorithmTraceRenderer } from './AlgorithmTraceRenderer';
import { ProjectileMotionRenderer } from './ProjectileMotionRenderer';
import { patchHtmlForIframe } from '@/lib/utils/iframe';

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
      return <ProjectileMotionRenderer spec={spec} />;
    case 'interactive_html':
      return <InteractiveHtmlRenderer spec={spec} />;
    default:
      return null;
  }
}

function InteractiveHtmlRenderer({ spec }: { spec: Extract<VisualizationSpec, { type: 'interactive_html' }> }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!iframeRef.current || !spec.html) return;

    const patchedHtml = patchHtmlForIframe(spec.html);
    const blob = new Blob([patchedHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);

    iframeRef.current.src = url;

    return () => URL.revokeObjectURL(url);
  }, [spec.html]);

  if (!spec.html) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-800">可视化生成中...</p>
      </div>
    );
  }

  return (
    <div className="relative w-full" style={{ minHeight: '400px' }}>
      <iframe
        ref={iframeRef}
        className="h-full w-full rounded-lg border border-slate-200"
        style={{ minHeight: '400px' }}
        sandbox="allow-scripts"
        title={spec.title}
      />
    </div>
  );
}
