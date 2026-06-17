'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { learningPlatformMotion } from './motionTokens';

interface UseGsapRevealOptions {
  selector?: string;
  stagger?: number;
  duration?: number;
  x?: number;
  y?: number;
  scale?: number;
  delay?: number;
  ease?: string;
  disabled?: boolean;
}

export function useGsapReveal<T extends HTMLElement>({
  selector,
  stagger = learningPlatformMotion.stagger.item,
  duration = learningPlatformMotion.duration.page,
  x = 0,
  y = 20,
  scale = 1,
  delay = 0,
  ease = learningPlatformMotion.ease.standard,
  disabled = false,
}: UseGsapRevealOptions = {}) {
  const containerRef = useRef<T>(null);

  // Animation runs once on mount (or when selector/disabled changes).
  // Config parameters are captured from closure - this prevents excessive
  // re-animations when parent components re-render with new inline values.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || disabled) return;

    const targets = selector
      ? Array.from(container.querySelectorAll(selector))
      : Array.from(container.children);
    if (targets.length === 0) return;

    const mm = gsap.matchMedia();

    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.set(targets, { autoAlpha: 0, x, y, scale, transformOrigin: '50% 50%' });
      const tween = gsap.to(targets, {
        autoAlpha: 1,
        x: 0,
        y: 0,
        scale: 1,
        duration,
        stagger,
        delay,
        ease,
        overwrite: 'auto',
      });

      return () => {
        tween.kill();
      };
    });

    return () => mm.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selector, disabled]);

  return containerRef;
}
