'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';

export function useGsapTimeline(deps: unknown[] = []) {
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    tlRef.current = gsap.timeline();

    return () => {
      tlRef.current?.kill();
      tlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return tlRef;
}
