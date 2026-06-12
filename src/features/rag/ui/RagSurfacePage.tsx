'use client';

import AppShell from '@/components/layout/AppShell';
import type { RagMode } from '@/features/rag/lib/modeConfigs';
import RagWorkbench from './RagWorkbench';

export default function RagSurfacePage({ mode, initialRunId }: { mode: RagMode; initialRunId?: string }) {
  return (
    <AppShell>
      <RagWorkbench mode={mode} initialRunId={initialRunId} />
    </AppShell>
  );
}
