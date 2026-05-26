import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  InteractionArtifact,
  InteractionSession,
  InteractionSessionStatus,
  SessionMessage,
} from '@/lib/deep-interaction/types';
import { makeId } from '@/lib/utils/makeId';

interface InteractionSessionState {
  sessions: InteractionSession[];
  currentSessionId: string | null;
  createSession: (session: InteractionSession) => void;
  upsertSession: (session: InteractionSession) => void;
  setCurrentSession: (sessionId: string | null) => void;
  updateSessionStatus: (sessionId: string, status: InteractionSessionStatus) => void;
  updateSessionProgress: (sessionId: string, progress: number) => void;
  appendMessage: (sessionId: string, message: Omit<SessionMessage, 'id' | 'createdAt'>) => void;
  addArtifact: (sessionId: string, artifact: InteractionArtifact) => void;
  updateArtifact: (sessionId: string, artifact: InteractionArtifact) => void;
  setCurrentArtifact: (sessionId: string, artifactId: string) => void;
  createArtifactVersion: (sessionId: string, artifact: InteractionArtifact) => void;
  deleteArtifactFromSession: (sessionId: string, artifactId: string) => void;
  deleteSession: (sessionId: string) => void;
  resetSession: (sessionId: string) => void;
  failSession: (sessionId: string, message: string) => void;
  retryGeneration: (sessionId: string) => void;
  continueWithFollowUpPrompt: (sessionId: string, prompt: string) => void;
  getCurrentSession: () => InteractionSession | null;
}

export const useInteractionSessionStore = create<InteractionSessionState>()(
  persist(
    (set, get) => ({
      sessions: [],
      currentSessionId: null,

  createSession: (session) =>
    set((state) => ({
      sessions: [session, ...state.sessions.filter((item) => item.id !== session.id)],
      currentSessionId: session.id,
    })),

  upsertSession: (session) =>
    set((state) => {
      const exists = state.sessions.some((item) => item.id === session.id);
      return {
        sessions: exists
          ? state.sessions.map((item) => (item.id === session.id ? { ...item, ...session } : item))
          : [session, ...state.sessions],
        currentSessionId: session.id,
      };
    }),

  setCurrentSession: (sessionId) => set({ currentSessionId: sessionId }),

  updateSessionStatus: (sessionId, status) =>
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === sessionId ? { ...session, status, updatedAt: new Date().toISOString() } : session,
      ),
    })),

  updateSessionProgress: (sessionId, progress) =>
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === sessionId
          ? { ...session, progress: Math.max(0, Math.min(100, progress)), updatedAt: new Date().toISOString() }
          : session,
      ),
    })),

  appendMessage: (sessionId, message) =>
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              messages: [
                ...session.messages,
                {
                  ...message,
                  id: makeId('message'),
                  createdAt: new Date().toISOString(),
                },
              ],
              updatedAt: new Date().toISOString(),
            }
          : session,
      ),
    })),

  addArtifact: (sessionId, artifact) =>
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              artifacts: [...session.artifacts.filter((item) => item.id !== artifact.id), artifact],
              currentArtifactId: artifact.id,
              status: 'ready',
              progress: 100,
              updatedAt: new Date().toISOString(),
            }
          : session,
      ),
    })),

  updateArtifact: (sessionId, artifact) =>
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              artifacts: session.artifacts.map((item) => (item.id === artifact.id ? artifact : item)),
              updatedAt: new Date().toISOString(),
            }
          : session,
      ),
    })),

  setCurrentArtifact: (sessionId, artifactId) =>
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === sessionId
          ? { ...session, currentArtifactId: artifactId, updatedAt: new Date().toISOString() }
          : session,
      ),
    })),

  createArtifactVersion: (sessionId, artifact) => get().addArtifact(sessionId, artifact),

  deleteArtifactFromSession: (sessionId, artifactId) =>
    set((state) => ({
      sessions: state.sessions.map((session) => {
        if (session.id !== sessionId) return session;
        const artifacts = session.artifacts.filter((artifact) => artifact.id !== artifactId);
        const currentArtifactId =
          session.currentArtifactId === artifactId ? artifacts.at(-1)?.id : session.currentArtifactId;
        return {
          ...session,
          artifacts,
          currentArtifactId,
          updatedAt: new Date().toISOString(),
        };
      }),
    })),

  deleteSession: (sessionId) =>
    set((state) => {
      const sessions = state.sessions.filter((session) => session.id !== sessionId);
      return {
        sessions,
        currentSessionId: state.currentSessionId === sessionId ? sessions[0]?.id ?? null : state.currentSessionId,
      };
    }),

  resetSession: (sessionId) =>
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === sessionId
          ? { ...session, status: 'idle', progress: 0, currentArtifactId: undefined, updatedAt: new Date().toISOString() }
          : session,
      ),
    })),

  failSession: (sessionId, message) =>
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              status: 'failed',
              progress: 100,
              messages: [
                ...session.messages,
                {
                  id: makeId('message'),
                  role: 'assistant',
                  content: message,
                  createdAt: new Date().toISOString(),
                },
              ],
              updatedAt: new Date().toISOString(),
            }
          : session,
      ),
    })),

  retryGeneration: (sessionId) => get().updateSessionStatus(sessionId, 'planning'),

  continueWithFollowUpPrompt: (sessionId, prompt) =>
    get().appendMessage(sessionId, { role: 'user', content: prompt }),

  getCurrentSession: () => {
    const { sessions, currentSessionId } = get();
    return sessions.find((session) => session.id === currentSessionId) ?? null;
  },
    }),
    {
      name: 'stemotion-interaction-sessions',
      version: 1,
      skipHydration: true,
    },
  ),
);

