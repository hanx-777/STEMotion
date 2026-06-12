import katex from 'katex';

export interface LatexFormula {
  raw: string;
  latex: string;
  displayMode: boolean;
  start: number;
  end: number;
}

export interface LatexRenderResult {
  ok: boolean;
  html?: string;
  error?: string;
}

export function renderLatexToString(latex: string, displayMode: boolean): LatexRenderResult {
  const normalized = normalizeLatexForRendering(latex);
  try {
    return {
      ok: true,
      html: katex.renderToString(normalized, {
        displayMode,
        throwOnError: false,
        trust: false,
      }),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function validateLatexFormula(formula: LatexFormula): LatexRenderResult {
  const normalized = normalizeLatexForRendering(formula.latex);
  try {
    katex.renderToString(normalized, {
      displayMode: formula.displayMode,
      throwOnError: true,
      trust: false,
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function normalizeLatexForRendering(value: string): string {
  let normalized = value.trim();
  normalized = normalizeDoubleEscapedLatex(normalized);

  for (let index = 0; index < 3; index += 1) {
    const stripped = stripWrappingDelimiter(normalized);
    if (stripped === normalized) break;
    normalized = normalizeDoubleEscapedLatex(stripped.trim());
  }

  return normalized
    .replace(/²/g, '^2')
    .replace(/₀/g, '_0')
    .replace(/₁/g, '_1')
    .replace(/₂/g, '_2')
    .replace(/θ/g, '\\theta')
    .trim();
}

export function normalizeLatexDelimitersInText(value: string): string {
  const fixedDelimiters = value.replace(/\\\\([\[\]()])/g, '\\$1');
  return normalizePlainTextMath(fixedDelimiters);
}

export function extractLatexFormulas(text: string): LatexFormula[] {
  const formulas: LatexFormula[] = [];
  let index = 0;

  while (index < text.length) {
    const displayDoubleSlash = readDelimitedFormula(text, index, '\\\\[', '\\\\]', true);
    if (displayDoubleSlash) {
      formulas.push(displayDoubleSlash);
      index = displayDoubleSlash.end;
      continue;
    }

    const displaySlash = readDelimitedFormula(text, index, '\\[', '\\]', true);
    if (displaySlash) {
      formulas.push(displaySlash);
      index = displaySlash.end;
      continue;
    }

    const displayDollar = readDelimitedFormula(text, index, '$$', '$$', true);
    if (displayDollar) {
      formulas.push(displayDollar);
      index = displayDollar.end;
      continue;
    }

    const inlineDoubleSlash = readDelimitedFormula(text, index, '\\\\(', '\\\\)', false);
    if (inlineDoubleSlash) {
      formulas.push(inlineDoubleSlash);
      index = inlineDoubleSlash.end;
      continue;
    }

    const inlineSlash = readDelimitedFormula(text, index, '\\(', '\\)', false);
    if (inlineSlash) {
      formulas.push(inlineSlash);
      index = inlineSlash.end;
      continue;
    }

    const inlineDollar = readSingleDollarFormula(text, index);
    if (inlineDollar) {
      formulas.push(inlineDollar);
      index = inlineDollar.end;
      continue;
    }

    index += 1;
  }

  return formulas;
}

export function textOutsideLatexFormulas(text: string, formulas: LatexFormula[] = extractLatexFormulas(text)): string {
  if (formulas.length === 0) return text;
  let cursor = 0;
  let result = '';
  for (const formula of formulas) {
    result += text.slice(cursor, formula.start);
    cursor = formula.end;
  }
  return `${result}${text.slice(cursor)}`;
}

export function findBareLatexArtifacts(text: string): string[] {
  const outside = textOutsideLatexFormulas(text);
  const artifacts = new Set<string>();
  for (const matched of outside.matchAll(/\\(?:frac|text|sin|cos|theta|cdot|sqrt|approx|left|right|mathrm|times)|\\\[|\\\]|\\\(|\\\)/g)) {
    artifacts.add(matched[0]);
  }
  return [...artifacts];
}

/**
 * Convert common plain-text math patterns to LaTeX in non-formula text.
 * Only transforms text outside existing LaTeX delimiters to avoid corrupting valid formulas.
 */
export function normalizePlainTextMath(text: string): string {
  const formulas = extractLatexFormulas(text);
  if (formulas.length === 0) {
    return applyPlainTextTransforms(text);
  }

  let result = '';
  let cursor = 0;
  for (const formula of formulas) {
    const segment = text.slice(cursor, formula.start);
    result += applyPlainTextTransforms(segment);
    result += formula.raw;
    cursor = formula.end;
  }
  result += applyPlainTextTransforms(text.slice(cursor));
  return result;
}

function applyPlainTextTransforms(text: string): string {
  const codeBlocks: string[] = [];
  let processed = text.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });
  processed = processed.replace(/`[^`]+`/g, (match) => {
    codeBlocks.push(match);
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });

  // e^(-x^2) → e^{-x^2}
  processed = processed.replace(/\be\^\(([^)]+)\)/g, 'e^{$1}');

  // sqrt(x) → \sqrt{x}
  processed = processed.replace(/\bsqrt\(([^)]+)\)/g, '\\sqrt{$1}');

  // x^2 → x^{2}, a_n → a_{n} (single char base, skip if preceded by -{ or {)
  processed = processed.replace(/(?<![-{])([a-zA-Z])\^(\d+|[a-zA-Z])\b/g, '$1^{$2}');
  processed = processed.replace(/(?<![-{])([a-zA-Z])_(\d+|[a-zA-Z])\b/g, '$1_{$2}');

  processed = processed.replace(/__CODE_BLOCK_(\d+)__/g, (_, index) => codeBlocks[Number(index)]);
  return processed;
}

function readDelimitedFormula(
  text: string,
  start: number,
  open: string,
  close: string,
  displayMode: boolean,
): LatexFormula | undefined {
  if (!text.startsWith(open, start)) return undefined;
  const contentStart = start + open.length;
  const contentEnd = text.indexOf(close, contentStart);
  if (contentEnd < 0) return undefined;
  const end = contentEnd + close.length;
  return {
    raw: text.slice(start, end),
    latex: normalizeLatexForRendering(text.slice(contentStart, contentEnd)),
    displayMode,
    start,
    end,
  };
}

function readSingleDollarFormula(text: string, start: number): LatexFormula | undefined {
  if (text[start] !== '$' || text[start + 1] === '$') return undefined;
  let cursor = start + 1;
  while (cursor < text.length) {
    if (text[cursor] === '\n') return undefined;
    if (text[cursor] === '$' && text[cursor - 1] !== '\\' && text[cursor + 1] !== '$') {
      return {
        raw: text.slice(start, cursor + 1),
        latex: normalizeLatexForRendering(text.slice(start + 1, cursor)),
        displayMode: false,
        start,
        end: cursor + 1,
      };
    }
    cursor += 1;
  }
  return undefined;
}

function normalizeDoubleEscapedLatex(value: string): string {
  return value.replace(/\\\\(?=(?:[a-zA-Z]+|[\[\](){}]))/g, '\\');
}

function stripWrappingDelimiter(value: string): string {
  const pairs: Array<[string, string]> = [
    ['\\[', '\\]'],
    ['\\(', '\\)'],
    ['$$', '$$'],
    ['$', '$'],
  ];

  for (const [open, close] of pairs) {
    if (value.startsWith(open) && value.endsWith(close) && value.length > open.length + close.length) {
      return value.slice(open.length, value.length - close.length);
    }
  }

  return value;
}
