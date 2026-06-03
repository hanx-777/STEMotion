import type { ProgressModel } from './progressTypes';

const RAG_WEIGHTS: Record<string, number> = {
  parse: 10,
  retrieve_local: 25,
  retrieve_web: 10,
  generate: 30,
  citations: 15,
  visualization: 10,
};

const DI_WEIGHTS: Record<string, number> = {
  session: 5,
  planning: 10,
  blueprint: 15,
  validation: 10,
  template: 10,
  generation: 25,
  quality: 15,
  repair: 5,
  complete: 5,
};

export function calculateProgress(model: ProgressModel): number {
  const weights = model.mode === 'rag' ? RAG_WEIGHTS : DI_WEIGHTS;
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  let accumulated = 0;

  for (const stage of model.stages) {
    const weight = weights[stage.id] ?? 0;
    if (stage.status === 'completed') {
      accumulated += weight;
    } else if (stage.status === 'skipped') {
      accumulated += weight;
    } else if (stage.status === 'running') {
      accumulated += weight * 0.4;
    }
  }

  return Math.round((accumulated / totalWeight) * 100);
}

export function isAllDone(model: ProgressModel): boolean {
  return model.stages.every((s) => s.status === 'completed' || s.status === 'skipped');
}
