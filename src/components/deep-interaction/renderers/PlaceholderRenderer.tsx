'use client';

export default function PlaceholderRenderer({ title }: { title: string }) {
  return (
    <div className="flex h-full min-h-[520px] items-center justify-center bg-slate-50 p-8 text-center">
      <div className="max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-black">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          这个交互产物已经生成结构化数据，渲染器将在后续版本继续增强。
        </p>
      </div>
    </div>
  );
}
