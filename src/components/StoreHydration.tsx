'use client';

import { useEffect } from 'react';
import { useInteractionSessionStore } from '@/lib/stores/interactionSessionStore';
import { useArtifactStore } from '@/lib/stores/artifactStore';
import { useResearchLogStore } from '@/lib/stores/researchLogStore';

export default function StoreHydration() {
  useEffect(() => {
    useInteractionSessionStore.persist.rehydrate();
    useArtifactStore.persist.rehydrate();
    useResearchLogStore.persist.rehydrate();
  }, []);

  return null;
}
