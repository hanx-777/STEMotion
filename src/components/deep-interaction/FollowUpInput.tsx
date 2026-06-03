'use client';

import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';

export default function FollowUpInput({
  disabled,
  loading = false,
  onSubmit,
}: {
  disabled?: boolean;
  loading?: boolean;
  onSubmit: (prompt: string) => void;
}) {
  const [value, setValue] = useState('');

  const isDisabled = disabled || loading;

  const submit = () => {
    if (!value.trim() || isDisabled) return;
    onSubmit(value);
    setValue('');
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <label htmlFor="follow-up-input" className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-400">
        {loading ? '正在修改中...' : '继续追问与修改'}
      </label>
      {loading && (
        <div className="mb-3 flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700">
          <Loader2 className="animate-spin" size={14} />
          模型正在根据你的要求修改交互页面，请稍候...
        </div>
      )}
      <div className="flex gap-2">
        <input
          id="follow-up-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && submit()}
          disabled={isDisabled}
          placeholder="例如：把摩擦系数调大一点"
          className="h-11 min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim() || isDisabled}
          aria-label="发送追问"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-slate-700 disabled:bg-slate-200 disabled:text-slate-400"
        >
          {loading ? <Loader2 className="animate-spin" size={17} /> : <Send size={17} />}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {['增加速度-时间图像', '加一个选择题', '换成思维导图', '解释为什么质量不影响加速度'].map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => { onSubmit(item); setValue(''); }}
            disabled={isDisabled}
            className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
          >
            {item}
          </button>
        ))}
      </div>
    </section>
  );
}
