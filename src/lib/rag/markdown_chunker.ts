import type { KnowledgeChunk, ChunkContentType, ChunkLevel } from './knowledge_chunk_types';
import { estimateTokenCount, makeChunkId } from './knowledge_chunk_types';

interface Section {
  title: string;
  level: number;
  content: string;
  sectionPath: string[];
  startLine: number;
}

interface ChunkerOptions {
  subject: string;
  sourceFile: string;
  targetTokens?: number;
  maxTokens?: number;
  minTokens?: number;
}

const DEFAULT_OPTIONS = {
  targetTokens: 500,
  maxTokens: 900,
  minTokens: 120,
};

function parseMarkdownSections(markdown: string): Section[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const sections: Section[] = [];
  const headingStack: { text: string; level: number }[] = [];
  let currentContent: string[] = [];
  let currentStartLine = 0;

  const flushSection = () => {
    const content = currentContent.join('\n').trim();
    if (!content && headingStack.length === 0) return;
    const sectionPath = headingStack.map((h) => h.text);
    const title = headingStack.length > 0 ? headingStack[headingStack.length - 1].text : '(preamble)';
    sections.push({
      title,
      level: headingStack.length > 0 ? headingStack[headingStack.length - 1].level : 0,
      content,
      sectionPath,
      startLine: currentStartLine,
    });
    currentContent = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      flushSection();
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();

      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }
      headingStack.push({ text, level });
      currentStartLine = i;
    } else {
      currentContent.push(line);
    }
  }
  flushSection();

  return sections.filter((s) => s.content.trim().length > 0 || s.title !== '(preamble)');
}

function detectContentType(text: string): ChunkContentType {
  const trimmed = text.trim();

  if (/^```/.test(trimmed) || /```\w+/.test(trimmed)) return 'code';

  const formulaCount = (trimmed.match(/\\\(|\\\[|\\begin\{/g) ?? []).length;
  if (formulaCount >= 3) return 'formula';

  if (/^(定义|Definition|概念|什么是|指的是|是指)[：:]/.test(trimmed)) return 'definition';

  if (/^(推导|证明|Derivation|Proof|过程|步骤)[：:]/.test(trimmed) || /(?:推导|证明|derivation|proof)/i.test(trimmed.slice(0, 100))) return 'derivation';

  if (/^(例[题子]?|Example|练习|习题|Sample)[：:\s\d]/.test(trimmed)) return 'example';

  if (/^(常见错误|误区|注意|易错|Common\s*(Mistake|Error)|Pitfall|Warning)/i.test(trimmed)) return 'common_mistake';

  if (/^(应用|场景|Application|Use\s*Case|实例)/i.test(trimmed)) return 'application';

  if (/^(总结|小结|Summary|要点|Conclusion)/i.test(trimmed)) return 'summary';

  return 'mixed';
}

function detectLevel(text: string, sectionPath: string[]): ChunkLevel {
  const combined = [...sectionPath, text.slice(0, 200)].join(' ').toLowerCase();
  if (/进阶|advanced|高级|深入|研究生/.test(combined)) return 'advanced';
  if (/基础|basic|入门|初|概|introduction/.test(combined)) return 'basic';
  return 'intermediate';
}

function extractKeywords(text: string, sectionPath: string[]): string[] {
  const keywords = new Set<string>();

  for (const section of sectionPath) {
    keywords.add(section.trim());
  }

  const englishTerms = text.match(/[A-Za-z][A-Za-z-]{2,}/g) ?? [];
  for (const term of englishTerms) {
    keywords.add(term.toLowerCase());
  }

  const cjkTerms = text.match(/[一-鿿]{2,6}/g) ?? [];
  for (const term of cjkTerms) {
    keywords.add(term);
  }

  return [...keywords].slice(0, 20);
}

function extractFormulas(text: string): string[] {
  const formulas: string[] = [];
  const blockMatches = text.matchAll(/\\\[[\s\S]*?\\\]/g);
  for (const m of blockMatches) formulas.push(m[0]);
  const inlineMatches = text.matchAll(/\\\([^)]*\\\)/g);
  for (const m of inlineMatches) formulas.push(m[0]);
  const envMatches = text.matchAll(/\\begin\{[^}]+\}[\s\S]*?\\end\{[^}]+\}/g);
  for (const m of envMatches) formulas.push(m[0]);
  return formulas;
}

function splitLongSection(text: string, maxTokens: number): string[] {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const combined = current ? `${current}\n\n${para}` : para;
    if (estimateTokenCount(combined) > maxTokens && current) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = combined;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks;
}

function mergeShortChunks(texts: string[], minTokens: number): string[] {
  if (texts.length <= 1) return texts;
  const merged: string[] = [];
  let buffer = '';

  for (const text of texts) {
    if (buffer && estimateTokenCount(buffer) < minTokens) {
      buffer = `${buffer}\n\n${text}`;
    } else {
      if (buffer) merged.push(buffer);
      buffer = text;
    }
  }
  if (buffer) merged.push(buffer);

  return merged;
}

/**
 * Chunk a markdown document into structured KnowledgeChunks.
 * Uses heading-based semantic splitting with content-type detection.
 */
export function chunkMarkdown(content: string, options: ChunkerOptions): KnowledgeChunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const topic = options.sourceFile.replace(/\.[^.]+$/, '').replace(/.*\//, '');
  const sections = parseMarkdownSections(content);
  const now = new Date().toISOString();
  const chunks: KnowledgeChunk[] = [];

  // Group by top-level section to maintain context
  const topLevelGroups = new Map<string, Section[]>();
  for (const section of sections) {
    const key = section.sectionPath[0] ?? '(root)';
    const group = topLevelGroups.get(key) ?? [];
    group.push(section);
    topLevelGroups.set(key, group);
  }

  let seqCounter = 0;

  for (const [, groupSections] of topLevelGroups) {
    const groupText = groupSections.map((s) => {
      const prefix = s.title !== '(preamble)' ? `## ${s.title}\n\n` : '';
      return prefix + s.content;
    }).join('\n\n');

    const tokens = estimateTokenCount(groupText);

    if (tokens <= opts.maxTokens) {
      seqCounter++;
      const contentType = detectContentType(groupText);
      const sectionPath = groupSections[0]?.sectionPath ?? [];
      chunks.push({
        id: makeChunkId(options.subject, topic, contentType, seqCounter),
        subject: options.subject,
        topic,
        sourceFile: options.sourceFile,
        sourceType: 'markdown',
        title: groupSections[0]?.title ?? topic,
        sectionPath,
        level: detectLevel(groupText, sectionPath),
        contentType,
        keywords: extractKeywords(groupText, sectionPath),
        prerequisites: [],
        text: groupText.trim(),
        formulas: extractFormulas(groupText).length > 0 ? extractFormulas(groupText) : undefined,
        tokenCount: tokens,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      let subTexts = splitLongSection(groupText, opts.maxTokens);
      subTexts = mergeShortChunks(subTexts, opts.minTokens);

      for (const subText of subTexts) {
        if (estimateTokenCount(subText) < opts.minTokens / 2) continue;
        seqCounter++;
        const contentType = detectContentType(subText);
        const sectionPath = groupSections[0]?.sectionPath ?? [];
        chunks.push({
          id: makeChunkId(options.subject, topic, contentType, seqCounter),
          subject: options.subject,
          topic,
          sourceFile: options.sourceFile,
          sourceType: 'markdown',
          title: groupSections[0]?.title ?? topic,
          sectionPath,
          level: detectLevel(subText, sectionPath),
          contentType,
          keywords: extractKeywords(subText, sectionPath),
          prerequisites: [],
          text: subText.trim(),
          formulas: extractFormulas(subText).length > 0 ? extractFormulas(subText) : undefined,
          tokenCount: estimateTokenCount(subText),
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  // Set relatedChunkIds (chunks from same topic)
  const chunkIds = chunks.map((c) => c.id);
  for (const chunk of chunks) {
    chunk.relatedChunkIds = chunkIds.filter((id) => id !== chunk.id);
  }

  return chunks;
}
