import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMarkdownLite, stripDuplicateLeadingHeading } from '../src/lib/rag/markdown_lite';

test('markdown lite parses headings, lists, strong text, code, and citations', () => {
  const blocks = parseMarkdownLite('### 4. 单位检查\n* **速度**：`v0` 单位为 m/s [L1]\n* 角度使用度。');

  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].type, 'heading');
  assert.equal(blocks[1].type, 'list');
  if (blocks[1].type !== 'list') throw new Error('expected list block');
  assert.equal(blocks[1].items.length, 2);
  assert.ok(blocks[1].items[0].some((token) => token.type === 'strong' && token.text === '速度'));
  assert.ok(blocks[1].items[0].some((token) => token.type === 'code' && token.text === 'v0'));
  assert.ok(blocks[1].items[0].some((token) => token.type === 'citation' && token.text === '[L1]'));
});

test('markdown lite strips duplicate leading section headings', () => {
  const stripped = stripDuplicateLeadingHeading('### 3. 分步推导\n先分解速度。', '分步推导');

  assert.equal(stripped, '先分解速度。');
});

test('markdown lite keeps html-like text as plain text tokens', () => {
  const blocks = parseMarkdownLite('<script>alert(1)</script>\n**安全文本**');

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'paragraph');
  if (blocks[0].type !== 'paragraph') throw new Error('expected paragraph block');
  assert.ok(blocks[0].tokens.some((token) => token.type === 'text' && token.text.includes('<script>')));
});

test('markdown lite parses block and inline math', () => {
  const blocks = parseMarkdownLite('公式如下：\\( v_0 \\sin\\theta \\)\n\\[\nH = \\frac{v_0^2 \\sin^2\\theta}{2g}\n\\]');

  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].type, 'paragraph');
  if (blocks[0].type !== 'paragraph') throw new Error('expected paragraph block');
  assert.ok(blocks[0].tokens.some((token) => token.type === 'math_inline' && token.latex === 'v_0 \\sin\\theta'));
  assert.equal(blocks[1].type, 'math_block');
  if (blocks[1].type !== 'math_block') throw new Error('expected math block');
  assert.match(blocks[1].latex, /\\frac/);
});

test('markdown lite parses dollar block math', () => {
  const blocks = parseMarkdownLite('$$R = \\frac{v_0^2 \\sin 2\\theta}{g}$$');

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'math_block');
});

test('markdown lite parses double escaped display math from model output', () => {
  const blocks = parseMarkdownLite('公式如下：\n\\\\[\nH = \\\\frac{v_{0y}^2}{2g}\n\\\\]');

  assert.equal(blocks.length, 2);
  assert.equal(blocks[1].type, 'math_block');
  if (blocks[1].type !== 'math_block') throw new Error('expected math block');
  assert.equal(blocks[1].latex, 'H = \\frac{v_{0y}^2}{2g}');
});
