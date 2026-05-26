'use client';

import type { ExperimentConfig } from '@/lib/schema/experiment';
import InclinedPlaneRenderer from './renderers/InclinedPlaneRenderer';
import InteractiveHtmlRenderer from './renderers/InteractiveHtmlRenderer';

export default function ExperimentCanvas({ config }: { config: ExperimentConfig }) {
  if (config.renderer === 'inclined_plane') {
    return <InclinedPlaneRenderer />;
  }

  if (config.renderer === 'interactive_html') {
    return <InteractiveHtmlRenderer config={config} />;
  }

  return (
    <div className="flex h-full items-center justify-center text-sm font-bold uppercase tracking-wider text-slate-400">
      Renderer {config.renderer} is not implemented in this MVP.
    </div>
  );
}
