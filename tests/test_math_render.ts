import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractLatexFormulas,
  findBareLatexArtifacts,
  normalizeLatexForRendering,
  renderLatexToString,
  validateLatexFormula,
} from '../src/features/rag/lib/math_render';

test('KaTeX renderer renders valid projectile formula', () => {
  const rendered = renderLatexToString('\\frac{v_0^2 \\sin^2\\theta}{2g}', true);

  assert.equal(rendered.ok, true);
  assert.match(rendered.html ?? '', /katex/);
});

test('KaTeX validation detects malformed formula', () => {
  const [formula] = extractLatexFormulas('\\[ \\frac{v_0^2}{ \\]');
  const validated = validateLatexFormula(formula);

  assert.equal(validated.ok, false);
});

test('latex formula extractor supports display and inline delimiters', () => {
  const formulas = extractLatexFormulas('行内 \\( v_0 \\sin\\theta \\)，块级 $$H = \\frac{v_0^2}{2g}$$。');

  assert.equal(formulas.length, 2);
  assert.equal(formulas[0].displayMode, false);
  assert.equal(formulas[1].displayMode, true);
});

test('bare latex artifact detector ignores wrapped formulas', () => {
  const artifacts = findBareLatexArtifacts('公式 \\[ H = \\frac{v_0^2}{2g} \\]，但这里裸露 \\frac。');

  assert.deepEqual(artifacts, ['\\frac']);
});

test('latex normalization strips delimiters and fixes double escaped commands', () => {
  const normalized = normalizeLatexForRendering('\\\\[ H = \\\\frac{v_0^2}{2g} \\\\]');

  assert.equal(normalized, 'H = \\frac{v_0^2}{2g}');
});

test('KaTeX renderer accepts formula strings that still include delimiters', () => {
  const rendered = renderLatexToString('\\[ H = \\frac{v_{0y}^2}{2g} \\]', true);

  assert.equal(rendered.ok, true);
  assert.match(rendered.html ?? '', /katex/);
});
