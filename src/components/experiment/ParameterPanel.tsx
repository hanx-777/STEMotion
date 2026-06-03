'use client';

import React from 'react';
import { useExperimentStore } from '@/lib/stores/experimentStore';
import { Settings2, Info } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

export default function ParameterPanel() {
  const { config, parameters, setParameter } = useExperimentStore();
  const { t } = useTranslation();

  if (!config || !config.parameters.length) return null;

  if (config.renderer === 'interactive_html') {
    return (
      <section className="mb-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2 font-bold text-slate-800">
          <div className="rounded-lg bg-slate-100 p-1.5 text-slate-600">
            <Settings2 size={16} />
          </div>
          <h2 className="text-sm uppercase tracking-wider">Widget controls</h2>
        </div>
        <p className="text-sm leading-relaxed text-slate-600">
          这个实验的电压、电阻和支路开关直接在中央互动 Widget 内调节。右侧面板保留讲解、公式和课堂检查。
        </p>
      </section>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5 mb-4 overflow-hidden relative group">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2 text-slate-800 font-bold">
          <div className="p-1.5 bg-slate-100 rounded-lg text-slate-600">
            <Settings2 size={16} />
          </div>
          <h2 className="text-sm uppercase tracking-wider">{t('common.parameters')}</h2>
        </div>
        <button title="Learn about these parameters" className="text-slate-300 hover:text-blue-500 transition-colors">
          <Info size={16} />
        </button>
      </div>
      
      <div className="space-y-6">
        {config.parameters.map((param, idx) => (
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.05 }}
            key={param.id} 
            className="flex flex-col gap-2"
          >
            <div className="flex justify-between items-end gap-3">
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                {t(`physics.${param.id}`, param.label)}
              </label>
              <div className="flex items-baseline gap-1">
                <span className="text-sm font-bold text-blue-600 tabular-nums">
                  {parameters[param.id]}
                </span>
                {param.unit && <span className="text-[10px] font-bold text-slate-400 uppercase">{param.unit}</span>}
              </div>
            </div>
            {param.explanation && (
              <p className="text-xs leading-relaxed text-slate-500">{param.explanation}</p>
            )}
            
            {param.type === 'number' && (
              <div className="relative flex items-center h-6">
                <input 
                  type="range" 
                  min={param.min} 
                  max={param.max} 
                  step={param.step}
                  value={Number(parameters[param.id])}
                  onChange={(e) => setParameter(param.id, Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600 focus:outline-none hover:bg-slate-200 transition-colors"
                />
              </div>
            )}
            
            {param.type === 'boolean' && (
              <div className="flex items-center mt-1">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={Boolean(parameters[param.id])}
                    onChange={(e) => setParameter(param.id, e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 shadow-inner"></div>
                  <span className="ml-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {parameters[param.id] ? 'On' : 'Off'}
                  </span>
                </label>
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
