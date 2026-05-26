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
    fetch('/api/model-profiles')
      .then((res) => res.json())
      .then((data) => {
        setProfiles(data.profiles ?? []);
        setActiveProfile(data.activeProfile ?? null);
      })
      .catch(() => {});
  }, []);

  const handleSwitch = async (id: string) => {
    setSwitching(true);
    setOpen(false);
    try {
      const res = await fetch('/api/model-profiles', {
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
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-all hover:bg-slate-50 disabled:opacity-50"
      >
        <span className="h-2 w-2 rounded-full bg-green-400" />
        <span className="max-w-[120px] truncate">{activeLabel}</span>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            {profiles.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSwitch(p.id)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-slate-50 ${
                  p.id === activeProfile ? 'font-semibold text-blue-600' : 'text-slate-600'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${p.id === activeProfile ? 'bg-green-400' : 'bg-slate-300'}`}
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
