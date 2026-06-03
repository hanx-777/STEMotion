'use client';

import AppShell from '@/components/layout/AppShell';
import RagWorkbench from '@/features/rag/ui/RagWorkbench';

export default function StudentPage() {
  return (
    <AppShell>
      <RagWorkbench mode="student" />
    </AppShell>
  );
}
