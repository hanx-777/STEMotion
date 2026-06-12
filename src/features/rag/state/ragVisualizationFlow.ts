import type { InteractionArtifact } from '@/features/deep-interaction/lib/types';

export type RagVisualizationMode = 'auto' | 'manual' | 'off';
export type RagVisualizationStatus = 'pending' | 'generating' | 'ready' | 'failed' | 'disabled';

export interface RagVisualizationMetadata {
  visualization_status?: RagVisualizationStatus;
  visualization_error?: string;
  auto_saved_at?: string;
  visualization_artifact?: InteractionArtifact;
}

export type RagVisualizationGenerationUiState =
  | { status: 'idle'; progress: number; message: string; logs: string[]; diagnostics?: RagVisualizationFailureDiagnostics }
  | { status: 'generating'; progress: number; message: string; logs: string[]; diagnostics?: RagVisualizationFailureDiagnostics }
  | { status: 'ready'; progress: number; message: string; logs: string[]; diagnostics?: RagVisualizationFailureDiagnostics }
  | { status: 'error'; progress: number; message: string; logs: string[]; diagnostics?: RagVisualizationFailureDiagnostics };

export interface RagVisualizationFailureDiagnostics {
  missing?: string[];
  repairAttempts?: number;
}

export function shouldStartRagVisualization(input: {
  visualizationMode: RagVisualizationMode;
  demoFallback?: boolean;
  backendShouldGenerate?: boolean;
}): boolean {
  if (input.visualizationMode !== 'auto') return false;
  if (input.demoFallback) return false;
  // 后端 orchestrator 已做关键词+置信度判断，前端以该信号为准
  if (input.backendShouldGenerate === false) return false;
  return true;
}

export function createRagVisualizationDraftResult<T extends object>(
  result: T,
  options: { visualizationMode: RagVisualizationMode; now?: string },
): T & RagVisualizationMetadata {
  if (options.visualizationMode === 'off') {
    return {
      ...result,
      visualization_status: 'disabled',
      visualization_error: undefined,
      auto_saved_at: options.now ?? new Date().toISOString(),
    };
  }

  return {
    ...result,
    visualization_status: options.visualizationMode === 'auto' ? 'pending' : 'disabled',
    visualization_error: undefined,
    auto_saved_at: options.visualizationMode === 'auto' ? undefined : options.now ?? new Date().toISOString(),
  };
}

export function markRagVisualizationGenerating<T extends object>(result: T): T & RagVisualizationMetadata {
  return {
    ...result,
    visualization_status: 'generating',
    visualization_error: undefined,
  };
}

export function completeRagVisualizationSuccess<T extends object>(
  result: T,
  options: { artifact: InteractionArtifact; now?: string },
): T & RagVisualizationMetadata {
  return {
    ...result,
    visualization_status: 'ready',
    visualization_error: undefined,
    visualization_artifact: options.artifact,
    auto_saved_at: options.now ?? new Date().toISOString(),
  };
}

export function completeRagVisualizationFailure<T extends object>(
  result: T,
  options: { error: string; now?: string },
): T & RagVisualizationMetadata {
  return {
    ...result,
    visualization_status: 'failed',
    visualization_error: options.error,
    auto_saved_at: options.now ?? new Date().toISOString(),
  };
}

export function restoreRagVisualizationGenerationState(
  result: RagVisualizationMetadata | null | undefined,
): RagVisualizationGenerationUiState {
  if (!result) return idleVisualizationState();

  if (result.visualization_status === 'ready' && result.visualization_artifact) {
    return {
      status: 'ready',
      progress: 100,
      message: '已恢复互动可视化',
      logs: ['已恢复互动可视化'],
    };
  }

  if (result.visualization_status === 'failed') {
    const message = result.visualization_error || '互动可视化生成失败';
    return {
      status: 'error',
      progress: 100,
      message,
      logs: [message],
    };
  }

  if (result.visualization_status === 'generating' || result.visualization_status === 'pending') {
    const message = '上次互动可视化生成被刷新或关闭中断，可重新生成。';
    return {
      status: 'error',
      progress: 100,
      message,
      logs: [message],
    };
  }

  return idleVisualizationState();
}

export function idleVisualizationState(): RagVisualizationGenerationUiState {
  return { status: 'idle', progress: 0, message: '', logs: [] };
}
