import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { makeId } from '@/lib/utils/makeId';
import type { RagAskResult, RagTaskType } from '@/lib/rag/types';
import type { RagVisualizationMetadata } from './ragVisualizationFlow';

export const MAX_RAG_SESSIONS = 30;

export type RagSessionResult = Omit<RagAskResult, 'retrieved_chunks'> & {
  retrieved_chunks: Array<{
    content: string;
    score: number;
    metadata: object;
  }>;
  demo_fallback?: boolean;
} & RagVisualizationMetadata;

export interface RagSessionRecord {
  id: string;
  title: string;
  question: string;
  subject: string;
  taskType: RagTaskType;
  useWebSearch: boolean;
  result: RagSessionResult | null;
  demoFallback: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RagSessionSnapshot {
  id?: string;
  title?: string;
  question: string;
  subject: string;
  taskType: RagTaskType;
  useWebSearch: boolean;
  result: RagSessionResult | null;
  demoFallback?: boolean;
  now?: string;
}

interface RagSessionState {
  sessions: RagSessionRecord[];
  currentSessionId: string | null;
  saveSession: (snapshot: RagSessionSnapshot) => string;
  selectSession: (sessionId: string | null) => void;
  deleteSession: (sessionId: string) => void;
  clearSessions: () => void;
  renameSession: (sessionId: string, title: string) => void;
  getCurrentSession: () => RagSessionRecord | null;
}

export const useRagSessionStore = create<RagSessionState>()(
  persist(
    (set, get) => ({
      sessions: [],
      currentSessionId: null,

      saveSession: (snapshot) => {
        const id = snapshot.id ?? get().currentSessionId ?? makeId('rag_session');
        set((state) => ({
          sessions: upsertRagSessionRecord(state.sessions, { ...snapshot, id }),
          currentSessionId: id,
        }));
        return id;
      },

      selectSession: (sessionId) => set({ currentSessionId: sessionId }),

      deleteSession: (sessionId) =>
        set((state) => {
          const sessions = deleteRagSessionRecord(state.sessions, sessionId);
          return {
            sessions,
            currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId,
          };
        }),

      clearSessions: () => set({ sessions: clearRagSessionRecords(), currentSessionId: null }),

      renameSession: (sessionId, title) =>
        set((state) => ({
          sessions: renameRagSessionRecord(state.sessions, sessionId, title),
        })),

      getCurrentSession: () => {
        const { sessions, currentSessionId } = get();
        return sessions.find((session) => session.id === currentSessionId) ?? null;
      },
    }),
    {
      name: 'stemotion-rag-sessions',
      version: 1,
      skipHydration: true,
      partialize: (state) => ({
        sessions: state.sessions,
        currentSessionId: state.currentSessionId,
      }),
    },
  ),
);

export function upsertRagSessionRecord(
  sessions: RagSessionRecord[],
  snapshot: RagSessionSnapshot,
  limit = MAX_RAG_SESSIONS,
): RagSessionRecord[] {
  const now = snapshot.now ?? new Date().toISOString();
  const id = snapshot.id ?? makeId('rag_session');
  const existing = sessions.find((session) => session.id === id);
  const record: RagSessionRecord = {
    id,
    title: normalizeSessionTitle(snapshot.title ?? snapshot.question),
    question: snapshot.question,
    subject: snapshot.subject,
    taskType: snapshot.taskType,
    useWebSearch: snapshot.useWebSearch,
    result: snapshot.result,
    demoFallback: Boolean(snapshot.demoFallback ?? snapshot.result?.demo_fallback),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  return [record, ...sessions.filter((session) => session.id !== id)].slice(0, limit);
}

export function deleteRagSessionRecord(sessions: RagSessionRecord[], sessionId: string): RagSessionRecord[] {
  return sessions.filter((session) => session.id !== sessionId);
}

export function clearRagSessionRecords(): RagSessionRecord[] {
  return [];
}

export function renameRagSessionRecord(
  sessions: RagSessionRecord[],
  sessionId: string,
  title: string,
  now = new Date().toISOString(),
): RagSessionRecord[] {
  const normalized = normalizeSessionTitle(title);
  return sessions.map((session) => (
    session.id === sessionId
      ? { ...session, title: normalized, updatedAt: now }
      : session
  ));
}

export function normalizeSessionTitle(value: string): string {
  const title = value.replace(/\s+/g, ' ').trim();
  if (!title) return '未命名学科问答';
  return title.length > 28 ? `${title.slice(0, 28)}...` : title;
}
