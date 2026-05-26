'use client';

import { useEffect, useMemo, useState } from 'react';
import type { InteractionArtifact, SimulationSchema } from '@/lib/deep-interaction/types';
import { useDeepInteractionUIStore } from '@/lib/stores/deepInteractionUIStore';

const PX_PER_METER = 54;

export default function SimulationRenderer({
  artifact,
  schema,
}: {
  artifact: InteractionArtifact;
  schema: SimulationSchema;
}) {
  if (schema.simulationType !== 'inclined_plane') {
    return <OhmsLawPlaceholder schema={schema} />;
  }

  return <InclinedPlaneSimulation key={artifact.id} schema={schema} />;
}

function InclinedPlaneSimulation({ schema }: { schema: SimulationSchema }) {
  const highlightedObjectId = useDeepInteractionUIStore((state) => state.highlightedObjectId);
  const highlightedFormulaId = useDeepInteractionUIStore((state) => state.highlightedFormulaId);
  const simulationRunning = useDeepInteractionUIStore((state) => state.simulationRunning);
  const simulationResetSignal = useDeepInteractionUIStore((state) => state.simulationResetSignal);
  const parameterOverrides = useDeepInteractionUIStore((state) => state.parameterOverrides);
  const [manualRunning, setManualRunning] = useState(false);
  const [time, setTime] = useState(0);
  const [params, setParams] = useState<Record<string, number | string | boolean>>(() => paramsFromSchema(schema));

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setTime(0);
      setManualRunning(false);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [simulationResetSignal]);

  const running = manualRunning || simulationRunning;
  const effectiveParams = useMemo(
    () => ({ ...params, ...parameterOverrides }),
    [parameterOverrides, params],
  );
  const metrics = useMemo(() => calculateInclinedPlane(effectiveParams, time), [effectiveParams, time]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = (now - last) / 1000;
      last = now;
      if (running) {
        setTime((value) => Math.min(12, value + delta));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  const updateParam = (id: string, value: number) => {
    setParams((current) => ({ ...current, [id]: value }));
  };

  const width = 820;
  const height = 480;
  const originX = 110;
  const originY = 395;
  const rampLength = 560;
  const angleRad = (Number(effectiveParams.angle) * Math.PI) / 180;
  const topX = originX;
  const topY = originY - rampLength * Math.tan(angleRad);
  const bottomX = originX + rampLength;
  const bottomY = originY;
  const cartSize = 46 + (Number(effectiveParams.mass) - 1) * 5;
  const start = 58;
  const distancePx = Math.min(metrics.distance * PX_PER_METER, rampLength / Math.max(Math.cos(angleRad), 0.01) - 110);
  const cartX = topX + (start + distancePx) * Math.cos(angleRad);
  const cartY = topY + (start + distancePx) * Math.sin(angleRad);

  const isHighlighted = (id: string) => highlightedObjectId === id;

  return (
    <div className="grid h-full min-h-[620px] grid-cols-1 bg-slate-50 lg:grid-cols-[310px_1fr]">
      <aside className="custom-scrollbar overflow-y-auto border-b border-slate-200 bg-white p-5 lg:border-b-0 lg:border-r">
        <div className="mb-4">
          <h3 className="text-lg font-black">{schema.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">{schema.description}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setManualRunning((value) => !value)}
            className="min-h-11 rounded-lg bg-blue-600 px-3 text-sm font-bold text-white transition hover:bg-blue-700"
          >
            {running ? '暂停实验' : '运行实验'}
          </button>
          <button
            type="button"
            onClick={() => {
              setManualRunning(false);
              setTime(0);
            }}
            className="min-h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
          >
            重置
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {schema.parameters.map((parameter) => (
            <label key={parameter.id} className="block">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-slate-700">{parameter.label}</span>
                <span className="font-mono text-xs font-black text-blue-700">
                  {Number(effectiveParams[parameter.id]).toFixed(parameter.step < 0.1 ? 2 : 1)} {parameter.unit}
                </span>
              </div>
              <input
                type="range"
                min={parameter.min}
                max={parameter.max}
                step={parameter.step}
                value={Number(effectiveParams[parameter.id])}
                onChange={(event) => updateParam(parameter.id, Number(event.target.value))}
                className="w-full accent-blue-600"
              />
              {parameter.explanation && <p className="mt-1 text-xs leading-relaxed text-slate-400">{parameter.explanation}</p>}
            </label>
          ))}
        </div>
      </aside>

      <section className="relative min-h-[520px] overflow-hidden bg-white">
        <svg className="h-full w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="斜面小车模拟实验">
          <defs>
            <pattern id="deep-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1" fill="#dbe4ef" />
            </pattern>
            <marker id="deep-arrow-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
            </marker>
            <marker id="deep-arrow-blue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#2563eb" />
            </marker>
            <marker id="deep-arrow-green" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#16a34a" />
            </marker>
            <marker id="deep-arrow-amber" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
            </marker>
          </defs>
          <rect width="100%" height="100%" fill="url(#deep-grid)" />
          <line x1="60" y1={originY} x2="760" y2={originY} stroke="#e2e8f0" strokeWidth="2" strokeDasharray="8 8" />
          <polygon
            points={`${originX},${originY} ${topX},${topY} ${bottomX},${bottomY}`}
            fill="#f8fafc"
            stroke={isHighlighted('ramp') ? '#2563eb' : '#cbd5e1'}
            strokeWidth={isHighlighted('ramp') ? 5 : 3}
          />
          <text x={bottomX - 90} y={bottomY - 18} className="fill-blue-700 text-lg font-black">
            {Math.round(Number(effectiveParams.angle))}°
          </text>

          <g transform={`translate(${cartX}, ${cartY}) rotate(${Number(effectiveParams.angle)})`}>
            {isHighlighted('cart') && (
              <rect x={-cartSize / 2 - 8} y={-cartSize - 8} width={cartSize + 16} height={cartSize + 16} rx="12" fill="#bfdbfe" opacity="0.7" />
            )}
            <rect x={-cartSize / 2} y={-cartSize} width={cartSize} height={cartSize} rx="8" fill="#ffffff" stroke="#0f172a" strokeWidth="3" />
            <text x="0" y={-cartSize / 2 + 5} textAnchor="middle" className="fill-slate-900 text-xs font-black">
              {Number(effectiveParams.mass).toFixed(1)}kg
            </text>
            <circle cx={-cartSize / 2 + 12} cy="0" r="8" fill="#0f172a" />
            <circle cx={cartSize / 2 - 12} cy="0" r="8" fill="#0f172a" />

            <g transform={`rotate(${-Number(effectiveParams.angle)})`} opacity={isHighlighted('gravity_arrow') ? 1 : 0.85}>
              <line x1="0" y1="0" x2="0" y2="95" stroke="#ef4444" strokeWidth="4" markerEnd="url(#deep-arrow-red)" />
              <text x="10" y="105" className="fill-red-500 text-xs font-black">mg</text>
            </g>
            <line x1="0" y1="0" x2="0" y2="-82" stroke="#2563eb" strokeWidth="4" markerEnd="url(#deep-arrow-blue)" />
            <text x="10" y="-88" className="fill-blue-600 text-xs font-black">N</text>
            <line x1={-cartSize / 2} y1={-cartSize / 2} x2={-cartSize / 2 - 70} y2={-cartSize / 2} stroke="#16a34a" strokeWidth="4" markerEnd="url(#deep-arrow-green)" />
            <text x={-cartSize / 2 - 82} y={-cartSize / 2 - 8} className="fill-green-600 text-xs font-black">f</text>
            {metrics.velocity > 0.05 && (
              <line x1={cartSize / 2} y1={-cartSize / 2} x2={cartSize / 2 + Math.min(120, metrics.velocity * 14)} y2={-cartSize / 2} stroke="#f59e0b" strokeWidth="5" markerEnd="url(#deep-arrow-amber)" />
            )}
          </g>

          <foreignObject x="32" y="28" width="245" height="168">
            <div className="rounded-lg border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur">
              <div className="mb-3 text-[10px] font-black uppercase tracking-wider text-slate-400">实时指标</div>
              <Metric label="时间" value={metrics.time.toFixed(2)} unit="s" />
              <Metric label="加速度" value={metrics.acceleration.toFixed(2)} unit="m/s²" />
              <Metric label="速度" value={metrics.velocity.toFixed(2)} unit="m/s" />
              <Metric label="位移" value={metrics.distance.toFixed(2)} unit="m" />
            </div>
          </foreignObject>
        </svg>

        <div className="absolute bottom-4 left-4 right-4 rounded-lg border border-slate-200 bg-white/90 p-3 text-sm shadow-sm backdrop-blur">
          <div className={`font-mono font-black ${highlightedFormulaId === 'acceleration' ? 'text-blue-700' : 'text-slate-700'}`}>
            a = g sin(theta) - μ g cos(theta)
          </div>
        </div>
      </section>
    </div>
  );
}

function OhmsLawPlaceholder({ schema }: { schema: SimulationSchema }) {
  const [voltage, setVoltage] = useState(6);
  const [resistance, setResistance] = useState(10);
  const current = voltage / resistance;

  return (
    <div className="grid h-full min-h-[560px] grid-cols-1 bg-slate-50 lg:grid-cols-[300px_1fr]">
      <aside className="border-b border-slate-200 bg-white p-5 lg:border-b-0 lg:border-r">
        <h3 className="text-lg font-black">{schema.title}</h3>
        <p className="mt-2 text-sm text-slate-500">{schema.description}</p>
        <Slider label="电压" value={voltage} min={1} max={12} step={0.5} unit="V" onChange={setVoltage} />
        <Slider label="电阻" value={resistance} min={2} max={50} step={1} unit="Ω" onChange={setResistance} />
      </aside>
      <section className="flex items-center justify-center p-8">
        <div className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
          <svg viewBox="0 0 620 300" className="h-72 w-full">
            <rect x="80" y="80" width="460" height="140" rx="18" fill="none" stroke="#334155" strokeWidth="8" />
            <rect x="265" y="54" width="90" height="52" fill="#fff" stroke="#334155" strokeWidth="3" />
            <line x1="292" y1="62" x2="292" y2="98" stroke="#2563eb" strokeWidth="8" />
            <line x1="328" y1="62" x2="328" y2="98" stroke="#ef4444" strokeWidth="8" />
            <line x1="90" y1="150" x2="45" y2="150" stroke="#334155" strokeWidth="6" />
            <line x1="45" y1="130" x2="45" y2="170" stroke="#334155" strokeWidth="6" />
            <text x="280" y="145" className="fill-slate-700 text-lg font-black">I = U / R</text>
            <text x="240" y="255" className="fill-blue-700 text-3xl font-black">{current.toFixed(2)} A</text>
          </svg>
          <p className="text-center text-sm text-slate-500">
            当前电流 = {voltage.toFixed(1)} V / {resistance.toFixed(0)} Ω = {current.toFixed(2)} A
          </p>
        </div>
      </section>
    </div>
  );
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
    <label className="mt-5 block">
      <div className="mb-2 flex justify-between text-sm">
        <span className="font-bold">{label}</span>
        <span className="font-mono font-black text-blue-700">{value.toFixed(step < 1 ? 1 : 0)} {unit}</span>
      </div>
      <input className="w-full accent-blue-600" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="mb-2 flex items-center justify-between text-xs">
      <span className="font-bold text-slate-500">{label}</span>
      <span className="font-mono font-black text-slate-900">{value} <span className="text-slate-400">{unit}</span></span>
    </div>
  );
}

function paramsFromSchema(schema: SimulationSchema): Record<string, number> {
  return Object.fromEntries(schema.parameters.map((parameter) => [parameter.id, parameter.value]));
}

function calculateInclinedPlane(params: Record<string, string | number | boolean>, time: number) {
  const angle = Number(params.angle ?? 30);
  const friction = Number(params.friction ?? 0.12);
  const gravity = Number(params.gravity ?? 9.8);
  const rad = (angle * Math.PI) / 180;
  const acceleration = Math.max(0, gravity * Math.sin(rad) - friction * gravity * Math.cos(rad));
  const velocity = acceleration * time;
  const distance = 0.5 * acceleration * time * time;
  return { time, acceleration, velocity, distance };
}
