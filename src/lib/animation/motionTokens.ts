'use client';

export const stemotionMotion = {
  duration: {
    quick: 0.18,
    item: 0.32,
    page: 0.46,
    emphasis: 0.62,
  },
  ease: {
    standard: 'power2.out',
    settle: 'power3.out',
    emphasis: 'back.out(1.35)',
  },
  stagger: {
    tight: 0.035,
    item: 0.055,
    relaxed: 0.08,
  },
} as const;

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
