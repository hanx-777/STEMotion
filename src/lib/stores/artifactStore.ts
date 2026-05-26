import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { InteractionArtifact } from '@/lib/deep-interaction/types';

interface ArtifactState {
  artifactsBySession: Record<string, InteractionArtifact[]>;
  addArtifact: (artifact: InteractionArtifact) => void;
  updateArtifact: (artifact: InteractionArtifact) => void;
  deleteArtifact: (sessionId: string, artifactId: string) => void;
  deleteArtifactsForSession: (sessionId: string) => void;
  getAllArtifacts: () => InteractionArtifact[];
  getArtifactsForSession: (sessionId: string) => InteractionArtifact[];
  getArtifact: (sessionId: string, artifactId?: string) => InteractionArtifact | null;
  clearSessionArtifacts: (sessionId: string) => void;
}

export const useArtifactStore = create<ArtifactState>()(
  persist(
    (set, get) => ({
      artifactsBySession: {},

      addArtifact: (artifact) =>
        set((state) => {
          const current = state.artifactsBySession[artifact.sessionId] ?? [];
          return {
            artifactsBySession: {
              ...state.artifactsBySession,
              [artifact.sessionId]: [...current.filter((item) => item.id !== artifact.id), artifact],
            },
          };
        }),

      updateArtifact: (artifact) =>
        set((state) => {
          const current = state.artifactsBySession[artifact.sessionId] ?? [];
          return {
            artifactsBySession: {
              ...state.artifactsBySession,
              [artifact.sessionId]: current.map((item) => (item.id === artifact.id ? artifact : item)),
            },
          };
        }),

      deleteArtifact: (sessionId, artifactId) =>
        set((state) => {
          const current = state.artifactsBySession[sessionId] ?? [];
          const nextItems = current.filter((item) => item.id !== artifactId);
          const next = { ...state.artifactsBySession };
          if (nextItems.length) next[sessionId] = nextItems;
          else delete next[sessionId];
          return { artifactsBySession: next };
        }),

      deleteArtifactsForSession: (sessionId) =>
        set((state) => {
          const next = { ...state.artifactsBySession };
          delete next[sessionId];
          return { artifactsBySession: next };
        }),

      getAllArtifacts: () =>
        Object.values(get().artifactsBySession)
          .flat()
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),

      getArtifactsForSession: (sessionId) => get().artifactsBySession[sessionId] ?? [],

      getArtifact: (sessionId, artifactId) => {
        const artifacts = get().artifactsBySession[sessionId] ?? [];
        if (!artifactId) return artifacts.at(-1) ?? null;
        return artifacts.find((artifact) => artifact.id === artifactId) ?? null;
      },

      clearSessionArtifacts: (sessionId) => get().deleteArtifactsForSession(sessionId),
    }),
    {
      name: 'stemotion-interaction-artifacts',
      version: 1,
      skipHydration: true,
    },
  ),
);
