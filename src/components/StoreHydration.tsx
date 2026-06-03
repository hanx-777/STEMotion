'use client';

import { useEffect } from 'react';
import { useInteractionSessionStore } from '@/lib/stores/interactionSessionStore';
import { useArtifactStore } from '@/lib/stores/artifactStore';
import { useResearchLogStore } from '@/lib/stores/researchLogStore';
import { useRagSessionStore } from '@/features/rag/state/ragSessionStore';
import { repairInteractionPersistence } from '@/lib/stores/interactionPersistence';

export default function StoreHydration() {
  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      await Promise.all([
        useInteractionSessionStore.persist.rehydrate(),
        useArtifactStore.persist.rehydrate(),
        useResearchLogStore.persist.rehydrate(),
        useRagSessionStore.persist.rehydrate(),
      ]);

      if (cancelled) return;

      const interactionState = useInteractionSessionStore.getState();
      const artifactState = useArtifactStore.getState();
      const repaired = repairInteractionPersistence({
        sessions: interactionState.sessions,
        currentSessionId: interactionState.currentSessionId,
        artifactsBySession: artifactState.artifactsBySession,
      });

      useArtifactStore.setState({ artifactsBySession: repaired.artifactsBySession });
      useInteractionSessionStore.setState({
        sessions: repaired.sessions,
        currentSessionId: repaired.currentSessionId,
      });
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
