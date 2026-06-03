'use client';

import type { ThreeDVisualizationSchema } from '@/lib/deep-interaction/types';
import { useDeepInteractionUIStore } from '@/lib/stores/deepInteractionUIStore';

export default function ThreeDVisualizationRenderer({ schema }: { schema: ThreeDVisualizationSchema }) {
  const highlightedObjectId = useDeepInteractionUIStore((state) => state.highlightedObjectId);
  const setHighlightObject = useDeepInteractionUIStore((state) => state.setHighlightObject);

  return (
    <div className="grid h-full min-h-[620px] grid-cols-1 bg-slate-50 lg:grid-cols-[1fr_300px]">
      <section className="relative flex items-center justify-center overflow-hidden bg-white p-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(37,99,235,0.10),transparent_38%)]" />
        <div className="relative h-[420px] w-full max-w-2xl">
          {schema.objects.map((object, index) => {
            const highlighted = highlightedObjectId === object.id;
            const left = 50 + object.position.x * 120;
            const top = 210 - object.position.y * 90 + object.position.z * 18;
            const size = object.id === 'center' ? 112 : 78;
            return (
              <button
                key={object.id}
                type="button"
                onClick={() => setHighlightObject(object.id)}
                className="absolute flex items-center justify-center rounded-full text-xs font-black text-white shadow-2xl transition-transform hover:scale-105"
                style={{
                  left: `${left}%`,
                  top,
                  width: size,
                  height: size,
                  transform: 'translate(-50%, -50%)',
                  background: object.color ?? '#2563eb',
                  boxShadow: highlighted ? '0 0 0 12px rgba(37,99,235,0.16), 0 24px 60px rgba(15,23,42,0.22)' : '0 24px 60px rgba(15,23,42,0.18)',
                }}
              >
                {object.label}
                <span className="absolute inset-2 rounded-full border border-white/30" />
                {index > 0 && <span className="absolute -left-24 top-1/2 h-1 w-24 -translate-y-1/2 bg-slate-300" />}
              </button>
            );
          })}
        </div>
      </section>
      <aside className="custom-scrollbar overflow-y-auto border-t border-slate-200 bg-white p-5 lg:border-l lg:border-t-0">
        <h3 className="text-lg font-black">{schema.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">{schema.description}</p>
        <div className="mt-5 space-y-2">
          {schema.objects.map((object) => (
            <button
              key={object.id}
              type="button"
              onClick={() => setHighlightObject(object.id)}
              className={`w-full rounded-lg border p-3 text-left transition ${
                highlightedObjectId === object.id ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="text-sm font-bold">{object.label}</div>
              <p className="mt-1 text-xs text-slate-500">{object.description}</p>
            </button>
          ))}
        </div>
        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-black uppercase tracking-wider text-slate-400">说明</div>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            第一版使用结构化 3D schema 的可视化占位。后续可接 Three.js 渲染真实三维场景，但数据结构已经与 renderer 解耦。
          </p>
        </div>
      </aside>
    </div>
  );
}
