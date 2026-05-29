'use client';

import type React from 'react';
import { BookOpen, GraduationCap, Info, LineChart, Library, Menu, PanelRightClose, PanelRightOpen, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/lib/stores/uiStore';
import { useGsapReveal } from '@/lib/animation/useGsapReveal';
import ModelProfileSwitcher from './ModelProfileSwitcher';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const navRef = useGsapReveal<HTMLElement>({ stagger: 0.06, y: 12, delay: 0.2 });
  const { sidebarOpen, rightPanelOpen, toggleSidebar, toggleRightPanel } = useUIStore();
  const pathname = usePathname();
  const { t, i18n } = useTranslation();

  const toggleLanguage = () => {
    const nextLng = i18n.language.startsWith('zh') ? 'en' : 'zh';
    i18n.changeLanguage(nextLng);
  };

  const navItems = [
    { name: '学生助学', href: '/student', icon: BookOpen },
    { name: '教师助教', href: '/teacher', icon: GraduationCap },
    { name: '可视化演示', href: '/visualization', icon: LineChart },
    { name: '交互库', href: '/interactions', icon: Library },
  ];

  const bottomNavItems = [
    { name: t('common.settings'), href: '/settings', icon: Settings },
    { name: t('common.about'), href: '#', icon: Info },
  ];

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  const headerTitle =
    pathname === '/student' || pathname === '/rag'
      ? '学生助学'
      : pathname === '/teacher'
        ? '教师助教'
        : pathname === '/visualization'
          ? '可视化演示'
          : pathname === '/settings'
            ? '模型与 API 设置'
            : pathname === '/interactions' || pathname === '/experiments'
              ? '交互库'
              : pathname === '/deep-interaction'
                ? '深度交互模式'
                : pathname === '/'
                  ? '实验工作台'
                  : 'STEMotion';

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--stemotion-bg)] font-sans text-[var(--stemotion-ink)] selection:bg-teal-100 selection:text-teal-900">
      <aside
        className={`z-30 hidden flex-col border-r border-[var(--stemotion-border)] bg-[var(--stemotion-surface)] transition-all duration-300 ease-in-out md:flex ${
          sidebarOpen ? 'w-64' : 'w-20'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-[var(--stemotion-border)] px-5">
          {sidebarOpen ? (
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--stemotion-primary)] font-bold text-white shadow-sm">S</div>
              <span className="text-xl font-bold tracking-tight text-[var(--stemotion-ink)]">STEMotion</span>
            </div>
          ) : (
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--stemotion-primary)] font-bold text-white shadow-sm">S</div>
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
                {sidebarOpen && <span className="truncate">{item.name}</span>}
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
                {sidebarOpen && <span className="truncate">{item.name}</span>}
              </Link>
            ))}
            <button
              type="button"
              onClick={toggleSidebar}
              className="group mt-4 flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-slate-500 transition-all hover:bg-[#f5f1e9] hover:text-[var(--stemotion-ink)]"
            >
              <Menu size={22} className="text-slate-400 group-hover:text-[var(--stemotion-primary)]" />
              {sidebarOpen && <span>{t('common.collapse_sidebar')}</span>}
            </button>
          </nav>
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col bg-[var(--stemotion-bg)]">
        <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-[var(--stemotion-border)] bg-[rgba(255,253,248,0.9)] px-4 py-3 backdrop-blur-md md:h-16 md:flex-nowrap md:px-6 md:py-0">
          <div className="flex min-w-0 items-center gap-4">
            <div className="hidden h-8 w-px bg-[var(--stemotion-border)] md:block" />
            <h2 className="truncate text-sm font-semibold text-[var(--stemotion-muted)]">{headerTitle}</h2>
          </div>

          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 md:gap-3">
            <ModelProfileSwitcher />
            <button
              type="button"
              onClick={toggleLanguage}
              className="min-h-9 whitespace-nowrap rounded-lg border border-[var(--stemotion-border)] bg-[var(--stemotion-surface-strong)] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-[var(--stemotion-muted)] transition-all hover:border-teal-200 hover:bg-[var(--stemotion-primary-soft)] hover:text-[var(--stemotion-primary-strong)]"
            >
              中 / EN
            </button>
            <button
              type="button"
              onClick={toggleRightPanel}
              className={`flex min-h-10 items-center gap-2 rounded-lg border p-2 transition-all ${
                rightPanelOpen
                  ? 'border-[var(--stemotion-primary-strong)] bg-[var(--stemotion-primary-strong)] text-white shadow-sm'
                  : 'border-[var(--stemotion-border)] bg-[var(--stemotion-surface-strong)] text-slate-600 hover:border-teal-200 hover:text-[var(--stemotion-primary-strong)]'
              }`}
            >
              {rightPanelOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
              <span className="whitespace-nowrap px-1 text-xs font-bold uppercase tracking-wider">
                {rightPanelOpen ? '退出导师模式' : t('common.open_tutor')}
              </span>
            </button>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </main>
    </div>
  );
}
