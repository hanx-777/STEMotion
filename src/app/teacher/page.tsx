'use client';

import AppShell from '@/components/layout/AppShell';
import RagWorkbench from '@/features/rag/ui/RagWorkbench';

export default function TeacherPage() {
  return (
    <AppShell>
      <RagWorkbench mode="teacher" />
    </AppShell>
  );
}
