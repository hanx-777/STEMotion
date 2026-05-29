'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';

interface UseGsapRevealOptions {
  stagger?: number;
  duration?: number;
  y?: number;
  delay?: number;
}

export function useGsapReveal<T extends HTMLElement>({
  stagger = 0.08,
  duration = 0.5,
  y = 20,
  delay = 0,
}: UseGsapRevealOptions = {}) {
  const containerRef = useRef<T>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const children = Array.from(container.children) as Element[];
    if (children.length === 0) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    gsap.set(children, { opacity: 0, y });
    gsap.to(children, {
      opacity: 1,
      y: 0,
      duration,
      stagger,
      delay,
      ease: 'power2.out',
    });

    return () => {
      gsap.killTweensOf(children);
    };
  }, [stagger, duration, y, delay]);

  return containerRef;
}
