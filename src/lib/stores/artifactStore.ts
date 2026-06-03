import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { InteractionArtifact } from '@/lib/deep-interaction/types';
import { trimArtifactsByCapacity } from './interactionPersistence';

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
          const artifactsBySession = trimArtifactsByCapacity({
            ...state.artifactsBySession,
            [artifact.sessionId]: [...current.filter((item) => item.id !== artifact.id), artifact],
          });
          return {
            artifactsBySession,
          };
        }),

      updateArtifact: (artifact) =>
        set((state) => {
          const current = state.artifactsBySession[artifact.sessionId] ?? [];
          const artifactsBySession = trimArtifactsByCapacity({
            ...state.artifactsBySession,
            [artifact.sessionId]: current.map((item) => (item.id === artifact.id ? artifact : item)),
          });
          return {
            artifactsBySession,
          };
        }),

      deleteArtifact: (sessionId, artifactId) =>
        set((state) => {
          const current = state.artifactsBySession[sessionId] ?? [];
          const nextItems = current.filter((item) => item.id !== artifactId);
          const next = { ...state.artifactsBySession };
          if (nextItems.length) next[sessionId] = nextItems;
          else delete next[sessionId];
          return { artifactsBySession: trimArtifactsByCapacity(next) };
        }),

      deleteArtifactsForSession: (sessionId) =>
        set((state) => {
          const next = { ...state.artifactsBySession };
          delete next[sessionId];
          return { artifactsBySession: trimArtifactsByCapacity(next) };
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
      version: 2,
      skipHydration: true,
      migrate: (persistedState) => {
        const state = persistedState as Partial<ArtifactState> | undefined;
        return {
          artifactsBySession: trimArtifactsByCapacity(state?.artifactsBySession ?? {}),
        };
      },
      partialize: (state) => ({
        artifactsBySession: trimArtifactsByCapacity(state.artifactsBySession),
      }),
    },
  ),
);
