import { toLegacyRagResult, type RagV1AskRequest } from '@/features/rag/contracts';
import type { RagAskResult } from '@/lib/rag/types';

export async function askRagFromBrowser(input: RagV1AskRequest): Promise<RagAskResult> {
  const response = await fetch('/api/v1/rag/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? '问答请求失败');
  return toLegacyRagResult(data);
}
