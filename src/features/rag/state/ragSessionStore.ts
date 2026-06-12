import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { makeId } from '@/lib/utils/makeId';
import type { RagAskResult, RagTaskType } from '@/features/rag/lib/types';
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

export type RagSessionSaveMode = 'auto' | 'update-current' | 'new-session';
export type RagSessionSaveIntent = 'update-current' | 'new-session' | 'needs-confirmation';

interface RagSessionState {
  sessions: RagSessionRecord[];
  currentSessionId: string | null;
  saveSession: (snapshot: RagSessionSnapshot, options?: { mode?: RagSessionSaveMode }) => string;
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

      saveSession: (snapshot, options) => {
        const state = get();
        const id = snapshot.id ?? resolveRagSaveSessionId({
          sessions: state.sessions,
          currentSessionId: state.currentSessionId,
          question: snapshot.question,
          subject: snapshot.subject,
          taskType: snapshot.taskType,
          mode: options?.mode ?? 'auto',
        }) ?? makeId('rag_session');
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

export function resolveRagAutoSaveSessionId({
  sessions,
  currentSessionId,
  question,
  subject,
  taskType,
}: {
  sessions: RagSessionRecord[];
  currentSessionId: string | null;
  question: string;
  subject: string;
  taskType: RagTaskType;
}): string | undefined {
  return resolveRagSaveSessionId({
    sessions,
    currentSessionId,
    question,
    subject,
    taskType,
    mode: 'auto',
  });
}

export function classifyRagSessionSaveIntent({
  sessions,
  currentSessionId,
  question,
  subject,
  taskType,
}: {
  sessions: RagSessionRecord[];
  currentSessionId: string | null;
  question: string;
  subject: string;
  taskType: RagTaskType;
}): RagSessionSaveIntent {
  if (!currentSessionId) return 'new-session';
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  if (!currentSession) return 'new-session';
  if (currentSession.subject !== subject) return 'new-session';
  if (currentSession.taskType !== taskType) return 'new-session';

  const previousQuestion = normalizeSessionQuestion(currentSession.question);
  const nextQuestion = normalizeSessionQuestion(question);
  if (previousQuestion === nextQuestion) return 'update-current';

  const similarity = calculateQuestionSimilarity(previousQuestion, nextQuestion);
  if (similarity >= 0.86) return 'update-current';
  if (similarity <= 0.45) return 'new-session';
  return 'needs-confirmation';
}

export function resolveRagSaveSessionId({
  sessions,
  currentSessionId,
  question,
  subject,
  taskType,
  mode,
}: {
  sessions: RagSessionRecord[];
  currentSessionId: string | null;
  question: string;
  subject: string;
  taskType: RagTaskType;
  mode: RagSessionSaveMode;
}): string | undefined {
  if (!currentSessionId) return undefined;
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  if (!currentSession) return undefined;
  if (mode === 'new-session') return undefined;
  if (mode === 'update-current') return currentSession.id;
  return classifyRagSessionSaveIntent({
    sessions,
    currentSessionId,
    question,
    subject,
    taskType,
  }) === 'update-current'
    ? currentSession.id
    : undefined;
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

function normalizeSessionQuestion(value: string): string {
  return value
    .toLowerCase()
    .replace(/[，。！？；：、,.!?;:()[\]{}'"“”‘’《》<>【】\-_/\\|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function calculateQuestionSimilarity(previousQuestion: string, nextQuestion: string): number {
  if (!previousQuestion || !nextQuestion) return 0;
  if (previousQuestion === nextQuestion) return 1;
  const previousTokens = tokenizeQuestion(previousQuestion);
  const nextTokens = tokenizeQuestion(nextQuestion);
  if (previousTokens.length === 0 || nextTokens.length === 0) return 0;

  const nextCounts = new Map<string, number>();
  for (const token of nextTokens) {
    nextCounts.set(token, (nextCounts.get(token) ?? 0) + 1);
  }

  let overlap = 0;
  for (const token of previousTokens) {
    const count = nextCounts.get(token) ?? 0;
    if (count > 0) {
      overlap += 1;
      if (count === 1) nextCounts.delete(token);
      else nextCounts.set(token, count - 1);
    }
  }

  return (2 * overlap) / (previousTokens.length + nextTokens.length);
}

function tokenizeQuestion(value: string): string[] {
  if (/[\u4e00-\u9fff]/.test(value)) {
    return Array.from(value.replace(/\s+/g, ''));
  }
  return value.split(/\s+/).filter(Boolean);
}
