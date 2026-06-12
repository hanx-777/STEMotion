'use client';

import type { InteractionArtifact } from '@/features/deep-interaction/lib/types';
import ErrorBoundary from '@/components/ErrorBoundary';
import SimulationRenderer from './renderers/SimulationRenderer';
import MindMapRenderer from './renderers/MindMapRenderer';
import ThreeDVisualizationRenderer from './renderers/ThreeDVisualizationRenderer';
import GameRenderer from './renderers/GameRenderer';
import PlaceholderRenderer from './renderers/PlaceholderRenderer';
import HtmlWidgetRenderer from './renderers/HtmlWidgetRenderer';
import RagVisualizationArtifactRenderer from './renderers/RagVisualizationArtifactRenderer';

export default function ArtifactRenderer({ artifact }: { artifact: InteractionArtifact }) {
  return (
    <ErrorBoundary>
      <ArtifactRendererInner artifact={artifact} />
    </ErrorBoundary>
  );
}

function ArtifactRendererInner({ artifact }: { artifact: InteractionArtifact }) {
  if (artifact.schema.type === 'rag_visualization') {
    return <RagVisualizationArtifactRenderer artifact={artifact} schema={artifact.schema} />;
  }
  if (artifact.schema.htmlWidget?.html) {
    return <HtmlWidgetRenderer artifact={artifact} />;
  }
  if (artifact.schema.type === 'simulation') {
    return <SimulationRenderer artifact={artifact} schema={artifact.schema} />;
  }
  if (artifact.schema.type === 'mind_map') {
    return <MindMapRenderer schema={artifact.schema} />;
  }
  if (artifact.schema.type === '3d_visualization') {
    return <ThreeDVisualizationRenderer schema={artifact.schema} />;
  }
  if (artifact.schema.type === 'game') {
    return <GameRenderer schema={artifact.schema} />;
  }
  return <PlaceholderRenderer title={artifact.title} />;
}
