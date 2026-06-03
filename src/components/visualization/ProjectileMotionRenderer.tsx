'use client';

import React, { useMemo, useState } from 'react';
import type { VisualizationSpec } from '@/lib/rag/visualization/types';

type ProjectileSpec = Extract<VisualizationSpec, { type: 'projectile_motion' }>;

interface ProjectileModel {
  v0: number;
  angleDeg: number;
  g: number;
  flightTime: number;
  range: number;
  maxHeight: number;
  points: Array<{ x: number; y: number; t: number }>;
}

export function ProjectileMotionRenderer({ spec }: { spec: ProjectileSpec }) {
  const initialV0 = spec.parameters.v0 ?? 12;
  const initialAngle = spec.motionType === 'horizontal' ? 0 : spec.parameters.angle_deg ?? 35;
  const initialG = spec.parameters.g || 9.8;
  const [v0, setV0] = useState(initialV0);
  const [angleDeg, setAngleDeg] = useState(initialAngle);
  const [g, setG] = useState(initialG);
  const model = useMemo(() => buildProjectileModel({
    v0,
    angleDeg: spec.motionType === 'horizontal' ? 0 : angleDeg,
    g,
  }), [angleDeg, g, spec.motionType, v0]);
  const initialTime = Math.min(spec.parameters.time_s ?? model.flightTime * 0.45, model.flightTime);
  const [time, setTime] = useState(initialTime);
  const activeTime = Math.min(time, model.flightTime);
  const activePoint = pointAtTime(model, activeTime);
  const path = toSvgPath(model.points, model.range, model.maxHeight);
  const px = scaleX(activePoint.x, model.range);
  const py = scaleY(activePoint.y, model.maxHeight);
  const isHorizontal = spec.motionType === 'horizontal';

  return (
    <div
      data-projectile-stage
      className="flex min-h-[500px] w-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-900 shadow-sm"
    >
      <div className="border-b border-slate-200 px-4 py-3">
        <h4 className="text-base font-black text-slate-950">{spec.title}</h4>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">{spec.description}</p>
      </div>

      <div className="grid min-h-0 flex-1 gap-0 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex min-h-[420px] flex-col bg-slate-950 p-4 text-white">
          <div className="grid gap-3 text-xs text-slate-300 md:grid-cols-3">
            <Metric label="当前 x" value={`${format(activePoint.x)} m`} />
            <Metric label="当前 y" value={`${format(activePoint.y)} m`} />
            <Metric label="t" value={`${format(activeTime)} s`} />
          </div>

          <div className="relative mt-4 min-h-0 flex-1 rounded-lg border border-white/10 bg-gradient-to-b from-slate-900 to-slate-950 p-3">
            <svg viewBox="0 0 720 360" className="h-full min-h-[310px] w-full" role="img" aria-label={spec.title}>
              <defs>
                <linearGradient id="projectileTrack" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="55%" stopColor="#2dd4bf" />
                  <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
              </defs>
              <g stroke="rgba(148,163,184,0.22)" strokeWidth="1">
                {Array.from({ length: 7 }, (_, index) => (
                  <line key={`v-${index}`} x1={70 + index * 95} x2={70 + index * 95} y1="28" y2="305" />
                ))}
                {Array.from({ length: 5 }, (_, index) => (
                  <line key={`h-${index}`} x1="58" x2="680" y1={68 + index * 58} y2={68 + index * 58} />
                ))}
              </g>
              <line x1="58" x2="686" y1="305" y2="305" stroke="#cbd5e1" strokeWidth="2" />
              <line x1="58" x2="58" y1="26" y2="305" stroke="#cbd5e1" strokeWidth="2" />
              <path d={path} fill="none" stroke="url(#projectileTrack)" strokeLinecap="round" strokeWidth="5" />
              <line x1="58" x2={px} y1={py} y2={py} stroke="#38bdf8" strokeDasharray="6 7" strokeWidth="1.5" />
              <line x1={px} x2={px} y1={py} y2="305" stroke="#f59e0b" strokeDasharray="6 7" strokeWidth="1.5" />
              <circle cx={px} cy={py} r="9" fill="#f8fafc" stroke="#0f766e" strokeWidth="4" />
              <text x="590" y="332" fill="#cbd5e1" fontSize="13">水平位移</text>
              <text x="16" y="38" fill="#cbd5e1" fontSize="13">高度</text>
              <text x={Math.min(600, px + 12)} y={Math.max(34, py - 12)} fill="#f8fafc" fontSize="13">
                物体位置
              </text>
            </svg>
          </div>
        </div>

        <div className="space-y-4 border-t border-slate-200 bg-slate-50 p-4 xl:border-l xl:border-t-0">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Metric light label="最大高度" value={`${format(model.maxHeight)} m`} />
            <Metric light label="水平射程" value={`${format(model.range)} m`} />
            <Metric light label="飞行时间" value={`${format(model.flightTime)} s`} />
            <Metric light label="重力加速度" value={`${format(g)} m/s^2`} />
          </div>

          <Slider label="时间" value={activeTime} min={0} max={model.flightTime} step={0.05} unit="s" onChange={setTime} />
          <Slider label="初速度" value={v0} min={1} max={40} step={0.5} unit="m/s" onChange={setV0} />
          {!isHorizontal && (
            <Slider label="抛射角" value={angleDeg} min={5} max={85} step={1} unit="deg" onChange={setAngleDeg} />
          )}
          <Slider label="重力加速度" value={g} min={1} max={20} step={0.1} unit="m/s^2" onChange={setG} />
        </div>
      </div>
    </div>
  );
}

function buildProjectileModel(input: { v0: number; angleDeg: number; g: number }): ProjectileModel {
  const angle = input.angleDeg * Math.PI / 180;
  const vx = input.v0 * Math.cos(angle);
  const vy = input.v0 * Math.sin(angle);
  const flightTime = vy > 0 ? (2 * vy) / input.g : Math.max(1.5, input.v0 / input.g);
  const range = Math.max(0.1, vx * flightTime);
  const maxHeight = Math.max(0.1, vy > 0 ? (vy * vy) / (2 * input.g) : 0.5 * input.g * flightTime * flightTime);
  const points = Array.from({ length: 90 }, (_, index) => {
    const t = (index / 89) * flightTime;
    return pointFor(input.v0, input.angleDeg, input.g, t);
  });
  return { v0: input.v0, angleDeg: input.angleDeg, g: input.g, flightTime, range, maxHeight, points };
}

function pointAtTime(model: ProjectileModel, time: number) {
  return pointFor(model.v0, model.angleDeg, model.g, time);
}

function pointFor(v0: number, angleDeg: number, g: number, t: number) {
  const angle = angleDeg * Math.PI / 180;
  const x = v0 * Math.cos(angle) * t;
  const y = Math.max(0, v0 * Math.sin(angle) * t - 0.5 * g * t * t);
  return { x, y, t };
}

function toSvgPath(points: ProjectileModel['points'], range: number, maxHeight: number): string {
  return points.map((point, index) => {
    const command = index === 0 ? 'M' : 'L';
    return `${command}${scaleX(point.x, range)},${scaleY(point.y, maxHeight)}`;
  }).join(' ');
}

function scaleX(x: number, range: number): number {
  return 58 + (x / Math.max(0.1, range)) * 610;
}

function scaleY(y: number, maxHeight: number): number {
  return 305 - (y / Math.max(0.1, maxHeight)) * 255;
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      <span className="flex items-center justify-between">
        <span>{label}</span>
        <span className="font-mono text-xs text-slate-500">{format(value)} {unit}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="mt-2 w-full accent-teal-600"
      />
    </label>
  );
}

function Metric({ label, value, light = false }: { label: string; value: string; light?: boolean }) {
  return (
    <div className={light ? 'rounded border border-slate-200 bg-white p-2' : 'rounded border border-white/10 bg-white/5 p-2'}>
      <div className={light ? 'text-[11px] font-bold uppercase tracking-wide text-slate-500' : 'text-[11px] font-bold uppercase tracking-wide text-slate-400'}>{label}</div>
      <div className={light ? 'mt-1 font-mono text-sm font-black text-slate-900' : 'mt-1 font-mono text-sm font-black text-white'}>{value}</div>
    </div>
  );
}

function format(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}
