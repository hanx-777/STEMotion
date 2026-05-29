import { normalizeLatexDelimitersInText, normalizeLatexForRendering } from './math_render';

export type MarkdownInlineToken =
  | { type: 'text'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'code'; text: string }
  | { type: 'citation'; text: string }
  | { type: 'math_inline'; latex: string; raw: string };

export type MarkdownLiteBlock =
  | { type: 'heading'; level: 3 | 4; tokens: MarkdownInlineToken[] }
  | { type: 'paragraph'; tokens: MarkdownInlineToken[] }
  | { type: 'list'; ordered: boolean; items: MarkdownInlineToken[][] }
  | { type: 'math_block'; latex: string; raw: string };

const INLINE_PATTERN = /(\*\*[^*]+\*\*|`[^`]+`|\\\([\s\S]*?\\\)|\$(?!\$)[^\n$]+\$|\[(?:L|W)\d+\])/g;

export function parseMarkdownLite(content: string, sectionTitle?: string): MarkdownLiteBlock[] {
  const text = normalizeLatexDelimitersInText(stripDuplicateLeadingHeading(content, sectionTitle).replace(/\r\n/g, '\n')).trim();
  if (!text) return [];

  const segments = splitDisplayMath(text);
  if (segments.length > 1 || segments.some((segment) => segment.type === 'math_block')) {
    return segments.flatMap((segment) => {
      if (segment.type === 'math_block') {
        return [{ type: 'math_block', latex: segment.latex, raw: segment.raw } satisfies MarkdownLiteBlock];
      }
      return parseMarkdownTextBlocks(segment.text);
    });
  }

  return parseMarkdownTextBlocks(text);
}

function parseMarkdownTextBlocks(text: string): MarkdownLiteBlock[] {
  const blocks: MarkdownLiteBlock[] = [];
  const lines = text.split('\n');
  let paragraph: string[] = [];
  let listItems: MarkdownInlineToken[][] = [];
  let listOrdered = false;

  const flushParagraph = () => {
    const value = paragraph.join(' ').trim();
    if (value) blocks.push({ type: 'paragraph', tokens: parseInlineMarkdown(value) });
    paragraph = [];
  };

  const flushList = () => {
    if (listItems.length) blocks.push({ type: 'list', ordered: listOrdered, items: listItems });
    listItems = [];
    listOrdered = false;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        type: 'heading',
        level: heading[1].length <= 2 ? 3 : 4,
        tokens: parseInlineMarkdown(heading[2].trim()),
      });
      continue;
    }

    const unordered = /^[-*]\s+(.+)$/.exec(trimmed);
    const ordered = /^\d+[.)]\s+(.+)$/.exec(trimmed);
    if (unordered || ordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      const value = (ordered?.[1] ?? unordered?.[1] ?? '').trim();
      if (listItems.length && listOrdered !== isOrdered) flushList();
      listOrdered = isOrdered;
      listItems.push(parseInlineMarkdown(value));
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  return blocks;
}

function splitDisplayMath(text: string): Array<{ type: 'text'; text: string } | { type: 'math_block'; latex: string; raw: string }> {
  const segments: Array<{ type: 'text'; text: string } | { type: 'math_block'; latex: string; raw: string }> = [];
  let cursor = 0;

  while (cursor < text.length) {
    const slashIndex = text.indexOf('\\[', cursor);
    const dollarIndex = text.indexOf('$$', cursor);
    const starts: Array<{ index: number; open: string; close: string }> = [];
    if (slashIndex >= 0) starts.push({ index: slashIndex, open: '\\[', close: '\\]' });
    if (dollarIndex >= 0) starts.push({ index: dollarIndex, open: '$$', close: '$$' });
    starts.sort((a, b) => a.index - b.index);
    const next = starts[0];
    if (!next) break;

    const contentStart = next.index + next.open.length;
    const contentEnd = text.indexOf(next.close, contentStart);
    if (contentEnd < 0) break;
    if (next.index > cursor) {
      segments.push({ type: 'text', text: text.slice(cursor, next.index) });
    }
    const end = contentEnd + next.close.length;
    segments.push({
      type: 'math_block',
      latex: normalizeLatexForRendering(text.slice(contentStart, contentEnd)),
      raw: text.slice(next.index, end),
    });
    cursor = end;
  }

  if (cursor < text.length) segments.push({ type: 'text', text: text.slice(cursor) });
  return segments.length ? segments : [{ type: 'text', text }];
}

export function stripDuplicateLeadingHeading(content: string, sectionTitle?: string): string {
  if (!sectionTitle) return content;
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const firstContentIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstContentIndex < 0) return content;

  const firstLine = lines[firstContentIndex].trim();
  const heading = /^(?:#{1,6}\s+|\*\*)?(.+?)(?:\*\*)?$/.exec(firstLine);
  if (!heading) return content;

  const normalizedLine = normalizeHeadingText(heading[1]);
  const normalizedTitle = normalizeHeadingText(sectionTitle);
  if (!normalizedLine || !normalizedTitle) return content;

  if (normalizedLine === normalizedTitle || normalizedLine.includes(normalizedTitle)) {
    lines.splice(firstContentIndex, 1);
    return lines.join('\n').trim();
  }

  return content;
}

export function parseInlineMarkdown(value: string): MarkdownInlineToken[] {
  const tokens: MarkdownInlineToken[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) tokens.push({ type: 'text', text: value.slice(lastIndex, index) });

    const raw = match[0];
    if (raw.startsWith('**')) {
      tokens.push({ type: 'strong', text: raw.slice(2, -2) });
    } else if (raw.startsWith('`')) {
      tokens.push({ type: 'code', text: raw.slice(1, -1) });
    } else if (raw.startsWith('\\(')) {
      tokens.push({ type: 'math_inline', raw, latex: normalizeLatexForRendering(raw) });
    } else if (raw.startsWith('$')) {
      tokens.push({ type: 'math_inline', raw, latex: normalizeLatexForRendering(raw) });
    } else {
      tokens.push({ type: 'citation', text: raw });
    }
    lastIndex = index + raw.length;
  }

  if (lastIndex < value.length) tokens.push({ type: 'text', text: value.slice(lastIndex) });
  return tokens.length ? tokens : [{ type: 'text', text: value }];
}

function normalizeHeadingText(value: string): string {
  return value
    .replace(/^[\s#>*-]+/, '')
    .replace(/^\d+[.)、：:\s-]*/, '')
    .replace(/^(第[一二三四五六七八九十]+步[：:\s-]*)/, '')
    .replace(/[*`_\s：:，,。.!！?？-]/g, '')
    .toLowerCase();
}
