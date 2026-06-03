'use client';

import SubjectRagConsole from './SubjectRagConsole';
import type { RagMode } from '@/lib/rag/modeConfigs';

export default function RagWorkbench({ mode = 'student' }: { mode?: RagMode }) {
  return <SubjectRagConsole mode={mode} />;
}
