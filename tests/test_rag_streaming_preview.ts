import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStreamingAnswerPreview } from '../src/features/rag/state/streamingAnswerPreview';

test('streaming answer preview renders complete JSON sections as markdown', () => {
  const preview = buildStreamingAnswerPreview(JSON.stringify({
    sections: [
      { title: '核心概念', content: '斜抛运动是二维运动。' },
      { title: '关键公式', content: '水平位移 $x=v_0\\cos\\theta t$。' },
    ],
  }));

  assert.match(preview, /### 核心概念/);
  assert.match(preview, /斜抛运动是二维运动。/);
  assert.match(preview, /### 关键公式/);
  assert.doesNotMatch(preview, /"sections"/);
});

test('streaming answer preview extracts readable content from partial JSON deltas', () => {
  const preview = buildStreamingAnswerPreview([
    '{ "sections": [{ "title": "核心概念",',
    ' "content": "斜抛运动是指物体以初速度 \\\\(v_0\\\\) 斜向抛出。"',
    ' }, { "title": "关键公式", "content": "水平位移为 \\\\(x=v_0t\\\\)。"',
  ].join(''));

  assert.match(preview, /斜抛运动是指物体以初速度/);
  assert.match(preview, /水平位移为/);
  assert.doesNotMatch(preview, /"content"/);
});

test('streaming answer preview preserves markdown when output is not JSON', () => {
  const preview = buildStreamingAnswerPreview('斜抛运动可以分解为水平和竖直两个方向。');

  assert.equal(preview, '斜抛运动可以分解为水平和竖直两个方向。');
});
