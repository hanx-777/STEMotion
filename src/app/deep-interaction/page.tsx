'use client';

import AppShell from '@/components/layout/AppShell';
import DeepInteractionWorkbench from '@/features/deep-interaction/ui/DeepInteractionWorkbench';

export default function DeepInteractionPage() {
  return (
    <AppShell>
      <DeepInteractionWorkbench />
    </AppShell>
  );
}
