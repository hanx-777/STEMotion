'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { learningPlatformMotion } from './motionTokens';

export function useGsapTimeline(deps: unknown[] = []) {
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    const mm = gsap.matchMedia();

    mm.add('(prefers-reduced-motion: no-preference)', () => {
      tlRef.current = gsap.timeline({
        defaults: {
          duration: learningPlatformMotion.duration.item,
          ease: learningPlatformMotion.ease.standard,
          overwrite: 'auto',
        },
      });

      return () => {
        tlRef.current?.kill();
        tlRef.current = null;
      };
    });

    return () => mm.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return tlRef;
}
