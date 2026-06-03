'use client';

import React from 'react';
import '@/lib/i18n'; // Initialize i18n

export default function I18nProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
