'use client';

import AppShell from '@/components/layout/AppShell';
import SettingsWorkbench from '@/features/settings/ui/SettingsWorkbench';

export default function SettingsPage() {
  return (
    <AppShell>
      <SettingsWorkbench />
    </AppShell>
  );
}
