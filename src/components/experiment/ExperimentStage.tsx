'use client';

import { FlaskConical, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import ExperimentCanvas from './ExperimentCanvas';
import MetricsPanel from './MetricsPanel';
import { generateInclinedPlaneMock } from '@/lib/generation/mockExperimentGenerator';
import { useAssistantStore } from '@/lib/stores/assistantStore';
import { useExperimentStore } from '@/lib/stores/experimentStore';

export default function ExperimentStage() {
  const config = useExperimentStore((state) => state.config);
  const loadExperiment = useExperimentStore((state) => state.loadExperiment);
  const setGeneratedSummary = useAssistantStore((state) => state.setGeneratedSummary);

  const loadSample = () => {
    const sample = generateInclinedPlaneMock('生成一个不同质量小车在斜面下滑的实验');
    loadExperiment(sample);
    setGeneratedSummary(`${sample.title}: ${sample.description}`);
  };

  if (!config) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-slate-50 px-6 text-center">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-lg border border-slate-200 bg-white text-blue-600 shadow-sm">
            <FlaskConical size={34} />
          </div>
          <h1 className="mb-3 text-3xl font-black tracking-tight text-slate-900">STEMotion Laboratory</h1>
          <p className="mx-auto mb-6 max-w-md text-sm leading-relaxed text-slate-600">
            在这里加载结构化实验，观察动画、调节参数，并跟随教师动作理解 STEM 规律。
          </p>
          <button
            type="button"
            onClick={loadSample}
            className="min-h-11 rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            加载斜面小车实验
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="custom-scrollbar flex h-full w-full flex-col overflow-y-auto bg-slate-50 p-5 text-slate-900 lg:p-8">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-end"
      >
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-md bg-blue-50 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-blue-700">
              {config.subject}
            </span>
            <span className="text-slate-300">/</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{config.gradeLevel}</span>
          </div>
          <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight text-slate-900">
            {config.title}
            <Sparkles className="text-amber-500" size={22} />
          </h1>
          <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-slate-600">{config.description}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Model</div>
          <div className="mt-1 font-mono text-xs text-slate-700">{config.simulation.model}</div>
        </div>
      </motion.div>

      <div className="min-h-0 flex-1">
        <motion.div
          layoutId="experiment-canvas"
          className="relative aspect-video overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
        >
          <AnimatePresence mode="wait">
            <ExperimentCanvas key={config.renderer} config={config} />
          </AnimatePresence>
        </motion.div>

        {config.renderer !== 'interactive_html' && <MetricsPanel />}
      </div>

      <div className="h-8 shrink-0" />
    </div>
  );
}
