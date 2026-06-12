'use client';

import { useMemo, useState } from 'react';
import type { MindMapSchema } from '@/features/deep-interaction/lib/types';
import { useDeepInteractionUIStore } from '@/lib/stores/deepInteractionUIStore';

export default function MindMapRenderer({ schema }: { schema: MindMapSchema }) {
  const focusedNodeId = useDeepInteractionUIStore((state) => state.focusedNodeId);
  const setFocusedNode = useDeepInteractionUIStore((state) => state.setFocusedNode);
  const [scale, setScale] = useState(1);

  const positions = useMemo(() => {
    const center = { x: 420, y: 270 };
    const children = schema.nodes.filter((node) => node.id !== schema.rootId);
    const result: Record<string, { x: number; y: number }> = { [schema.rootId]: center };
    children.forEach((node, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(1, children.length) - Math.PI / 2;
      const radius = node.level === 1 ? 190 : 275;
      result[node.id] = {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      };
    });
    return result;
  }, [schema.nodes, schema.rootId]);

  const focusedNode = schema.nodes.find((node) => node.id === focusedNodeId) ?? schema.nodes.find((node) => node.id === schema.rootId);

  return (
    <div className="grid h-full min-h-[620px] grid-cols-1 bg-slate-50 lg:grid-cols-[1fr_280px]">
      <section className="relative overflow-hidden bg-white">
        <div className="absolute left-4 top-4 z-10 flex gap-2">
          <button className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold" onClick={() => setScale((value) => Math.max(0.75, value - 0.1))}>缩小</button>
          <button className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold" onClick={() => setScale((value) => Math.min(1.35, value + 0.1))}>放大</button>
        </div>
        <svg viewBox="0 0 840 540" className="h-full w-full" style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}>
          <rect width="840" height="540" fill="#ffffff" />
          {schema.edges.map((edge) => {
            const source = positions[edge.source];
            const target = positions[edge.target];
            if (!source || !target) return null;
            return (
              <g key={edge.id}>
                <line x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke="#cbd5e1" strokeWidth="3" />
                {edge.label && (
                  <text x={(source.x + target.x) / 2} y={(source.y + target.y) / 2} className="fill-slate-400 text-xs">
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}
          {schema.nodes.map((node) => {
            const pos = positions[node.id];
            const focused = node.id === focusedNodeId || (!focusedNodeId && node.id === schema.rootId);
            const isRoot = node.id === schema.rootId;
            return (
              <g key={node.id} transform={`translate(${pos.x}, ${pos.y})`} className="cursor-pointer" onClick={() => setFocusedNode(node.id)}>
                <rect
                  x={isRoot ? -82 : -66}
                  y={isRoot ? -32 : -26}
                  width={isRoot ? 164 : 132}
                  height={isRoot ? 64 : 52}
                  rx="12"
                  fill={focused ? '#dbeafe' : isRoot ? '#eff6ff' : '#f8fafc'}
                  stroke={focused ? '#2563eb' : '#cbd5e1'}
                  strokeWidth={focused ? 4 : 2}
                />
                <text textAnchor="middle" y="5" className="fill-slate-900 text-sm font-black">
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </section>

      <aside className="custom-scrollbar overflow-y-auto border-t border-slate-200 bg-white p-5 lg:border-l lg:border-t-0">
        <h3 className="text-lg font-black">{schema.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">{schema.description}</p>
        {focusedNode && (
          <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="text-sm font-black text-blue-900">{focusedNode.label}</div>
            <p className="mt-2 text-xs leading-relaxed text-blue-800">{focusedNode.description}</p>
          </div>
        )}
        <div className="mt-5">
          <div className="mb-2 text-xs font-black uppercase tracking-wider text-slate-400">讲解步骤</div>
          <div className="space-y-2">
            {schema.explanationSteps.map((step) => (
              <div key={step.id} className="rounded-lg border border-slate-200 p-3">
                <div className="text-sm font-bold">{step.title}</div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{step.narration}</p>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
