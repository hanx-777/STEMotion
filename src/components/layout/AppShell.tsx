'use client';

import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { BookOpen, Database, GraduationCap, Languages, LineChart, Library, Menu, Settings } from 'lucide-react';
import gsap from 'gsap';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/lib/stores/uiStore';
import { useGsapReveal } from '@/lib/animation/useGsapReveal';
import { learningPlatformMotion } from '@/lib/animation/motionTokens';
import ModelProfileSwitcher from './ModelProfileSwitcher';

const SIDEBAR_COLLAPSED_WIDTH = 80;
const SIDEBAR_DEFAULT_WIDTH = 256;
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 380;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const navRef = useGsapReveal<HTMLElement>({ stagger: 0.06, y: 12, delay: 0.2 });
  const headerControlsRef = useGsapReveal<HTMLDivElement>({
    stagger: learningPlatformMotion.stagger.tight,
    duration: learningPlatformMotion.duration.item,
    y: 8,
    delay: 0.12,
  });
  const titleRef = useRef<HTMLHeadingElement>(null);
  const sidebarResizeCleanupRef = useRef<(() => void) | null>(null);
  const sidebarWidthRef = useRef(SIDEBAR_DEFAULT_WIDTH);
  const { sidebarOpen, sidebarWidth, toggleSidebar, setSidebarOpen, setSidebarWidth } = useUIStore();
  const pathname = usePathname();
  const { t, i18n } = useTranslation();
  const [isHydrated, setIsHydrated] = useState(false);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsHydrated(true);
  }, []);

  useEffect(() => () => {
    sidebarResizeCleanupRef.current?.();
  }, []);

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  const toggleLanguage = () => {
    const nextLng = i18n.language.startsWith('zh') ? 'en' : 'zh';
    i18n.changeLanguage(nextLng);
  };

  const handleSidebarResizeStart = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();

    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startWidth = sidebarOpen ? sidebarWidth : SIDEBAR_COLLAPSED_WIDTH;

    setSidebarOpen(true);
    setIsResizingSidebar(true);
    handle.setPointerCapture(pointerId);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = clamp(startWidth + moveEvent.clientX - startX, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH);
      sidebarWidthRef.current = nextWidth;
      setSidebarWidth(nextWidth);
    };

    const cleanupResizeListeners = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishResize);
      window.removeEventListener('pointercancel', finishResize);
      try {
        handle.releasePointerCapture(pointerId);
      } catch {
        // The pointer may already be released by the browser.
      }
      sidebarResizeCleanupRef.current = null;
    };

    const finishResize = () => {
      setIsResizingSidebar(false);
      cleanupResizeListeners();
    };

    sidebarResizeCleanupRef.current = cleanupResizeListeners;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishResize);
    window.addEventListener('pointercancel', finishResize);
  };

  const navItems = [
    { name: '学生学习', href: '/learn', icon: BookOpen },
    { name: '教师教学', href: '/teach', icon: GraduationCap },
    { name: '可视化实验', href: '/lab', icon: LineChart },
    { name: '知识库', href: '/knowledge', icon: Database },
    { name: '教学资产', href: '/assets', icon: Library },
  ];

  const bottomNavItems = [
    { name: t('common.settings'), href: '/settings', icon: Settings },
  ];

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
  const isRagSurface = pathname === '/learn' || pathname === '/teach' || pathname === '/student' || pathname === '/teacher' || pathname === '/rag';

  const headerTitle =
    pathname === '/learn' || pathname === '/student' || pathname === '/rag'
      ? '学生学习'
      : pathname === '/teach' || pathname === '/teacher'
        ? '教师教学'
        : pathname === '/lab' || pathname === '/visualization'
          ? '可视化实验'
          : pathname === '/knowledge'
            ? '知识库健康度'
            : pathname === '/settings'
              ? '模型与 API 设置'
              : pathname === '/assets' || pathname === '/interactions' || pathname === '/experiments' || pathname === '/player'
                ? '教学资产'
                : pathname === '/deep-interaction'
                  ? '深度交互模式'
                  : pathname === '/'
                    ? '实验工作台'
                    : '学科智引';

  useEffect(() => {
    const title = titleRef.current;
    if (!title) return;

    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const tween = gsap.fromTo(
        title,
        { autoAlpha: 0, y: 5 },
        {
          autoAlpha: 1,
          y: 0,
          duration: learningPlatformMotion.duration.quick,
          ease: learningPlatformMotion.ease.standard,
          overwrite: 'auto',
        },
      );
      return () => {
        tween.kill();
      };
    });

    return () => mm.revert();
  }, [headerTitle]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--stemotion-bg)] font-sans text-[var(--stemotion-ink)] selection:bg-teal-100 selection:text-teal-900">
      <aside
        className={`z-30 hidden shrink-0 flex-col border-r border-[var(--stemotion-border)] bg-[var(--stemotion-surface)] md:flex ${
          isResizingSidebar ? '' : 'transition-[width] duration-300 ease-in-out'
        }`}
        style={{ width: sidebarOpen ? sidebarWidth : SIDEBAR_COLLAPSED_WIDTH }}
      >
        <div className="flex h-16 items-center justify-between border-b border-[var(--stemotion-border)] px-5">
          {sidebarOpen ? (
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--stemotion-primary)] font-bold text-white shadow-sm">智</div>
              <span className="text-xl font-bold tracking-tight text-[var(--stemotion-ink)]">学科智引</span>
            </div>
          ) : (
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--stemotion-primary)] font-bold text-white shadow-sm">智</div>
          )}
        </div>

        <div className="flex flex-1 flex-col justify-between py-6">
          <nav ref={navRef} className="space-y-1.5 px-3">
            {navItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                aria-current={isActive(item.href) ? 'page' : undefined}
                className={`group flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2.5 transition-all ${
                  isActive(item.href)
                    ? 'border-teal-200 bg-[var(--stemotion-primary-soft)] font-semibold text-[var(--stemotion-primary-strong)] shadow-sm'
                    : 'border-transparent text-slate-500 hover:bg-[#f5f1e9] hover:text-[var(--stemotion-ink)]'
                }`}
              >
                <item.icon
                  size={22}
                  className={isActive(item.href) ? 'text-[var(--stemotion-primary)]' : 'text-slate-400 group-hover:text-[var(--stemotion-primary)]'}
                />
                {isHydrated && sidebarOpen && <span className="truncate">{item.name}</span>}
              </Link>
            ))}
          </nav>

          <nav className="space-y-1.5 border-t border-[var(--stemotion-border)] px-3 pt-6">
            {bottomNavItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="group flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-slate-500 transition-all hover:bg-[#f5f1e9] hover:text-[var(--stemotion-ink)]"
              >
                <item.icon size={22} className="text-slate-400 group-hover:text-[var(--stemotion-primary)]" />
                {isHydrated && sidebarOpen && <span className="truncate">{item.name}</span>}
              </Link>
            ))}
            <button
              type="button"
              data-sidebar-language-toggle
              onClick={toggleLanguage}
              className="group flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-slate-500 transition-all hover:bg-[#f5f1e9] hover:text-[var(--stemotion-ink)]"
            >
              <Languages size={22} className="text-slate-400 group-hover:text-[var(--stemotion-primary)]" />
              {isHydrated && sidebarOpen && <span className="truncate">中文 / EN</span>}
            </button>
            <button
              type="button"
              onClick={toggleSidebar}
              className="group mt-4 flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-slate-500 transition-all hover:bg-[#f5f1e9] hover:text-[var(--stemotion-ink)]"
            >
              <Menu size={22} className="text-slate-400 group-hover:text-[var(--stemotion-primary)]" />
              {isHydrated && sidebarOpen && <span>{t('common.collapse_sidebar')}</span>}
            </button>
          </nav>
        </div>
      </aside>
      <button
        type="button"
        data-sidebar-resizer
        role="separator"
        aria-label="调整侧边栏宽度"
        aria-orientation="vertical"
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        aria-valuenow={sidebarOpen ? Math.round(sidebarWidth) : SIDEBAR_COLLAPSED_WIDTH}
        onPointerDown={handleSidebarResizeStart}
        className={`group relative z-40 hidden w-2 shrink-0 cursor-col-resize touch-none border-x border-transparent transition-colors md:block ${
          isResizingSidebar ? 'bg-teal-100/80' : 'bg-transparent hover:bg-teal-50/80'
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute left-1/2 top-0 h-full w-px -translate-x-1/2 transition-colors ${
            isResizingSidebar ? 'bg-[var(--stemotion-primary)]' : 'bg-[var(--stemotion-border)] group-hover:bg-[var(--stemotion-primary)]'
          }`}
        />
      </button>

      <main className="relative flex min-w-0 flex-1 flex-col bg-[var(--stemotion-bg)]">
        {!isRagSurface && (
        <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-[var(--stemotion-border)] bg-[rgba(255,253,248,0.9)] px-4 py-3 backdrop-blur-md md:h-16 md:flex-nowrap md:px-6 md:py-0">
          <div className="flex min-w-0 items-center gap-4">
            <div className="hidden h-8 w-px bg-[var(--stemotion-border)] md:block" />
            <h2 ref={titleRef} className="truncate text-sm font-semibold text-[var(--stemotion-muted)]">{headerTitle}</h2>
          </div>

          <div ref={headerControlsRef} className="flex min-w-0 flex-wrap items-center justify-end gap-2 md:gap-3">
            <ModelProfileSwitcher />
          </div>
        </header>
        )}

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </main>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
