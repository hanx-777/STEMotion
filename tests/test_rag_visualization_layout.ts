import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RagVisualizationArtifactRenderer from '../src/components/deep-interaction/renderers/RagVisualizationArtifactRenderer';
import { VisualizationRenderer } from '../src/components/visualization/VisualizationRenderer';
import { createRagVisualizationArtifact } from '../src/lib/rag/visualization/artifactAdapter';
import type { VisualizationSpec } from '../src/lib/rag/visualization/types';

const projectileSpec: VisualizationSpec = {
  type: 'projectile_motion',
  title: '斜抛运动可视化',
  description: '观察初速度、角度和重力如何共同决定轨迹。',
  knowledgePoint: '斜抛运动',
  scenario: '二维抛体轨迹',
  visualGoal: '观察轨迹、速度分解、最大高度和水平射程。',
  variables: [
    { name: 'v0', label: '初速度', value: '8', unit: 'm/s' },
    { name: 'theta', label: '抛射角', value: '35', unit: 'deg' },
  ],
  parameters: {
    v0: 8,
    angle_deg: 35,
    g: 9.8,
  },
};

test('projectile visualization renders an interactive trajectory stage instead of a static stats card', () => {
  const markup = renderToStaticMarkup(React.createElement(VisualizationRenderer, { spec: projectileSpec }));

  assert.match(markup, /data-projectile-stage/);
  assert.match(markup, /<svg/);
  assert.match(markup, /type="range"/);
  assert.match(markup, /最大高度/);
  assert.match(markup, /水平射程/);
  assert.equal(markup.includes('?'), false);
});

test('RAG visualization artifact keeps explanation panel while giving the visual stage the main lower area', () => {
  const artifact = createRagVisualizationArtifact({
    spec: {
      ...projectileSpec,
      brief: {
        originalQuestion: '初速度 8m/s，抛射角 35°，观察轨迹和关键运动量',
        knowledgePoint: '斜抛运动',
        scenario: '二维抛体轨迹',
        variables: projectileSpec.variables ?? [],
        visualGoal: '观察轨迹、速度分解、最大高度和水平射程。',
        recommendedType: 'projectile_motion',
        mustShow: ['轨迹', '最大高度', '水平射程'],
        avoidGenericDemo: true,
        confidence: 0.9,
        source: 'heuristic',
      },
    },
    source: 'student',
    subject: 'physics_mechanics',
    originalQuestion: '初速度 8m/s，抛射角 35°，观察轨迹和关键运动量',
    taskType: 'step_solution',
    now: '2026-06-01T00:00:00.000Z',
  });
  assert.equal(artifact.schema.type, 'rag_visualization');
  if (artifact.schema.type !== 'rag_visualization') {
    throw new Error('expected rag_visualization schema');
  }
  const markup = renderToStaticMarkup(React.createElement(RagVisualizationArtifactRenderer, {
    artifact,
    schema: artifact.schema,
  }));

  assert.match(markup, /data-rag-visualization-stage/);
  assert.match(markup, /data-rag-explanation-panel/);
  assert.match(markup, /lg:grid-cols-\[minmax\(0,74fr\)_minmax\(240px,26fr\)\]/);
  assert.match(markup, /data-rag-explanation-details/);
  assert.match(markup, /data-rag-stage-shell/);
  assert.match(markup, /斜抛运动/);
  assert.match(markup, /初速度 8m\/s/);
});
