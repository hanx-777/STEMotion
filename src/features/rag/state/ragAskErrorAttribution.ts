export interface AskErrorAttribution {
  /**
   * Target stage to mark as `error`; null means "fail whichever stage
   * is currently `running`" (legacy behaviour preserved for non-truncation errors).
   */
  stageId: 'visualization' | null;
  /** User-facing Chinese message shown in the progress bar detail. */
  userMessage: string;
}

/**
 * Classify an error thrown during SubjectRagConsole.ask() so the progress
 * UI marks the *right* stage as failed instead of blindly blaming
 * whichever stage happens to be `running` at the time.
 */
export function attributeAskError(err: unknown): AskErrorAttribution {
  if (isLlmTruncationLikeError(err)) {
    return {
      stageId: 'visualization',
      userMessage: `互动可视化生成超出模型输出上限（已生成 ${err.outputTokens} tokens，上限 ${err.maxTokens}）。检索和回答已完成，但 HTML 生成被截断。`,
    };
  }

  if (err instanceof Error) {
    return { stageId: null, userMessage: err.message };
  }

  return { stageId: null, userMessage: '问答请求失败' };
}

function isLlmTruncationLikeError(err: unknown): err is Error & {
  outputTokens: number;
  maxTokens: number;
} {
  if (!(err instanceof Error)) return false;
  if (err.name !== 'LlmTruncationError') return false;

  const candidate = err as Error & { outputTokens?: unknown; maxTokens?: unknown };
  return typeof candidate.outputTokens === 'number' && typeof candidate.maxTokens === 'number';
}
