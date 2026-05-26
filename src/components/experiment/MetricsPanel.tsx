'use client';

import React, { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useInclinedPlaneSimulation } from '@/lib/simulation/inclinedPlane';

export default function MetricsPanel() {
  const sim = useInclinedPlaneSimulation();

  const data = useMemo(() => {
    return Array.from({ length: 13 }, (_, index) => {
      const t = index * 0.5;
      return {
        time: t.toFixed(1),
        velocity: Number((sim.acceleration * t).toFixed(2)),
        distance: Number((0.5 * sim.acceleration * t * t).toFixed(2)),
      };
    });
  }, [sim.acceleration]);

  const metrics = [
    { label: 'time', value: sim.time.toFixed(2), unit: 's' },
    { label: 'acceleration', value: sim.acceleration.toFixed(2), unit: 'm/s^2' },
    { label: 'velocity', value: sim.velocity.toFixed(2), unit: 'm/s' },
    { label: 'distance', value: sim.distance.toFixed(2), unit: 'm' },
  ];

  return (
    <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr_280px]">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Velocity vs time</h3>
          <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">live</span>
        </div>
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="time" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={28} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }} />
              <Line type="monotone" dataKey="velocity" stroke="#2563eb" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Distance vs time</h3>
          <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">derived</span>
        </div>
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="time" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={28} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }} />
              <Line type="monotone" dataKey="distance" stroke="#059669" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-1">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{metric.label}</div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-black tabular-nums text-slate-900">{metric.value}</span>
              <span className="text-xs font-semibold text-slate-500">{metric.unit}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
