import { askRag } from '@/lib/rag/rag_pipeline';
import type { RagMultiAgentMode } from '@/lib/rag/agents/types';
import type { RagAskInput, RagAskResult } from '@/lib/rag/types';
import {
  toLegacyRagInput,
  toLegacyRagResult,
  toRagV1Response,
  type RagV1AskRequest,
  type RagV1AskResponse,
  type RagV1QualityMode,
} from '../contracts';

export interface RagAskServiceOptions {
  askLegacy?: (input: RagAskInput, options?: { multiAgentMode?: RagMultiAgentMode }) => Promise<RagAskResult>;
}

export async function askRagV1(input: RagV1AskRequest, options: RagAskServiceOptions = {}): Promise<RagV1AskResponse> {
  const legacyInput = toLegacyRagInput(input);
  const result = await (options.askLegacy ?? askRag)(legacyInput, {
    multiAgentMode: mapQualityMode(input.quality?.mode),
    visualizationMode: input.visualization?.mode ?? 'auto',
  });
  return toRagV1Response(result);
}

export async function askRagLegacyAdapter(input: RagAskInput, options: RagAskServiceOptions = {}): Promise<RagAskResult> {
  const v1 = await askRagV1(
    {
      question: input.question,
      subjectId: input.subject,
      taskType: input.task_type,
      retrieval: { useWebSearch: input.use_web_search },
    },
    options,
  );
  return toLegacyRagResult(v1);
}

function mapQualityMode(mode: RagV1QualityMode | undefined): RagMultiAgentMode | undefined {
  if (mode === 'fast') return 'off';
  if (mode === 'review') return 'review';
  if (mode === 'highQuality') return 'high_quality';
  return undefined;
}
