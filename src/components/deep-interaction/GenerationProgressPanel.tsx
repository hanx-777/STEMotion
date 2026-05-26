'use client';

import { AlertCircle, CheckCircle2, FileText } from 'lucide-react';
import { useGenerationProgressStore } from '@/lib/stores/generationProgressStore';
import BlueprintPreview from './BlueprintPreview';

export default function GenerationProgressPanel() {
  const { active, progress, logs, outline, schemaPreview, blueprint, schemaValidation, error } = useGenerationProgressStore();

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-wider text-slate-400">生成进度</div>
          <div className="mt-1 text-sm font-bold">
            {error ? '生成失败' : active ? '正在生成' : progress === 100 ? '已完成' : '等待开始'}
          </div>
        </div>
        {error ? (
          <AlertCircle className="text-red-500" size={20} />
        ) : progress === 100 ? (
          <CheckCircle2 className="text-emerald-500" size={20} />
        ) : (
          <FileText className="text-blue-500" size={20} />
        )}
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="生成进度">
        <div className="h-full bg-blue-600 transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-2 text-right text-xs font-bold text-slate-500">{progress}%</div>

      <BlueprintPreview blueprint={blueprint} schemaValidation={schemaValidation} />

      {outline && (
        <div className="mt-4 rounded-lg bg-slate-50 p-3">
          <div className="text-xs font-bold text-slate-500">大纲：{outline.title}</div>
          <ol className="mt-2 space-y-1 text-xs text-slate-600">
            {outline.steps.map((step, index) => (
              <li key={step}>{index + 1}. {step}</li>
            ))}
          </ol>
        </div>
      )}

      {schemaPreview ? (
        <pre className="mt-4 max-h-36 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-100">
          {JSON.stringify(schemaPreview, null, 2)}
        </pre>
      ) : null}

      {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}

      <div className="mt-4 space-y-2">
        {logs.length === 0 ? (
          <p className="text-xs text-slate-400">开始生成后，这里会显示每一步进度。</p>
        ) : (
          logs.slice(-6).map((log) => (
            <div key={log.id} className="flex items-start gap-2 text-xs text-slate-600">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
              <span>{log.message}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
