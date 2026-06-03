'use client';

import { Download, Trash2 } from 'lucide-react';
import { useMemo, useSyncExternalStore } from 'react';
import { useArtifactStore } from '@/lib/stores/artifactStore';
import { useInteractionSessionStore } from '@/lib/stores/interactionSessionStore';
import { useResearchLogStore } from '@/lib/stores/researchLogStore';

const subscribeToHydration = () => () => {};
const getHydratedSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

export default function StudyModePanel() {
  const { studyModeEnabled, events, setStudyModeEnabled, clearEvents, exportJson, exportCsv } = useResearchLogStore();
  const sessions = useInteractionSessionStore((state) => state.sessions);
  const artifactsBySession = useArtifactStore((state) => state.artifactsBySession);
  const artifacts = useMemo(() => Object.values(artifactsBySession).flat(), [artifactsBySession]);
  const hasMounted = useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerHydrationSnapshot,
  );
  const visibleStudyModeEnabled = hasMounted ? studyModeEnabled : false;
  const visibleEvents = hasMounted ? events : [];

  const download = (filename: string, content: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-2 text-xs font-black uppercase tracking-wider text-slate-400">Study</div>
      <p className="text-xs leading-relaxed text-slate-600">
        研究模式只在本地记录交互事件，用于后续研究分析，不会自动上传数据。
      </p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        Study Mode only records local interaction events for research analysis. No data is uploaded automatically.
      </p>
      <label className="mt-3 flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
        Study Mode
        <input
          type="checkbox"
          checked={visibleStudyModeEnabled}
          onChange={(event) => setStudyModeEnabled(event.target.checked)}
          className="h-4 w-4 accent-blue-600"
        />
      </label>
      <div className="mt-3 text-xs text-slate-500">当前事件：{visibleEvents.length}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => download('stemotion-research-log.json', exportJson(sessions, artifacts), 'application/json')}
          className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-2 text-xs font-bold text-white"
        >
          <Download size={13} /> JSON
        </button>
        <button
          type="button"
          onClick={() => download('stemotion-research-log.csv', exportCsv(), 'text/csv')}
          className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700"
        >
          <Download size={13} /> CSV
        </button>
        <button
          type="button"
          onClick={clearEvents}
          className="inline-flex items-center gap-1 rounded-md bg-red-50 px-3 py-2 text-xs font-bold text-red-700"
        >
          <Trash2 size={13} /> 清空
        </button>
      </div>
    </section>
  );
}
