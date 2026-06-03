import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizePlainTextMath,
  renderLatexToString,
} from '../src/lib/rag/math_render';
import { parseMarkdownLite } from '../src/lib/rag/markdown_lite';

test('normalizePlainTextMath converts e^(-x^2) to e^{-x^2}', () => {
  const input = 'f(x) = x e^(-x^2)';
  const result = normalizePlainTextMath(input);
  assert.ok(result.includes('e^{-x^2}'), `expected e^{-x^2} in result: ${result}`);
  assert.ok(!result.includes('e^(-x^2)'), `expected no e^(-x^2) in result: ${result}`);
});

test('normalizePlainTextMath converts sqrt(x) to \\sqrt{x}', () => {
  const input = 'y = sqrt(x) + 1';
  const result = normalizePlainTextMath(input);
  assert.ok(result.includes('\\sqrt{x}'), `expected \\sqrt{x} in result: ${result}`);
});

test('normalizePlainTextMath converts x^2 to x^{2}', () => {
  const input = 'the area is x^2 square units';
  const result = normalizePlainTextMath(input);
  assert.ok(result.includes('x^{2}'), `expected x^{2} in result: ${result}`);
});

test('normalizePlainTextMath preserves existing LaTeX formulas', () => {
  const input = "已知 $f(x)=xe^{-x^2}$，求 $f'(x)$";
  const result = normalizePlainTextMath(input);
  assert.equal(result, input);
});

test('normalizePlainTextMath does not modify code blocks', () => {
  const input = 'Use `e^(-x^2)` in code, but $e^{-x^2}$ in math';
  const result = normalizePlainTextMath(input);
  assert.ok(result.includes('`e^(-x^2)`'), `expected code block preserved: ${result}`);
  assert.ok(result.includes('$e^{-x^2}$'), `expected formula preserved: ${result}`);
});

test('normalizePlainTextMath handles mixed plain text and LaTeX', () => {
  const input = "函数 f(x)=x e^(-x^2) 的导数为 $f'(x)=e^{-x^2}(1-2x^2)$";
  const result = normalizePlainTextMath(input);
  assert.ok(result.includes('e^{-x^2}'), `expected e^{-x^2} converted: ${result}`);
  assert.ok(result.includes("$f'(x)=e^{-x^2}(1-2x^2)$"), `expected existing formula preserved: ${result}`);
});

test('parseMarkdownLite parses inline math with $...$', () => {
  const input = "当 $f'(x)>0$ 时，函数单调递增。";
  const blocks = parseMarkdownLite(input);
  const paragraph = blocks.find((b) => b.type === 'paragraph');
  assert.ok(paragraph, 'expected a paragraph block');
  const mathTokens = paragraph!.type === 'paragraph'
    ? paragraph!.tokens.filter((t) => t.type === 'math_inline')
    : [];
  assert.equal(mathTokens.length, 1);
});

test('parseMarkdownLite parses display math with $$...$$', () => {
  const input = '$$\nf(x)=xe^{-x^2}\n$$';
  const blocks = parseMarkdownLite(input);
  const mathBlock = blocks.find((b) => b.type === 'math_block');
  assert.ok(mathBlock, 'expected a math_block');
  assert.ok(
    mathBlock!.type === 'math_block' && (mathBlock as { latex: string }).latex.includes('xe^{-x^2}'),
    `expected xe^{-x^2} in latex`,
  );
});

test('parseMarkdownLite parses display math with \\[...\\]', () => {
  const input = "\\[\nf'(x)=e^{-x^2}(1-2x^2)\n\\]";
  const blocks = parseMarkdownLite(input);
  const mathBlock = blocks.find((b) => b.type === 'math_block');
  assert.ok(mathBlock, 'expected a math_block');
});

test('parseMarkdownLite parses inline math with \\(...\\)', () => {
  const input = "导数 \\(f'(x)\\) 的符号决定了单调性。";
  const blocks = parseMarkdownLite(input);
  const paragraph = blocks.find((b) => b.type === 'paragraph');
  const mathTokens = paragraph!.type === 'paragraph'
    ? paragraph!.tokens.filter((t) => t.type === 'math_inline')
    : [];
  assert.equal(mathTokens.length, 1);
});

test('parseMarkdownLite does not parse math inside code blocks', () => {
  const input = '```\ny = exp(-x * x)\n```';
  const blocks = parseMarkdownLite(input);
  const allText = blocks.map((b) => JSON.stringify(b)).join('');
  assert.ok(!allText.includes('math_inline'), `expected no math_inline: ${allText}`);
  assert.ok(!allText.includes('math_block'), `expected no math_block: ${allText}`);
});

test('KaTeX renders e^{-x^2} successfully', () => {
  const result = renderLatexToString('e^{-x^2}', false);
  assert.equal(result.ok, true);
  assert.ok(result.html, 'expected html output');
});

test('KaTeX renders \\frac{a}{b} successfully', () => {
  const result = renderLatexToString('\\frac{1}{2}', true);
  assert.equal(result.ok, true);
});

test('KaTeX renders \\sqrt{x} successfully', () => {
  const result = renderLatexToString('\\sqrt{x+1}', false);
  assert.equal(result.ok, true);
});

test('KaTeX renders projectile formula successfully', () => {
  const result = renderLatexToString('H=\\frac{v_0^2\\sin^2\\theta}{2g}', true);
  assert.equal(result.ok, true);
});

test('KaTeX renders common formulas without error', () => {
  const formulas = [
    'e^{-x^2}',
    '\\frac{v_0^2\\sin^2\\theta}{2g}',
    '\\lim_{\\Delta x\\to 0}\\frac{f(x+\\Delta x)-f(x)}{\\Delta x}',
    'f\'(x)=e^{-x^2}(1-2x^2)',
  ];
  for (const latex of formulas) {
    const result = renderLatexToString(latex, false);
    assert.equal(result.ok, true, `expected ${latex} to render ok`);
  }
});
