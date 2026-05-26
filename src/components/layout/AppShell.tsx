'use client';

import type React from 'react';
import { Beaker, Info, Library, Menu, PanelRightClose, PanelRightOpen, Settings, Sparkles } from 'lucide-react';
import ModelProfileSwitcher from './ModelProfileSwitcher';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/lib/stores/uiStore';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, rightPanelOpen, toggleSidebar, toggleRightPanel } = useUIStore();
  const pathname = usePathname();
  const { t, i18n } = useTranslation();

  const toggleLanguage = () => {
    const nextLng = i18n.language.startsWith('zh') ? 'en' : 'zh';
    i18n.changeLanguage(nextLng);
  };

  const navItems = [
    { name: '实验工作台', href: '/', icon: Beaker },
    { name: '深度交互', href: '/deep-interaction', icon: Sparkles },
    { name: '交互库', href: '/interactions', icon: Library },
  ];

  const bottomNavItems = [
    { name: t('common.settings'), href: '#', icon: Settings },
    { name: t('common.about'), href: '#', icon: Info },
  ];

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  const headerTitle =
    pathname === '/deep-interaction'
      ? '深度交互模式'
      : pathname === '/interactions' || pathname === '/experiments'
        ? '交互库'
        : '实验工作台';

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 font-sans text-slate-900 selection:bg-blue-100 selection:text-blue-700">
      <aside
        className={`z-30 flex flex-col border-r border-slate-200 bg-white transition-all duration-300 ease-in-out ${
          sidebarOpen ? 'w-64' : 'w-20'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-100 px-5">
          {sidebarOpen ? (
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 font-bold text-white">S</div>
              <span className="text-xl font-bold tracking-tight text-slate-900">STEMotion</span>
            </div>
          ) : (
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 font-bold text-white">S</div>
          )}
        </div>

        <div className="flex flex-1 flex-col justify-between py-6">
          <nav className="space-y-1.5 px-3">
            {navItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                aria-current={isActive(item.href) ? 'page' : undefined}
                className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${
                  isActive(item.href)
                    ? 'bg-blue-50 font-semibold text-blue-600'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <item.icon
                  size={22}
                  className={isActive(item.href) ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}
                />
                {sidebarOpen && <span className="truncate">{item.name}</span>}
              </Link>
            ))}
          </nav>

          <nav className="space-y-1.5 border-t border-slate-100 px-3 pt-6">
            {bottomNavItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-900"
              >
                <item.icon size={22} className="text-slate-400 group-hover:text-slate-600" />
                {sidebarOpen && <span className="truncate">{item.name}</span>}
              </Link>
            ))}
            <button
              type="button"
              onClick={toggleSidebar}
              className="group mt-4 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-900"
            >
              <Menu size={22} className="text-slate-400 group-hover:text-slate-600" />
              {sidebarOpen && <span>{t('common.collapse_sidebar')}</span>}
            </button>
          </nav>
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col bg-slate-50">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 px-6 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <div className="hidden h-8 w-px bg-slate-200 md:block" />
            <h2 className="hidden text-sm font-medium text-slate-500 md:block">{headerTitle}</h2>
          </div>

          <div className="flex items-center gap-3">
            <ModelProfileSwitcher />
            <button
              type="button"
              onClick={toggleLanguage}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 transition-all hover:bg-slate-50"
            >
              {i18n.language.startsWith('zh') ? 'English' : '中文'}
            </button>
            <button
              type="button"
              onClick={toggleRightPanel}
              className={`flex items-center gap-2 rounded-xl border p-2 transition-all ${
                rightPanelOpen
                  ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              {rightPanelOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
              <span className="px-1 text-xs font-bold uppercase tracking-wider">
                {rightPanelOpen ? t('common.close_tutor') : t('common.open_tutor')}
              </span>
            </button>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </main>
    </div>
  );
}
