'use client';

import { useMemo } from 'react';
import { useGenerationProgressStore, type GenerationLogItem } from '@/lib/stores/generationProgressStore';
import { createDeepInteractionStages } from '@/lib/progress/progressStages';
import type { ProgressModel } from '@/lib/progress/progressTypes';
import RealisticProgressPanel from '@/components/progress/RealisticProgressPanel';
import BlueprintPreview from './BlueprintPreview';

const LOG_STAGE_TO_PROGRESS: Record<string, string> = {
  planning: 'session',
  selecting_type: 'planning',
  generating_outline: 'planning',
  type_selected: 'planning',
  blueprint: 'blueprint',
  subject_validation: 'validation',
  template: 'template',
  generating_schema: 'generation',
  outline_generated: 'generation',
  schema_generated: 'generation',
  building_interaction: 'generation',
  artifact_ready: 'complete',
  feedback: 'quality',
  evaluation: 'quality',
  repair: 'repair',
  ready: 'complete',
  validating: 'quality',
};

function mapLogsToStage(logs: GenerationLogItem[], stageId: string): GenerationLogItem[] {
  return logs.filter((l) => LOG_STAGE_TO_PROGRESS[l.stage] === stageId);
}

interface ProgressStoreSnapshot {
  active: boolean;
  currentStage: string;
  progress: number;
  logs: GenerationLogItem[];
  error: string | null;
}

function mapStoreToProgressModel(store: ProgressStoreSnapshot): ProgressModel {
  const stages = createDeepInteractionStages();
  const { logs, error, active, currentStage } = store;

  for (const stage of stages) {
    const relevantLogs = mapLogsToStage(logs, stage.id);
    if (relevantLogs.length === 0) continue;

    const lastLog = relevantLogs[relevantLogs.length - 1];

    if (error && !active) {
      stage.status = 'error';
      stage.detail = error;
    } else if (currentStage === 'ready' || (!active && store.progress === 100)) {
      stage.status = 'completed';
    } else {
      stage.status = 'running';
    }

    stage.detail = lastLog.message;
    stage.startedAt = new Date(relevantLogs[0].createdAt).getTime();
    if (stage.status === 'completed' || stage.status === 'error') {
      stage.completedAt = new Date(lastLog.createdAt).getTime();
    }
  }

  // Mark stages before the running one as completed
  const runningIdx = stages.findIndex((s) => s.status === 'running');
  if (runningIdx > 0) {
    for (let i = 0; i < runningIdx; i++) {
      if (stages[i].status === 'idle') {
        stages[i].status = 'completed';
      }
    }
  }

  // Handle repair stage — only show if repair actually happened
  const repairStage = stages.find((s) => s.id === 'repair');
  if (repairStage && repairStage.status === 'idle') {
    repairStage.status = 'skipped';
  }

  // Handle complete stage
  const completeStage = stages.find((s) => s.id === 'complete');
  if (completeStage && completeStage.status === 'idle' && !active && store.progress === 100) {
    completeStage.status = 'completed';
  }

  const hasError = stages.some((s) => s.status === 'error');

  return {
    mode: 'deep_interaction',
    currentStageId: stages.find((s) => s.status === 'running')?.id,
    stages,
    message: hasError
      ? '生成失败'
      : active
        ? '正在生成交互实验...'
        : store.progress === 100
          ? '生成完成'
          : '等待开始',
    isIndeterminate: active && store.progress === 0,
  };
}

export default function GenerationProgressPanel() {
  const store = useGenerationProgressStore();
  const { active, logs, blueprint, schemaValidation, outline, schemaPreview, error } = store;
  const model = useMemo(
    () => mapStoreToProgressModel({ active, logs, error, currentStage: store.currentStage, progress: store.progress }),
    [active, logs, error, store.currentStage, store.progress],
  );

  if (!active && logs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
        开始生成后，这里会显示每一步进度。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <RealisticProgressPanel model={model} />

      <BlueprintPreview blueprint={blueprint} schemaValidation={schemaValidation} />

      {outline && (
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="text-xs font-bold text-slate-500">大纲：{outline.title}</div>
          <ol className="mt-2 space-y-1 text-xs text-slate-600">
            {outline.steps.map((step, index) => (
              <li key={step}>{index + 1}. {step}</li>
            ))}
          </ol>
        </div>
      )}

      {schemaPreview ? (
        <pre className="max-h-36 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-100">
          {JSON.stringify(schemaPreview, null, 2)}
        </pre>
      ) : null}

      {error && <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    </div>
  );
}
