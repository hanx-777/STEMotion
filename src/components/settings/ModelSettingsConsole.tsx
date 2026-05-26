'use client';

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Plus, RefreshCcw, Save, Server, Trash2 } from 'lucide-react';

type Provider = 'openai' | 'anthropic';

interface ProfileSummary {
  id: string;
  label: string;
  provider: Provider;
  baseURL: string;
  model: string;
  timeout?: number;
  hasApiKey: boolean;
  apiKeyPreview: string | null;
}

interface ProfilesResponse {
  activeProfile: string | null;
  profiles: ProfileSummary[];
}

interface ModelOption {
  id: string;
  label: string;
}

interface ProfileForm {
  id: string;
  label: string;
  provider: Provider;
  baseURL: string;
  apiKey: string;
  model: string;
  timeout: string;
}

const PROVIDER_DEFAULTS: Record<Provider, { label: string; baseURL: string; helper: string }> = {
  openai: {
    label: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    helper: 'OpenAI Chat Completions 兼容接口，模型列表使用 /models。',
  },
  anthropic: {
    label: 'Claude',
    baseURL: 'https://api.anthropic.com',
    helper: 'Anthropic Messages API，模型列表使用 /v1/models。',
  },
};

const EMPTY_FORM: ProfileForm = {
  id: '',
  label: '',
  provider: 'openai',
  baseURL: PROVIDER_DEFAULTS.openai.baseURL,
  apiKey: '',
  model: '',
  timeout: '300000',
};

export default function ModelSettingsConsole() {
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [setActiveOnSave, setSetActiveOnSave] = useState(false);
  const [remoteModels, setRemoteModels] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedId) ?? null,
    [profiles, selectedId],
  );

  const providerInfo = PROVIDER_DEFAULTS[form.provider];

  useEffect(() => {
    let mounted = true;

    async function loadInitialProfiles() {
      setLoading(true);
      try {
        const response = await fetch('/api/model-profiles');
        const data = await response.json() as ProfilesResponse;
        if (!mounted) return;

        setProfiles(data.profiles ?? []);
        setActiveProfile(data.activeProfile ?? null);
        const nextProfile = data.profiles?.find((profile) => profile.id === data.activeProfile) ?? data.profiles?.[0] ?? null;
        if (nextProfile) {
          setSelectedId(nextProfile.id);
          setForm({
            id: nextProfile.id,
            label: nextProfile.label,
            provider: nextProfile.provider,
            baseURL: nextProfile.baseURL,
            apiKey: '',
            model: nextProfile.model,
            timeout: nextProfile.timeout ? String(nextProfile.timeout) : '300000',
          });
          setSetActiveOnSave(nextProfile.id === data.activeProfile);
        } else {
          setSelectedId(null);
          setForm({ ...EMPTY_FORM, id: 'openai-profile', label: 'OpenAI Model' });
          setSetActiveOnSave(true);
        }
      } catch {
        if (mounted) setStatus({ type: 'error', message: '模型配置加载失败。' });
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadInitialProfiles();
    return () => {
      mounted = false;
    };
  }, []);

  async function refreshProfiles(preferredId?: string) {
    setLoading(true);
    try {
      const response = await fetch('/api/model-profiles');
      const data = await response.json() as ProfilesResponse;
      setProfiles(data.profiles ?? []);
      setActiveProfile(data.activeProfile ?? null);

      const nextId = preferredId ?? selectedId ?? data.activeProfile ?? data.profiles?.[0]?.id ?? null;
      const nextProfile = data.profiles?.find((profile) => profile.id === nextId) ?? null;
      if (nextProfile) {
        selectProfile(nextProfile, data.activeProfile);
      } else {
        startNewProfile();
      }
    } catch {
      setStatus({ type: 'error', message: '模型配置加载失败。' });
    } finally {
      setLoading(false);
    }
  }

  function selectProfile(profile: ProfileSummary, currentActiveProfile = activeProfile) {
    setSelectedId(profile.id);
    setForm({
      id: profile.id,
      label: profile.label,
      provider: profile.provider,
      baseURL: profile.baseURL,
      apiKey: '',
      model: profile.model,
      timeout: profile.timeout ? String(profile.timeout) : '300000',
    });
    setSetActiveOnSave(profile.id === currentActiveProfile);
    setRemoteModels([]);
    setStatus(null);
  }

  function startNewProfile() {
    const id = nextProfileId('openai');
    setSelectedId(null);
    setForm({
      ...EMPTY_FORM,
      id,
      label: 'OpenAI Model',
    });
    setSetActiveOnSave(profiles.length === 0);
    setRemoteModels([]);
    setStatus(null);
  }

  function updateProvider(provider: Provider) {
    setForm((current) => {
      const shouldReplaceBaseURL = current.baseURL === PROVIDER_DEFAULTS[current.provider].baseURL || !current.baseURL.trim();
      return {
        ...current,
        provider,
        baseURL: shouldReplaceBaseURL ? PROVIDER_DEFAULTS[provider].baseURL : current.baseURL,
        label: current.label || `${PROVIDER_DEFAULTS[provider].label} Model`,
      };
    });
    setRemoteModels([]);
  }

  async function saveProfile() {
    setSaving(true);
    setStatus(null);
    try {
      const response = await fetch('/api/model-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: {
            ...form,
            timeout: form.timeout ? Number(form.timeout) : undefined,
          },
          setActive: setActiveOnSave,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? '保存失败');

      window.dispatchEvent(new Event('model-profiles:changed'));
      setStatus({ type: 'success', message: '模型配置已保存。' });
      await refreshProfiles(form.id);
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : '保存失败' });
    } finally {
      setSaving(false);
    }
  }

  async function activateProfile() {
    if (!selectedId) return;
    setSaving(true);
    setStatus(null);
    try {
      const response = await fetch('/api/model-profiles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeProfile: selectedId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? '启用失败');

      window.dispatchEvent(new Event('model-profiles:changed'));
      setActiveProfile(selectedId);
      setSetActiveOnSave(true);
      setStatus({ type: 'success', message: '当前模型已切换。' });
      await refreshProfiles(selectedId);
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : '启用失败' });
    } finally {
      setSaving(false);
    }
  }

  async function deleteProfile() {
    if (!selectedId) return;
    const confirmed = window.confirm(`删除模型配置 "${selectedId}"？`);
    if (!confirmed) return;

    setSaving(true);
    setStatus(null);
    try {
      const response = await fetch(`/api/model-profiles?id=${encodeURIComponent(selectedId)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? '删除失败');

      window.dispatchEvent(new Event('model-profiles:changed'));
      setStatus({ type: 'success', message: '模型配置已删除。' });
      await refreshProfiles(data.activeProfile ?? undefined);
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : '删除失败' });
    } finally {
      setSaving(false);
    }
  }

  async function loadRemoteModels() {
    if (!form.apiKey.trim()) {
      setStatus({ type: 'error', message: '请先填写 API Key。为安全起见，已保存的密钥不会回填到表单。' });
      return;
    }

    setFetchingModels(true);
    setStatus(null);
    try {
      const response = await fetch('/api/model-profiles/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: form.provider,
          baseURL: form.baseURL,
          apiKey: form.apiKey,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? '获取模型列表失败');

      const models = data.models ?? [];
      setRemoteModels(models);
      if (!form.model && models[0]?.id) {
        setForm((current) => ({ ...current, model: models[0].id }));
      }
      setStatus({ type: 'success', message: `已获取 ${models.length} 个模型。` });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : '获取模型列表失败' });
    } finally {
      setFetchingModels(false);
    }
  }

  function nextProfileId(provider: Provider): string {
    const prefix = provider === 'openai' ? 'openai' : 'claude';
    const base = `${prefix}-profile`;
    if (!profiles.some((profile) => profile.id === base)) return base;
    return `${base}-${profiles.length + 1}`;
  }

  return (
    <div className="stemotion-page custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5 lg:px-6">
      <div className="mx-auto grid w-full max-w-7xl gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="stemotion-elevated rounded-lg p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-[var(--stemotion-primary-strong)]">模型设置</p>
              <h1 className="mt-1 text-xl font-bold text-[var(--stemotion-ink)]">API 与 Profile</h1>
            </div>
            <button
              type="button"
              onClick={startNewProfile}
              className="stemotion-pressable inline-flex min-h-10 items-center gap-2 rounded-lg border border-teal-200 bg-[var(--stemotion-primary-soft)] px-3 text-sm font-semibold text-[var(--stemotion-primary-strong)]"
            >
              <Plus size={16} />
              新建
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {loading ? (
              <p className="rounded-lg border border-dashed border-[var(--stemotion-border)] bg-[#fbfaf6] px-3 py-8 text-center text-sm text-[var(--stemotion-muted)]">
                正在加载模型配置...
              </p>
            ) : profiles.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[var(--stemotion-border)] bg-[#fbfaf6] px-3 py-8 text-center text-sm text-[var(--stemotion-muted)]">
                暂无模型配置，请新建 OpenAI 或 Claude Profile。
              </p>
            ) : (
              profiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => selectProfile(profile)}
                  className={`stemotion-pressable w-full rounded-lg border p-3 text-left transition ${
                    selectedId === profile.id
                      ? 'border-teal-300 bg-[var(--stemotion-primary-soft)] shadow-sm'
                      : 'border-[var(--stemotion-border)] bg-[#fbfaf6] hover:border-teal-200 hover:bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--stemotion-ink)]">{profile.label}</p>
                      <p className="mt-1 truncate text-xs text-[var(--stemotion-muted)]">{profile.model}</p>
                    </div>
                    {profile.id === activeProfile && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">当前</span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-white px-2 py-0.5 font-semibold text-[var(--stemotion-primary-strong)] shadow-sm">
                      {PROVIDER_DEFAULTS[profile.provider].label}
                    </span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[var(--stemotion-muted)] shadow-sm">
                      {profile.hasApiKey ? profile.apiKeyPreview : '未配置 Key'}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="space-y-5">
          <section className="stemotion-elevated rounded-lg p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold text-[var(--stemotion-primary-strong)]">Profile 编辑</p>
                <h2 className="mt-1 text-2xl font-bold text-[var(--stemotion-ink)]">
                  {selectedProfile ? selectedProfile.label : '新建模型配置'}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--stemotion-muted)]">
                  只支持 OpenAI 兼容接口和 Claude Messages API。API Key 只写入本地 model-profiles.json，不会在读取接口中明文返回。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={activateProfile}
                  disabled={!selectedId || selectedId === activeProfile || saving}
                  className="stemotion-pressable inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--stemotion-border)] bg-white px-3 text-sm font-semibold text-[var(--stemotion-ink)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckCircle2 size={16} />
                  设为当前
                </button>
                <button
                  type="button"
                  onClick={deleteProfile}
                  disabled={!selectedId || saving}
                  className="stemotion-pressable inline-flex min-h-10 items-center gap-2 rounded-lg border border-amber-200 bg-[var(--stemotion-amber-soft)] px-3 text-sm font-semibold text-[var(--stemotion-amber)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 size={16} />
                  删除
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <Field label="Profile ID" helper="仅支持字母、数字、点、下划线和连字符。">
                <input
                  value={form.id}
                  onChange={(event) => setForm((current) => ({ ...current, id: event.target.value }))}
                  className={inputClassName}
                  placeholder="openai-profile"
                />
              </Field>
              <Field label="显示名称">
                <input
                  value={form.label}
                  onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
                  className={inputClassName}
                  placeholder="OpenAI GPT-4.1"
                />
              </Field>
              <Field label="接口类型" helper={providerInfo.helper}>
                <select
                  value={form.provider}
                  onChange={(event) => updateProvider(event.target.value as Provider)}
                  className={inputClassName}
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Claude</option>
                </select>
              </Field>
              <Field label="Base URL">
                <input
                  value={form.baseURL}
                  onChange={(event) => setForm((current) => ({ ...current, baseURL: event.target.value }))}
                  className={inputClassName}
                  placeholder={providerInfo.baseURL}
                />
              </Field>
              <Field
                label="API Key"
                helper={selectedProfile?.hasApiKey ? `已保存：${selectedProfile.apiKeyPreview}。留空保存时会保留旧 Key。` : '新建 Profile 必须填写 API Key。'}
              >
                <input
                  value={form.apiKey}
                  onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))}
                  className={inputClassName}
                  placeholder={selectedProfile?.hasApiKey ? '留空则保留已保存密钥' : 'sk-...'}
                  type="password"
                  autoComplete="off"
                />
              </Field>
              <Field label="超时时间 ms">
                <input
                  value={form.timeout}
                  onChange={(event) => setForm((current) => ({ ...current, timeout: event.target.value }))}
                  className={inputClassName}
                  inputMode="numeric"
                  placeholder="300000"
                />
              </Field>
              <Field label="模型" helper="可手动输入，也可以先获取模型列表后选择。">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={form.model}
                    onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
                    list="model-options"
                    className={inputClassName}
                    placeholder={form.provider === 'openai' ? 'gpt-4.1' : 'claude-opus-4-1'}
                  />
                  <button
                    type="button"
                    onClick={loadRemoteModels}
                    disabled={fetchingModels}
                    className="stemotion-pressable inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-teal-200 bg-[var(--stemotion-primary-soft)] px-3 text-sm font-semibold text-[var(--stemotion-primary-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {fetchingModels ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
                    获取模型列表
                  </button>
                </div>
                <datalist id="model-options">
                  {remoteModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </datalist>
              </Field>
              <label className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--stemotion-border)] bg-[#fbfaf6] px-3 text-sm font-semibold text-[var(--stemotion-ink)]">
                <input
                  type="checkbox"
                  checked={setActiveOnSave}
                  onChange={(event) => setSetActiveOnSave(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[var(--stemotion-primary)]"
                />
                保存后设为当前模型
              </label>
            </div>

            {status && (
              <p
                className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
                  status.type === 'success'
                    ? 'border-teal-100 bg-[var(--stemotion-primary-soft)] text-[var(--stemotion-primary-strong)]'
                    : 'border-amber-200 bg-[var(--stemotion-amber-soft)] text-[var(--stemotion-amber)]'
                }`}
                role={status.type === 'error' ? 'alert' : 'status'}
              >
                {status.message}
              </p>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={saveProfile}
                disabled={saving}
                className="stemotion-pressable inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--stemotion-primary)] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--stemotion-primary-strong)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
                保存配置
              </button>
            </div>
          </section>

          <section className="stemotion-panel rounded-lg p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--stemotion-ink)]">
              <Server size={17} />
              接口说明
            </h3>
            <div className="mt-3 grid gap-3 text-sm leading-6 text-[var(--stemotion-muted)] md:grid-cols-2">
              <p className="rounded-lg border border-[var(--stemotion-border)] bg-[#fbfaf6] p-3">
                <strong className="text-[var(--stemotion-ink)]">OpenAI</strong> 使用 Bearer Token 调用 Base URL 下的 <code>/models</code>，生成链路继续走 Chat Completions 兼容格式。
              </p>
              <p className="rounded-lg border border-[var(--stemotion-border)] bg-[#fbfaf6] p-3">
                <strong className="text-[var(--stemotion-ink)]">Claude</strong> 使用 <code>x-api-key</code> 与 <code>anthropic-version</code> 调用 <code>/v1/models</code>，生成链路继续走 Messages API。
              </p>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function Field({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-[var(--stemotion-ink)]">
      {label}
      <div className="mt-1">{children}</div>
      {helper && <span className="mt-1 block text-xs font-normal leading-5 text-[var(--stemotion-muted)]">{helper}</span>}
    </label>
  );
}

const inputClassName = 'h-11 w-full rounded-lg border border-[var(--stemotion-border)] bg-[#fbfaf6] px-3 text-sm text-[var(--stemotion-ink)] transition focus:border-[var(--stemotion-primary)] focus:bg-white';
