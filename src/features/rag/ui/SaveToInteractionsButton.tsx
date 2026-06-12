'use client';

import { useState } from 'react';
import { BookmarkPlus, Check } from 'lucide-react';
import { useArtifactStore } from '@/lib/stores/artifactStore';
import { useInteractionSessionStore } from '@/lib/stores/interactionSessionStore';
import { createRagVisualizationArtifact } from '@/features/rag/lib/visualization/artifactAdapter';
import type { VisualizationSpec } from '@/features/rag/lib/visualization/types';
import type { RagQualityReport } from '@/features/rag/lib/types';
import type { InteractionArtifact } from '@/features/deep-interaction/lib/types';
import {
  createSessionFromArtifact,
  hasPersistedSessionArtifact,
  persistWithSingleRetry,
  repairInteractionPersistence,
} from '@/lib/stores/interactionPersistence';
import { useToast } from '@/lib/stores/toastStore';

interface SaveToInteractionsButtonProps {
  artifact?: InteractionArtifact;
  spec?: VisualizationSpec;
  source: 'student' | 'teacher';
  subject: string;
  originalQuestion: string;
  taskType: string;
  qualityReport?: RagQualityReport;
}

export function SaveToInteractionsButton({
  artifact,
  spec,
  source,
  subject,
  originalQuestion,
  taskType,
  qualityReport,
}: SaveToInteractionsButtonProps) {
  const [saved, setSaved] = useState(false);
  const toast = useToast();
  const addArtifact = useArtifactStore((state) => state.addArtifact);
  const upsertSession = useInteractionSessionStore((state) => state.upsertSession);

  const handleSave = () => {
    const artifactToSave = artifact ?? (spec
      ? createRagVisualizationArtifact({
          spec,
          source,
          subject,
          originalQuestion,
          taskType,
          qualityReport,
        })
      : null);

    if (!artifactToSave) {
      toast.error('保存失败：当前没有可保存的可视化 artifact。');
      return;
    }

    const session = createSessionFromArtifact(artifactToSave);
    const commit = () => {
      addArtifact(artifactToSave);
      upsertSession(session);
    };

    const result = persistWithSingleRetry({
      commit,
      verify: () => hasPersistedSessionArtifact(artifactToSave.sessionId, artifactToSave.id),
      repairAndRetry: () => {
        const repaired = repairInteractionPersistence({
          sessions: useInteractionSessionStore.getState().sessions,
          currentSessionId: useInteractionSessionStore.getState().currentSessionId,
          artifactsBySession: useArtifactStore.getState().artifactsBySession,
        });

        useArtifactStore.setState({ artifactsBySession: repaired.artifactsBySession });
        useInteractionSessionStore.setState({
          sessions: repaired.sessions,
          currentSessionId: repaired.currentSessionId,
        });
        commit();
      },
    });

    if (result === 'failed') {
      toast.error('保存失败：本地存储空间不足，本次可能仅内存可见，刷新后可能丢失。', 4500);
      return;
    }

    if (result === 'saved_after_retry') {
      toast.warning('本地存储空间不足，已自动清理部分旧会话并完成保存。', 3500);
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleSave}
      disabled={saved}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
        saved
          ? 'bg-green-100 text-green-700'
          : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
      }`}
      title={saved ? '已保存到交互库' : '保存到交互库'}
    >
      {saved ? (
        <>
          <Check size={16} />
          <span>已保存</span>
        </>
      ) : (
        <>
          <BookmarkPlus size={16} />
          <span>保存到交互库</span>
        </>
      )}
    </button>
  );
}
