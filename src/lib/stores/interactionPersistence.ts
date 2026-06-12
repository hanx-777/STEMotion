import type {
  InteractionArtifact,
  InteractionSession,
  InteractionSubject,
} from '@/features/deep-interaction/lib/types';

export const INTERACTION_SESSIONS_STORAGE_KEY = 'stemotion-interaction-sessions';
export const INTERACTION_ARTIFACTS_STORAGE_KEY = 'stemotion-interaction-artifacts';

export const MAX_INTERACTION_SESSIONS = 40;
export const MAX_ARTIFACTS_PER_SESSION = 8;
export const MAX_TOTAL_ARTIFACTS = 120;

export interface InteractionPersistenceRepairInput {
  sessions: InteractionSession[];
  currentSessionId: string | null;
  artifactsBySession: Record<string, InteractionArtifact[]>;
}

export interface InteractionPersistenceRepairOutput {
  sessions: InteractionSession[];
  currentSessionId: string | null;
  artifactsBySession: Record<string, InteractionArtifact[]>;
}

export type PersistWithRetryResult = 'saved' | 'saved_after_retry' | 'failed';

export function repairInteractionPersistence(
  input: InteractionPersistenceRepairInput,
): InteractionPersistenceRepairOutput {
  const normalizedArtifactMap = trimArtifactsByCapacity(input.artifactsBySession);
  const sessionMap = new Map<string, InteractionSession>();

  for (const session of input.sessions) {
    if (!session?.id) continue;
    sessionMap.set(session.id, session);
  }

  for (const [sessionId, artifacts] of Object.entries(normalizedArtifactMap)) {
    if (!sessionMap.has(sessionId)) {
      const seeded = createSessionFromArtifact(artifacts[0]);
      sessionMap.set(seeded.id, seeded);
    }
  }

  const normalizedSessions = normalizeSessions(
    Array.from(sessionMap.values()).map((session) => {
      const linkedArtifacts = normalizedArtifactMap[session.id] ?? normalizeArtifactList(session.artifacts);
      const latestArtifact = linkedArtifacts[0];

      return {
        ...session,
        artifacts: linkedArtifacts,
        currentArtifactId: linkedArtifacts.some((artifact) => artifact.id === session.currentArtifactId)
          ? session.currentArtifactId
          : latestArtifact?.id,
        createdAt: session.createdAt || latestArtifact?.createdAt || session.updatedAt || new Date().toISOString(),
        updatedAt: session.updatedAt || latestArtifact?.updatedAt || session.createdAt || new Date().toISOString(),
      };
    }),
  );

  const keptSessionIds = new Set(normalizedSessions.map((session) => session.id));
  const nextArtifactMap: Record<string, InteractionArtifact[]> = {};

  for (const [sessionId, artifacts] of Object.entries(normalizedArtifactMap)) {
    if (keptSessionIds.has(sessionId)) {
      nextArtifactMap[sessionId] = artifacts;
    }
  }

  const currentSessionId = keptSessionIds.has(input.currentSessionId ?? '')
    ? input.currentSessionId
    : normalizedSessions[0]?.id ?? null;

  return {
    sessions: normalizedSessions,
    currentSessionId,
    artifactsBySession: nextArtifactMap,
  };
}

export function trimArtifactsByCapacity(
  artifactsBySession: Record<string, InteractionArtifact[]>,
): Record<string, InteractionArtifact[]> {
  const normalized: Array<{ sessionId: string; artifact: InteractionArtifact }> = [];

  for (const [sessionId, artifacts] of Object.entries(artifactsBySession)) {
    const trimmed = normalizeArtifactList(artifacts);
    for (const artifact of trimmed) {
      normalized.push({ sessionId, artifact });
    }
  }

  const kept = normalized
    .sort((a, b) => toTimestamp(b.artifact.updatedAt) - toTimestamp(a.artifact.updatedAt))
    .slice(0, MAX_TOTAL_ARTIFACTS);

  const map: Record<string, InteractionArtifact[]> = {};
  for (const item of kept) {
    const sessionId = item.artifact.sessionId || item.sessionId;
    if (!map[sessionId]) map[sessionId] = [];
    map[sessionId].push(item.artifact);
  }

  for (const key of Object.keys(map)) {
    map[key] = map[key]
      .sort((a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt))
      .slice(0, MAX_ARTIFACTS_PER_SESSION);
  }

  return map;
}

export function normalizeSessions(sessions: InteractionSession[]): InteractionSession[] {
  return sessions
    .filter((session) => Boolean(session?.id))
    .sort((a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt))
    .slice(0, MAX_INTERACTION_SESSIONS);
}

export function createSessionFromArtifact(artifact: InteractionArtifact): InteractionSession {
  const ragMetadata = artifact.schema.type === 'rag_visualization' ? artifact.schema.ragMetadata : undefined;
  const now = artifact.updatedAt || artifact.createdAt || new Date().toISOString();
  const topic = ragMetadata?.originalQuestion || artifact.title;
  const userContent = ragMetadata?.originalQuestion || topic;

  return {
    id: artifact.sessionId,
    title: artifact.title,
    topic,
    subject: mapInteractionSubject(ragMetadata?.subject),
    gradeLevel: 'high_school',
    mode: 'deep_interaction',
    interactionType: artifact.type,
    status: 'ready',
    progress: 100,
    messages: [
      {
        id: `${artifact.id}_source`,
        role: 'user',
        content: userContent,
        createdAt: artifact.createdAt || now,
      },
      {
        id: `${artifact.id}_restored`,
        role: 'assistant',
        content: `已恢复交互：${artifact.title}。`,
        createdAt: now,
        relatedArtifactId: artifact.id,
      },
    ],
    artifacts: [artifact],
    currentArtifactId: artifact.id,
    createdAt: artifact.createdAt || now,
    updatedAt: now,
  };
}

export function hasPersistedSessionArtifact(sessionId: string, artifactId: string): boolean {
  const sessionsState = readPersistedState<{ sessions?: InteractionSession[] }>(INTERACTION_SESSIONS_STORAGE_KEY);
  const artifactsState = readPersistedState<{ artifactsBySession?: Record<string, InteractionArtifact[]> }>(
    INTERACTION_ARTIFACTS_STORAGE_KEY,
  );

  if (!sessionsState?.sessions || !artifactsState?.artifactsBySession) return false;
  const hasSession = sessionsState.sessions.some((session) => session.id === sessionId);
  const artifacts = artifactsState.artifactsBySession[sessionId] ?? [];
  const hasArtifact = artifacts.some((artifact) => artifact.id === artifactId);
  return hasSession && hasArtifact;
}

export function persistWithSingleRetry(params: {
  commit: () => void;
  verify: () => boolean;
  repairAndRetry: () => void;
}): PersistWithRetryResult {
  let retried = false;

  try {
    params.commit();
  } catch {
    retried = true;
  }

  if (safeVerify(params.verify)) {
    return retried ? 'saved_after_retry' : 'saved';
  }

  retried = true;
  try {
    params.repairAndRetry();
  } catch {
    return 'failed';
  }

  return safeVerify(params.verify) ? 'saved_after_retry' : 'failed';
}

export function mapInteractionSubject(subject: string | undefined): InteractionSubject {
  const normalized = (subject || '').toLowerCase();
  if (normalized.includes('math')) return 'math';
  if (normalized.includes('physics')) return 'physics';
  if (normalized.includes('chemistry')) return 'chemistry';
  if (normalized.includes('biology')) return 'biology';
  return 'general';
}

function normalizeArtifactList(artifacts: InteractionArtifact[]): InteractionArtifact[] {
  const deduped = new Map<string, InteractionArtifact>();

  for (const artifact of artifacts ?? []) {
    if (!artifact?.id) continue;
    const current = deduped.get(artifact.id);
    if (!current || toTimestamp(artifact.updatedAt) > toTimestamp(current.updatedAt)) {
      deduped.set(artifact.id, artifact);
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt))
    .slice(0, MAX_ARTIFACTS_PER_SESSION);
}

function toTimestamp(value: string | undefined): number {
  const parsed = Date.parse(value ?? '');
  return Number.isNaN(parsed) ? 0 : parsed;
}

function readPersistedState<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: T } | T;
    if (parsed && typeof parsed === 'object' && 'state' in parsed) {
      return (parsed as { state?: T }).state ?? null;
    }
    return parsed as T;
  } catch {
    return null;
  }
}

function safeVerify(verify: () => boolean): boolean {
  try {
    return verify();
  } catch {
    return false;
  }
}
