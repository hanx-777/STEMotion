'use client';

import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import type { ForceDiagramSpec } from '@/lib/rag/visualization/types';
import { prefersReducedMotion, stemotionMotion } from '@/lib/animation/motionTokens';

interface Props {
  spec: ForceDiagramSpec;
}

const ARROW_LENGTH = 80;

export function ForceDiagramRenderer({ spec }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const width = 400;
  const height = 350;
  const cx = width / 2;
  const cy = height / 2;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || prefersReducedMotion()) return;

    const targets = Array.from(svg.querySelectorAll('[data-force-motion]'));
    if (targets.length === 0) return;

    const tween = gsap.fromTo(
      targets,
      { autoAlpha: 0, scale: 0.92 },
      {
        autoAlpha: 1,
        scale: 1,
        transformOrigin: '50% 50%',
        duration: stemotionMotion.duration.item,
        stagger: stemotionMotion.stagger.item,
        ease: stemotionMotion.ease.standard,
        overwrite: 'auto',
      },
    );

    return () => {
      tween.kill();
    };
  }, [spec]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <h4 className="mb-2 font-medium text-gray-800 dark:text-gray-200">{spec.title}</h4>
      <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">{spec.description}</p>
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={spec.title}>
        {/* Incline plane */}
        {spec.scene === 'incline' && spec.angleDeg && (
          <InclinePlane cx={cx} cy={cy} angleDeg={spec.angleDeg} />
        )}

        {/* Object */}
        <g data-force-motion>
          <rect x={cx - 20} y={cy - 20} width="40" height="40" rx="4" className="fill-blue-100 stroke-blue-500 dark:fill-blue-900 dark:stroke-blue-400" strokeWidth="2" />
          <text x={cx} y={cy + 5} textAnchor="middle" className="fill-blue-700 text-sm font-medium dark:fill-blue-300">{spec.objectLabel}</text>
        </g>

        {/* Forces */}
        {spec.forces.map((force) => {
          const rad = (force.angleDeg * Math.PI) / 180;
          const x2 = cx + Math.cos(rad) * ARROW_LENGTH;
          const y2 = cy - Math.sin(rad) * ARROW_LENGTH;
          const color = force.color ?? '#333';
          const midX = (cx + x2) / 2;
          const midY = (cy + y2) / 2;

          return (
            <g key={force.id} data-force-motion>
              <line x1={cx} y1={cy} x2={x2} y2={y2} stroke={color} strokeWidth="2.5" markerEnd={`url(#arrow-${force.id})`} />
              <defs>
                <marker id={`arrow-${force.id}`} markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill={color} />
                </marker>
              </defs>
              <text x={midX + 10} y={midY - 8} className="fill-gray-700 text-xs font-medium dark:fill-gray-300">
                {force.symbol}
              </text>
              <text x={midX + 10} y={midY + 6} className="fill-gray-500 text-xs dark:fill-gray-400">
                {force.label}
              </text>
            </g>
          );
        })}

        {/* Annotations */}
        {spec.annotations?.map((ann, i) => (
          <text key={i} x={ann.x} y={ann.y} className="fill-gray-600 text-xs dark:fill-gray-400">{ann.text}</text>
        ))}
      </svg>
    </div>
  );
}

function InclinePlane({ cx, cy, angleDeg }: { cx: number; cy: number; angleDeg: number }) {
  const rad = (angleDeg * Math.PI) / 180;
  const len = 120;
  const x1 = cx - len * Math.cos(rad);
  const y1 = cy + len * Math.sin(rad);
  const x2 = cx + len * Math.cos(rad);
  const y2 = cy - len * Math.sin(rad);

  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-gray-400 dark:stroke-gray-600" strokeWidth="2" strokeDasharray="4" />
      <text x={(cx + x2) / 2 + 5} y={(cy + y2) / 2 - 10} className="fill-gray-500 text-xs dark:fill-gray-400">
        {angleDeg}°
      </text>
    </g>
  );
}
