'use client';

import { Clock3 } from 'lucide-react';
import type { InteractionSession } from '@/features/deep-interaction/lib/types';
import { interactionTypeMeta } from '@/features/deep-interaction/lib/rendererRegistry';
import { useInteractionSessionStore } from '@/lib/stores/interactionSessionStore';

export default function SessionList({
  sessions,
  currentSessionId,
}: {
  sessions: InteractionSession[];
  currentSessionId: string | null;
}) {
  const setCurrentSession = useInteractionSessionStore((state) => state.setCurrentSession);

  return (
    <div>
      <div className="mb-2 text-xs font-black uppercase tracking-wider text-slate-400">学习会话</div>
      <div className="space-y-2">
        {sessions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-400">
            还没有会话。
          </p>
        ) : (
          sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              aria-current={currentSessionId === session.id ? 'true' : undefined}
              onClick={() => setCurrentSession(session.id)}
              className={`w-full rounded-lg border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                currentSessionId === session.id
                  ? 'border-blue-300 bg-blue-50'
                  : session.status === 'failed'
                    ? 'border-red-200 bg-red-50/50 hover:bg-red-50'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className="line-clamp-1 text-sm font-bold">{session.title}</div>
              <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                <span>{interactionTypeMeta[session.interactionType]?.label ?? '未知类型'}</span>
                <span className="flex items-center gap-1">
                  <Clock3 size={12} />
                  {session.progress}%
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
