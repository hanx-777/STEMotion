'use client';

import AppShell from '@/components/layout/AppShell';
import SubjectRagConsole from '@/components/rag/SubjectRagConsole';

export default function RagPage() {
  return (
    <AppShell>
      <SubjectRagConsole />
    </AppShell>
  );
}
