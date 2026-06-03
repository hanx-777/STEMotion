'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ElementType } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { Box, FlaskConical, Gamepad2, LineChart, Network, Plus, Search, Trash2 } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { useGsapReveal } from '@/lib/animation/useGsapReveal';
import { prefersReducedMotion, stemotionMotion } from '@/lib/animation/motionTokens';
import { interactionTypeMeta, interactionTypeOrder } from '@/lib/deep-interaction/rendererRegistry';
import type { DeepInteractionType, InteractionArtifact } from '@/lib/deep-interaction/types';
import { useArtifactStore } from '@/lib/stores/artifactStore';
import { useDeepInteractionUIStore } from '@/lib/stores/deepInteractionUIStore';
import { useInteractionSessionStore } from '@/lib/stores/interactionSessionStore';

const icons: Record<DeepInteractionType, ElementType> = {
  '3d_visualization': Box,
  simulation: FlaskConical,
  game: Gamepad2,
  mind_map: Network,
  rag_visualization: LineChart,
};

const examples: Array<{
  title: string;
  type: DeepInteractionType;
  description: string;
  prompt: string;
}> = [
  { title: '斜面小车', type: 'simulation', description: '调节角度、摩擦和质量，观察运动变化。', prompt: '生成一个斜面小车运动模拟实验' },
  { title: '并联电路', type: 'simulation', description: '调节电压和电阻，观察电流变化。', prompt: '生成一个并联电路探索器' },
  { title: '酸碱滴定', type: 'simulation', description: '观察中和过程、指示剂颜色和等量点。', prompt: '生成一个酸碱中和滴定动画' },
  { title: '二次函数图像', type: '3d_visualization', description: '观察参数变化如何影响函数图像。', prompt: '生成一个二次函数图像随参数变化的可视化' },
];

export default function InteractionLibraryPage() {
  const pageMotionRef = useGsapReveal<HTMLDivElement>({
    selector: '[data-library-motion]',
    stagger: stemotionMotion.stagger.item,
    duration: stemotionMotion.duration.page,
    y: 14,
    delay: 0.04,
  });
  const artifactGridRef = useRef<HTMLDivElement>(null);
  const artifactsBySession = useArtifactStore((state) => state.artifactsBySession);
  const deleteArtifact = useArtifactStore((state) => state.deleteArtifact);
  const deleteArtifactFromSession = useInteractionSessionStore((state) => state.deleteArtifactFromSession);
  const setCurrentSession = useInteractionSessionStore((state) => state.setCurrentSession);
  const setCurrentArtifact = useInteractionSessionStore((state) => state.setCurrentArtifact);
  const setTypeFilter = useDeepInteractionUIStore((state) => state.setTypeFilter);
  const [query, setQuery] = useState('');
  const [typeFilter, setLocalTypeFilter] = useState<DeepInteractionType | 'all'>('all');

  const artifacts = useMemo(
    () =>
      Object.values(artifactsBySession)
        .flat()
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [artifactsBySession],
  );

  const filteredArtifacts = artifacts.filter((artifact) => {
    const matchesType = typeFilter === 'all' || artifact.type === typeFilter;
    const text = `${artifact.title} ${artifact.description}`.toLowerCase();
    return matchesType && text.includes(query.trim().toLowerCase());
  });

  useEffect(() => {
    const grid = artifactGridRef.current;
    if (!grid || prefersReducedMotion()) return;

    const cards = Array.from(grid.querySelectorAll('[data-library-card]'));
    if (cards.length === 0) return;

    const tween = gsap.fromTo(
      cards,
      { autoAlpha: 0, y: 10, scale: 0.995 },
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: stemotionMotion.duration.item,
        stagger: stemotionMotion.stagger.tight,
        ease: stemotionMotion.ease.standard,
        overwrite: 'auto',
      },
    );

    return () => {
      tween.kill();
    };
  }, [filteredArtifacts.length, query, typeFilter]);

  const remove = (artifact: InteractionArtifact) => {
    const ok = window.confirm(`确定删除“${artifact.title}”吗？删除后无法从本地交互库恢复。`);
    if (!ok) return;
    deleteArtifact(artifact.sessionId, artifact.id);
    deleteArtifactFromSession(artifact.sessionId, artifact.id);
  };

  const openArtifact = (artifact: InteractionArtifact) => {
    setCurrentSession(artifact.sessionId);
    setCurrentArtifact(artifact.sessionId, artifact.id);
  };

  return (
    <AppShell>
      <div className="custom-scrollbar h-full overflow-y-auto bg-slate-50 p-6 text-slate-900">
        <div ref={pageMotionRef} className="mx-auto max-w-7xl">
          <div data-library-motion className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight">交互库</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
                保存你生成过的互动学习页。可以重新打开、继续修改，也可以删除本地记录。
              </p>
            </div>
            <Link
              href="/deep-interaction"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
            >
              <Plus size={17} />
              新建交互
            </Link>
          </div>

          <section data-library-motion className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索交互标题或描述"
                  className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setLocalTypeFilter('all')}
                  className={`h-10 rounded-lg px-3 text-xs font-bold ${
                    typeFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  全部
                </button>
                {interactionTypeOrder.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setLocalTypeFilter(type)}
                    className={`h-10 rounded-lg px-3 text-xs font-bold ${
                      typeFilter === type ? interactionTypeMeta[type].accent : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {interactionTypeMeta[type].label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section data-library-motion className="mb-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-500">我的交互</h2>
              <span className="text-xs font-bold text-slate-400">{filteredArtifacts.length} 个</span>
            </div>
            {filteredArtifacts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
                <p className="text-sm font-bold text-slate-600">还没有保存的交互</p>
                <p className="mt-2 text-xs text-slate-400">去深度交互模式生成一个，它会自动出现在这里。</p>
              </div>
            ) : (
              <div ref={artifactGridRef} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredArtifacts.map((artifact) => (
                  <ArtifactLibraryCard
                    key={artifact.id}
                    artifact={artifact}
                    onOpen={() => openArtifact(artifact)}
                    onDelete={() => remove(artifact)}
                  />
                ))}
              </div>
            )}
          </section>

          <section data-library-motion>
            <h2 className="mb-3 text-sm font-black uppercase tracking-wider text-slate-500">示例交互</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {examples.map((example) => {
                const Icon = icons[example.type];
                return (
                  <Link
                    href={`/deep-interaction?prompt=${encodeURIComponent(example.prompt)}`}
                    key={example.title}
                    onClick={() => setTypeFilter(example.type)}
                    className="rounded-lg border border-slate-200 bg-white p-5 transition hover:border-blue-300 hover:shadow-md"
                  >
                    <div className={`mb-4 inline-flex rounded-lg border p-3 ${interactionTypeMeta[example.type].accent}`}>
                      <Icon size={24} />
                    </div>
                    <div className="text-xs font-black text-slate-400">{interactionTypeMeta[example.type].label}</div>
                    <h3 className="mt-1 text-lg font-black">{example.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-500">{example.description}</p>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function ArtifactLibraryCard({
  artifact,
  onOpen,
  onDelete,
}: {
  artifact: InteractionArtifact;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const meta = interactionTypeMeta[artifact.type];
  const Icon = icons[artifact.type];
  return (
    <article data-library-card className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className={`rounded-lg border p-3 ${meta.accent}`}>
          <Icon size={22} />
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
          aria-label="删除交互"
        >
          <Trash2 size={17} />
        </button>
      </div>
      <div className="flex items-center gap-2 text-xs font-black text-slate-400">
        <span>{meta.label} · v{artifact.version}</span>
        {artifact.finalScore != null && (
          <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-black ${
            artifact.finalScore >= 85 ? 'bg-emerald-100 text-emerald-700' :
            artifact.finalScore >= 70 ? 'bg-amber-100 text-amber-700' :
            'bg-red-100 text-red-700'
          }`}>
            {artifact.qualityReport?.level === 'excellent' ? '优秀' :
             artifact.qualityReport?.level === 'good' ? '良好' :
             artifact.qualityReport?.level === 'usable' ? '可用' :
             artifact.qualityReport?.level === 'needs_improvement' ? '需改进' : '不达标'} {artifact.finalScore}
          </span>
        )}
        {artifact.generationIterations != null && artifact.generationIterations > 1 && (
          <span className="text-[10px] font-medium text-slate-400">{artifact.generationIterations} 轮</span>
        )}
      </div>
      <h3 className="mt-1 line-clamp-1 text-lg font-black">{artifact.title}</h3>
      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-500">{artifact.description}</p>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium text-slate-400">
          {new Date(artifact.updatedAt).toLocaleString('zh-CN')}
        </span>
        <Link
          href="/deep-interaction"
          onClick={onOpen}
          className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100"
        >
          打开
        </Link>
      </div>
    </article>
  );
}
