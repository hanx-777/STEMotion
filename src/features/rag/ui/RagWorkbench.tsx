'use client';

import SubjectRagConsole from './SubjectRagConsole';
import type { RagMode } from '@/features/rag/lib/modeConfigs';

export default function RagWorkbench({ mode = 'student', initialRunId }: { mode?: RagMode; initialRunId?: string }) {
  return <SubjectRagConsole mode={mode} initialRunId={initialRunId} />;
}
