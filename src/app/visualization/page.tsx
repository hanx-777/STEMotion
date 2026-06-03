'use client';

import AppShell from '@/components/layout/AppShell';
import DeepInteractionWorkbench from '@/features/deep-interaction/ui/DeepInteractionWorkbench';

export default function VisualizationPage() {
  return (
    <AppShell>
      <DeepInteractionWorkbench />
    </AppShell>
  );
}
