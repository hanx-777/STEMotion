'use client';

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface ProfileInfo {
  id: string;
  label: string;
}

export default function ModelProfileSwitcher() {
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    const loadProfiles = () => {
      fetch('/api/v1/model-profiles')
        .then((res) => res.json())
        .then((data) => {
          setProfiles(data.profiles ?? []);
          setActiveProfile(data.activeProfile ?? null);
        })
        .catch(() => {});
    };

    loadProfiles();
    window.addEventListener('model-profiles:changed', loadProfiles);
    return () => window.removeEventListener('model-profiles:changed', loadProfiles);
  }, []);

  const handleSwitch = async (id: string) => {
    setSwitching(true);
    setOpen(false);
    try {
      const res = await fetch('/api/v1/model-profiles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeProfile: id }),
      });
      if (res.ok) {
        setActiveProfile(id);
      }
    } finally {
      setSwitching(false);
    }
  };

  if (profiles.length === 0) return null;

  const activeLabel = profiles.find((p) => p.id === activeProfile)?.label ?? 'Unknown';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={switching}
        className="flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--stemotion-border)] bg-[var(--stemotion-surface-strong)] px-3 py-1.5 text-xs font-medium text-[var(--stemotion-muted)] transition-all hover:border-teal-200 hover:bg-[var(--stemotion-primary-soft)] hover:text-[var(--stemotion-primary-strong)] disabled:opacity-50"
      >
        <span className="h-2 w-2 rounded-full bg-[var(--stemotion-primary)] shadow-[0_0_0_3px_rgba(15,118,110,0.12)]" />
        <span className="max-w-[150px] truncate">当前模型：{activeLabel}</span>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 min-w-[200px] rounded-lg border border-[var(--stemotion-border)] bg-[var(--stemotion-surface-strong)] py-1 shadow-[var(--stemotion-shadow)]">
            {profiles.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSwitch(p.id)}
                className={`flex min-h-10 w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--stemotion-primary-soft)] ${
                  p.id === activeProfile ? 'font-semibold text-[var(--stemotion-primary-strong)]' : 'text-slate-600'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${p.id === activeProfile ? 'bg-[var(--stemotion-primary)]' : 'bg-slate-300'}`}
                />
                {p.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
