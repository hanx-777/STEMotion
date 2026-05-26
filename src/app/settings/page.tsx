'use client';

import AppShell from '@/components/layout/AppShell';
import ModelSettingsConsole from '@/components/settings/ModelSettingsConsole';

export default function SettingsPage() {
  return (
    <AppShell>
      <ModelSettingsConsole />
    </AppShell>
  );
}
