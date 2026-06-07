'use client';

import AppShell from '@/components/layout/AppShell';
import type { RagMode } from '@/lib/rag/modeConfigs';
import RagWorkbench from './RagWorkbench';

export default function RagSurfacePage({ mode }: { mode: RagMode }) {
  return (
    <AppShell>
      <RagWorkbench mode={mode} />
    </AppShell>
  );
}
