'use client';

import { useEffect, useRef } from 'react';
import AppShell from '@/components/layout/AppShell';
import ExperimentStage from '@/components/experiment/ExperimentStage';
import AssistantPanel from '@/components/experiment/AssistantPanel';
import PlaybackControls from '@/components/experiment/PlaybackControls';
import { useUIStore } from '@/lib/stores/uiStore';
import { useExperimentStore } from '@/lib/stores/experimentStore';
import { useAssistantStore } from '@/lib/stores/assistantStore';
import { generateParallelCircuitMock } from '@/lib/generation/mockExperimentGenerator';
import { motion, AnimatePresence } from 'framer-motion';

export default function Home() {
  const rightPanelOpen = useUIStore(state => state.rightPanelOpen);
  const loadExperiment = useExperimentStore((state) => state.loadExperiment);
  const setGeneratedSummary = useAssistantStore((state) => state.setGeneratedSummary);
  const loadedTemplateRef = useRef(false);

  useEffect(() => {
    if (loadedTemplateRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('template') === 'parallel_circuit') {
      const config = generateParallelCircuitMock();
      loadExperiment(config);
      setGeneratedSummary(`${config.title}: ${config.description}`);
      loadedTemplateRef.current = true;
    }
  }, [loadExperiment, setGeneratedSummary]);

  return (
    <AppShell>
      <div className="flex h-full w-full overflow-hidden">
        {/* Stage Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-50 relative">
          <div className="flex-1 min-h-0 relative custom-scrollbar overflow-y-auto">
            <ExperimentStage />
          </div>
          
          {/* Bottom controls fixed at the bottom of the stage */}
          <div className="shrink-0 z-20">
            <PlaybackControls />
          </div>
        </div>

        {/* AI Assistant Panel */}
        <AnimatePresence mode="popLayout">
          {rightPanelOpen && (
            <motion.aside 
              initial={{ x: 320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 320, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-80 lg:w-96 shrink-0 h-full relative z-30"
            >
              <AssistantPanel />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}
