'use client';

import React, { useMemo } from 'react';
import { useInclinedPlaneSimulation } from '@/lib/simulation/inclinedPlane';
import { usePlaybackStore } from '@/lib/stores/playbackStore';
import { motion, AnimatePresence } from 'framer-motion';

export default function InclinedPlaneRenderer() {
  const sim = useInclinedPlaneSimulation();
  const highlightedObjects = usePlaybackStore((state) => state.highlightedObjects);

  // SVG Coordinate System (0,0 at top-left, 800x500 box)
  const width = 800;
  const height = 500;
  
  // Origin for the ramp (bottom left corner of the ramp triangle)
  const originX = 100;
  const originY = 420;
  
  // Ramp dimensions
  const rampLengthPx = 600; 
  const rampHeightPx = rampLengthPx * Math.tan(sim.angleRad);
  
  // Top point of the ramp
  const topX = originX;
  const topY = originY - rampHeightPx;
  // Bottom point of the ramp
  const bottomX = originX + rampLengthPx;
  const bottomY = originY;

  // Cart dimensions based on mass (visual scaling)
  const baseCartSize = 44;
  const cartSize = baseCartSize + (sim.mass - 1) * 8;
  
  // Cart starting position (top of ramp)
  const startDistancePx = 60; 
  
  // Current distance down the ramp
  const hypotenusePx = rampLengthPx / Math.cos(sim.angleRad);
  const maxDistance = hypotenusePx - startDistancePx - cartSize;
  const currentDistPx = Math.min(sim.distancePx, maxDistance);
  
  // Calculate cart coordinates along the inclined plane
  const cartCenterX = topX + (startDistancePx + currentDistPx) * Math.cos(sim.angleRad);
  const cartCenterY = topY + (startDistancePx + currentDistPx) * Math.sin(sim.angleRad);

  const isHighlighted = (id: string) => highlightedObjects.includes(id);

  // Force vector scales
  const forceScale = 8;
  const vectorLength = (value: number, max = 112) => Math.min(max, Math.max(28, value * forceScale));
  const gravityVector = vectorLength(sim.mass * sim.gravity);
  const normalVector = vectorLength(sim.mass * sim.gPerpendicular);
  const frictionVector = vectorLength(sim.mass * sim.frictionAccel, 92);

  // Motion trail points
  const trail = useMemo(() => {
    const points = [];
    const step = 20;
    for (let d = 0; d < currentDistPx; d += step) {
      const tx = topX + (startDistancePx + d) * Math.cos(sim.angleRad);
      const ty = topY + (startDistancePx + d) * Math.sin(sim.angleRad);
      points.push({ x: tx, y: ty, opacity: Math.max(0.1, d / currentDistPx) });
    }
    return points;
  }, [currentDistPx, topX, topY, startDistancePx, sim.angleRad]);
  
  return (
    <div className="w-full h-full relative group bg-white">
      <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_80px_rgba(15,23,42,0.04)] z-10 rounded-lg"></div>
      
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} className="block">
        <defs>
          <pattern id="dot-grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="#e2e8f0" />
          </pattern>
          
          <linearGradient id="ramp-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f1f5f9" />
          </linearGradient>

          <filter id="vector-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          {/* Markers */}
          <marker id="arrow-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
          </marker>
          <marker id="arrow-blue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6" />
          </marker>
          <marker id="arrow-green" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#10b981" />
          </marker>
          <marker id="arrow-orange" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
          </marker>
        </defs>
        
        <rect width="100%" height="100%" fill="url(#dot-grid)" />

        {/* Floor Line */}
        <line x1="50" y1={originY} x2={width-50} y2={originY} stroke="#e2e8f0" strokeWidth="2" strokeDasharray="8 8" />

        {/* Motion Trail */}
        <g>
          {trail.map((p, i) => (
            <circle 
              key={i} 
              cx={p.x} 
              cy={p.y} 
              r={2} 
              fill="#3b82f6" 
              fillOpacity={p.opacity * 0.3} 
            />
          ))}
        </g>

        {/* Ramp */}
        <motion.g 
          initial={false}
          animate={{ opacity: 1 }}
          className={isHighlighted('ramp') ? 'drop-shadow-[0_0_15px_rgba(59,130,246,0.3)]' : ''}
        >
          <polygon 
            points={`${originX},${originY} ${topX},${topY} ${bottomX},${bottomY}`} 
            fill="url(#ramp-grad)" 
            stroke="#cbd5e1" 
            strokeWidth="3" 
            strokeLinejoin="round"
          />
          
          {/* Surface texture */}
          <line x1={topX} y1={topY} x2={bottomX} y2={bottomY} stroke="#94a3b8" strokeWidth="1" strokeOpacity="0.3" />

          {/* Angle Annotation */}
          <path 
            d={`M ${bottomX - 60} ${bottomY} A 60 60 0 0 0 ${bottomX - 60 * Math.cos(sim.angleRad)} ${bottomY - 60 * Math.sin(sim.angleRad)}`}
            fill="none" 
            stroke="#3b82f6" 
            strokeWidth="2"
            strokeDasharray="4 4"
            className="opacity-60"
          />
          <text 
            x={bottomX - 85} 
            y={bottomY - 15} 
            fontSize="18" 
            className="fill-blue-600 font-black tabular-nums select-none"
          >
            {sim.angleDegrees} deg
          </text>
        </motion.g>

        {/* Cart Container */}
        <g transform={`translate(${cartCenterX}, ${cartCenterY}) rotate(${sim.angleDegrees})`}>
          
          {/* Highlight Glow for Cart */}
          <AnimatePresence>
            {isHighlighted('cart') && (
              <motion.rect 
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 0.15, scale: 1.2 }}
                exit={{ opacity: 0 }}
                x={-cartSize/2} 
                y={-cartSize} 
                width={cartSize} 
                height={cartSize} 
                fill="#3b82f6" 
                rx="12"
              />
            )}
          </AnimatePresence>

          {/* Cart Body */}
          <rect 
            x={-cartSize/2} 
            y={-cartSize} 
            width={cartSize} 
            height={cartSize} 
            fill="#ffffff" 
            stroke={isHighlighted('cart') ? '#3b82f6' : '#1e293b'} 
            strokeWidth="3"
            rx="8"
            className="transition-all duration-300 shadow-2xl"
          />
          
          {/* Mass Label */}
          <text x="0" y={-cartSize/2 + 7} textAnchor="middle" className="fill-slate-900 font-black text-[12px] select-none">
            {sim.mass}kg
          </text>

          {/* Wheels */}
          <circle cx={-cartSize/2 + 12} cy="0" r="8" fill="#0f172a" />
          <circle cx={cartSize/2 - 12} cy="0" r="8" fill="#0f172a" />
          <circle cx={-cartSize/2 + 12} cy="0" r="3" fill="#cbd5e1" />
          <circle cx={cartSize/2 - 12} cy="0" r="3" fill="#cbd5e1" />

          {/* --- Physical Forces (Vectors) --- */}
          
          {/* Gravity Vector */}
          <motion.g transform={`rotate(${-sim.angleDegrees})`}>
            <line x1="0" y1="0" x2="0" y2={gravityVector} stroke="#ef4444" strokeWidth="3" markerEnd="url(#arrow-red)" />
            <text x="10" y={gravityVector + 5} fill="#ef4444" fontSize="12" className="font-black select-none italic">mg</text>
          </motion.g>

          {/* Normal Force Vector */}
          <motion.g>
            <line x1="0" y1="0" x2="0" y2={-normalVector} stroke="#3b82f6" strokeWidth="3" markerEnd="url(#arrow-blue)" />
            <text x="10" y={-normalVector - 5} fill="#3b82f6" fontSize="12" className="font-black select-none italic">N</text>
          </motion.g>

          {/* Friction Vector */}
          {sim.frictionAccel > 0 && (
            <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <line 
                x1={-cartSize/2} 
                y1={-cartSize/2} 
                x2={-cartSize/2 - frictionVector} 
                y2={-cartSize/2} 
                stroke="#10b981" 
                strokeWidth="3" 
                markerEnd="url(#arrow-green)" 
              />
              <text x={-cartSize/2 - frictionVector - 15} y={-cartSize/2 - 10} fill="#10b981" fontSize="12" className="font-black select-none italic">f</text>
            </motion.g>
          )}

          {/* Velocity Vector (Front of cart) */}
          {sim.velocity > 0 && (
            <line 
              x1={cartSize/2} 
              y1={-cartSize/2} 
              x2={cartSize/2 + (sim.velocity * 12)} 
              y2={-cartSize/2} 
              stroke="#f59e0b" 
              strokeWidth="4" 
              strokeLinecap="round"
              markerEnd="url(#arrow-orange)" 
            />
          )}
        </g>

        {/* Floating Data Display */}
        <foreignObject x="30" y="30" width="240" height="150">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="rounded-lg border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur"
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Lab Telemetry</h4>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-400">T</span>
                <span className="text-sm font-black text-slate-900 tabular-nums">{sim.time.toFixed(2)}s</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-400">V</span>
                <span className="text-sm font-black text-blue-600 tabular-nums">{sim.velocity.toFixed(2)} <small className="text-[10px] text-slate-400">m/s</small></span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-400">A</span>
                <span className="text-sm font-black text-slate-900 tabular-nums">{sim.acceleration.toFixed(2)} <small className="text-[10px] text-slate-400">m/s^2</small></span>
              </div>
            </div>
          </motion.div>
        </foreignObject>
      </svg>
      
      {/* Simulation Watermark */}
      <div className="absolute bottom-6 right-8 text-[10px] font-black text-slate-300 uppercase tracking-widest pointer-events-none select-none">
        Simulated in STEMotion v0.1
      </div>
    </div>
  );
}
