import { useEffect } from 'react';
import { useExperimentStore } from '../stores/experimentStore';
import { usePlaybackStore } from '../stores/playbackStore';

const PIXELS_PER_METER = 52;

export interface InclinedPlaneMetrics {
  mass: number;
  angleDegrees: number;
  angleRad: number;
  friction: number;
  gravity: number;
  time: number;
  acceleration: number;
  velocity: number;
  distance: number;
  distancePx: number;
  gParallel: number;
  gPerpendicular: number;
  frictionAccel: number;
}

export function calculateInclinedPlaneMetrics(
  parameters: Record<string, number | boolean | string>,
  time: number,
): InclinedPlaneMetrics {
  const mass = Number(parameters.mass ?? 1);
  const angleDegrees = Number(parameters.angle ?? 30);
  const friction = Number(parameters.friction ?? 0.12);
  const gravity = Number(parameters.gravity ?? 9.8);
  const angleRad = (angleDegrees * Math.PI) / 180;

  const gParallel = gravity * Math.sin(angleRad);
  const gPerpendicular = gravity * Math.cos(angleRad);
  const frictionAccel = friction * gPerpendicular;
  const acceleration = Math.max(0, gParallel - frictionAccel);
  const velocity = acceleration * time;
  const distance = 0.5 * acceleration * time * time;

  return {
    mass,
    angleDegrees,
    angleRad,
    friction,
    gravity,
    time,
    acceleration,
    velocity,
    distance,
    distancePx: distance * PIXELS_PER_METER,
    gParallel,
    gPerpendicular,
    frictionAccel,
  };
}

export function useInclinedPlaneSimulation() {
  const { parameters, simulationActive, tickTime, time } = useExperimentStore();
  const { status, speed } = usePlaybackStore();

  useEffect(() => {
    let lastTime = performance.now();
    let animationFrameId: number;

    const loop = (currentTime: number) => {
      const deltaTime = ((currentTime - lastTime) / 1000) * speed;
      lastTime = currentTime;

      if (simulationActive && (status === 'playing' || status === 'live')) {
        tickTime(deltaTime);
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(animationFrameId);
  }, [simulationActive, status, speed, tickTime]);

  return calculateInclinedPlaneMetrics(parameters, time);
}
