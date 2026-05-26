'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot, FileJson2, Loader2, Send, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAssistantStore } from '@/lib/stores/assistantStore';
import { useExperimentStore } from '@/lib/stores/experimentStore';
import FormulaPanel from './FormulaPanel';
import ParameterPanel from './ParameterPanel';
import QuizPanel from './QuizPanel';

export default function AssistantPanel() {
  const { messages, currentNarration, addMessage } = useAssistantStore();
  const generatedSummary = useAssistantStore((state) => state.generatedSummary);
  const setGeneratedSummary = useAssistantStore((state) => state.setGeneratedSummary);
  const { loadExperiment } = useExperimentStore();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, currentNarration, loading]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userPrompt = input.trim();
    addMessage({ role: 'user', content: userPrompt });
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userPrompt }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorData.error || '生成失败，请稍后重试。');
      }

      const config = await response.json();
      loadExperiment(config);
      setGeneratedSummary(`${config.title}: ${config.description}`);
      addMessage({
        role: 'assistant',
        content: `已生成实验「${config.title}」。你可以在中间舞台操作动画，也可以点击播放按钮查看教师讲解步骤。`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '生成失败，请稍后重试。';
      addMessage({
        role: 'assistant',
        content: `生成失败：${message}`,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative z-30 flex h-full flex-col overflow-hidden border-l border-slate-200 bg-white text-slate-900 shadow-xl">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/50 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
          <Bot size={20} />
        </div>
        <div>
          <h3 className="text-sm font-bold">{t('common.ai_tutor')}</h3>
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Agent ready</span>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="custom-scrollbar flex flex-1 flex-col gap-5 overflow-y-auto p-4 scroll-smooth">
        <ParameterPanel />

        {generatedSummary && (
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              <FileJson2 size={15} />
              <span>生成实验摘要</span>
            </div>
            <p className="text-sm leading-relaxed text-slate-700">{generatedSummary}</p>
          </section>
        )}

        <FormulaPanel />
        <QuizPanel />

        <AnimatePresence mode="wait">
          {currentNarration && (
            <motion.div
              key={currentNarration}
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="relative overflow-hidden rounded-lg bg-blue-600 p-4 text-white shadow-sm"
            >
              <div className="absolute right-0 top-0 p-2 opacity-20">
                <Sparkles size={40} />
              </div>
              <p className="relative z-10 text-sm font-medium leading-relaxed">{currentNarration}</p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-4 flex flex-col gap-4">
          {messages.map((msg) => (
            <motion.div
              initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
              animate={{ opacity: 1, x: 0 }}
              key={msg.id}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-sm ${
                  msg.role === 'user' ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-blue-600'
                }`}
              >
                {msg.role === 'user' ? 'U' : <Bot size={18} />}
              </div>
              <div
                className={`max-w-[85%] rounded-lg p-3.5 text-[13px] leading-relaxed shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-slate-800 text-white'
                    : 'border border-slate-100 bg-white text-slate-700'
                }`}
              >
                {msg.content}
              </div>
            </motion.div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 shadow-sm">
                <Loader2 size={18} className="animate-spin" />
              </div>
              <div className="rounded-lg border border-slate-100 bg-white p-3.5 text-xs italic text-slate-400 shadow-sm">
                Agent 正在规划实验、生成互动动画和教师讲解...
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-slate-100 bg-white p-4 pb-6">
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleSend()}
            disabled={loading}
            placeholder="输入一个 STEM 主题，例如：生成一个酸碱滴定实验"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-3.5 pl-5 pr-12 text-sm outline-none transition-all placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || loading}
            aria-label="生成实验"
            className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md bg-blue-600 text-white shadow-md transition-all hover:bg-blue-700 disabled:bg-slate-200"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
        <p className="mt-3 text-center text-[10px] font-medium uppercase tracking-widest text-slate-400">
          Structured experiment generation
        </p>
      </div>
    </div>
  );
}
