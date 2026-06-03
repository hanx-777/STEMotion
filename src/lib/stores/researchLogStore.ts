import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ResearchEvent, ResearchExportBundle } from '@/lib/deep-interaction/types';
import { makeId } from '@/lib/utils/makeId';

interface ResearchLogState {
  studyModeEnabled: boolean;
  events: ResearchEvent[];
  setStudyModeEnabled: (enabled: boolean) => void;
  logEvent: (event: Omit<ResearchEvent, 'id' | 'timestamp'> & { id?: string; timestamp?: string }) => void;
  clearEvents: () => void;
  exportJson: (sessions?: unknown[], artifacts?: unknown[]) => string;
  exportCsv: () => string;
}

export const useResearchLogStore = create<ResearchLogState>()(
  persist(
    (set, get) => ({
      studyModeEnabled: false,
      events: [],
      setStudyModeEnabled: (studyModeEnabled) => set({ studyModeEnabled }),
      logEvent: (event) =>
        set((state) => {
          if (!state.studyModeEnabled) return state;
          return {
            events: [
              ...state.events,
              {
                ...event,
                id: event.id ?? makeId('research'),
                timestamp: event.timestamp ?? new Date().toISOString(),
                payload: sanitizePayload(event.payload),
              },
            ],
          };
        }),
      clearEvents: () => set({ events: [] }),
      exportJson: (sessions = [], artifacts = []) => {
        const bundle: ResearchExportBundle = {
          exportedAt: new Date().toISOString(),
          appVersion: '0.1.0',
          sessions,
          artifacts,
          events: get().events,
        };
        return JSON.stringify(bundle, null, 2);
      },
      exportCsv: () => {
        const rows = [
          ['timestamp', 'type', 'sessionId', 'artifactId', 'payload'].join(','),
          ...get().events.map((event) => [
            csv(event.timestamp),
            csv(event.type),
            csv(event.sessionId ?? ''),
            csv(event.artifactId ?? ''),
            csv(JSON.stringify(event.payload ?? {})),
          ].join(',')),
        ];
        return rows.join('\n');
      },
    }),
    {
      name: 'stemotion-research-log',
      version: 1,
      skipHydration: true,
    },
  ),
);

function sanitizePayload(payload: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!payload) return undefined;
  const blocked = new Set(['prompt', 'fullPrompt', 'html', 'guidedPlan', 'plan', 'apiKey', 'modelProfiles', 'model-profiles.json']);
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !blocked.has(key)));
}

function csv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
