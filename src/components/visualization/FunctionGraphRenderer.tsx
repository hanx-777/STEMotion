'use client';

import React, { useMemo } from 'react';
import type { FunctionGraphSpec } from '@/lib/rag/visualization/types';

interface Props {
  spec: FunctionGraphSpec;
}

export function FunctionGraphRenderer({ spec }: Props) {
  const { expressions, domain, pointsOfInterest, intervals } = spec;
  const width = 500;
  const height = 350;
  const padding = 50;

  const xScale = (x: number) => padding + ((x - domain.xMin) / (domain.xMax - domain.xMin)) * (width - 2 * padding);
  const yRange = useMemo(() => domain.yMin !== undefined && domain.yMax !== undefined
    ? { min: domain.yMin, max: domain.yMax }
    : { min: -3, max: 3 }, [domain.yMin, domain.yMax]);
  const yScale = (y: number) => height - padding - ((y - yRange.min) / (yRange.max - yRange.min)) * (height - 2 * padding);

  const curves = useMemo(() => {
    const xScaleFn = (x: number) => padding + ((x - domain.xMin) / (domain.xMax - domain.xMin)) * (width - 2 * padding);
    const yScaleFn = (y: number) => height - padding - ((y - yRange.min) / (yRange.max - yRange.min)) * (height - 2 * padding);

    return expressions.map((expr) => {
      try {
        const fn = new Function('x', `"use strict"; return (${expr.evaluator})`) as (x: number) => number;
        const points: string[] = [];
        const steps = 200;
        for (let i = 0; i <= steps; i++) {
          const x = domain.xMin + (i / steps) * (domain.xMax - domain.xMin);
          const y = fn(x);
          if (Number.isFinite(y) && Math.abs(y) < 1e6) {
            points.push(`${xScaleFn(x)},${yScaleFn(y)}`);
          }
        }
        return { id: expr.id, color: expr.color ?? '#2563eb', path: `M${points.join('L')}`, label: expr.label };
      } catch {
        return { id: expr.id, color: expr.color ?? '#2563eb', path: '', label: expr.label };
      }
    });
  }, [expressions, domain, yRange]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <h4 className="mb-2 font-medium text-gray-800 dark:text-gray-200">{spec.title}</h4>
      <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">{spec.description}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={spec.title}>
        {/* Grid */}
        {spec.gridVisible !== false && (
          <g className="stroke-gray-200 dark:stroke-gray-700" strokeWidth="0.5">
            {Array.from({ length: 11 }, (_, i) => {
              const x = domain.xMin + (i / 10) * (domain.xMax - domain.xMin);
              return <line key={`gx${i}`} x1={xScale(x)} y1={padding} x2={xScale(x)} y2={height - padding} />;
            })}
            {Array.from({ length: 7 }, (_, i) => {
              const y = yRange.min + (i / 6) * (yRange.max - yRange.min);
              return <line key={`gy${i}`} x1={padding} y1={yScale(y)} x2={width - padding} y2={yScale(y)} />;
            })}
          </g>
        )}

        {/* Axes */}
        <line x1={padding} y1={yScale(0)} x2={width - padding} y2={yScale(0)} className="stroke-gray-400 dark:stroke-gray-500" strokeWidth="1.5" />
        <line x1={xScale(0)} y1={padding} x2={xScale(0)} y2={height - padding} className="stroke-gray-400 dark:stroke-gray-500" strokeWidth="1.5" />

        {/* Intervals */}
        {intervals?.map((interval, i) => {
          const x1 = xScale(interval.from);
          const x2 = xScale(interval.to);
          const color = interval.property === 'increasing' ? '#22c55e' : interval.property === 'decreasing' ? '#ef4444' : '#a855f7';
          return (
            <rect key={`int${i}`} x={x1} y={padding} width={x2 - x1} height={height - 2 * padding} fill={color} fillOpacity="0.08" />
          );
        })}

        {/* Curves */}
        {curves.map((curve) => (
          <path key={curve.id} d={curve.path} fill="none" stroke={curve.color} strokeWidth="2" />
        ))}

        {/* Points of interest */}
        {pointsOfInterest.map((point, i) => {
          const px = xScale(point.x);
          const py = yScale(point.y);
          const color = point.type === 'extremum' ? '#ef4444' : point.type === 'intercept' ? '#22c55e' : '#f59e0b';
          return (
            <g key={`poi${i}`}>
              <circle cx={px} cy={py} r="4" fill={color} stroke="white" strokeWidth="1.5" />
              <text x={px + 8} y={py - 8} className="fill-gray-700 text-xs dark:fill-gray-300">{point.label}</text>
            </g>
          );
        })}

        {/* Axis labels */}
        <text x={width - padding + 10} y={yScale(0) + 4} className="fill-gray-500 text-xs">x</text>
        <text x={xScale(0) + 8} y={padding - 8} className="fill-gray-500 text-xs">y</text>
      </svg>
    </div>
  );
}
