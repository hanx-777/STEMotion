import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HTML_GENERATION_SYSTEM_PROMPT,
  HTML_GENERATION_MAX_TOKENS,
  buildHtmlGenerationPrompt,
  generateInteractiveHtml,
} from '../src/lib/rag/visualization/htmlGenerator';
import { ARTIFACT_DESIGN_CONTRACT_MARKER } from '../src/lib/generation/artifactDesignContract';
import { LlmTruncationError } from '../src/lib/generation/llmClient';

test('HTML_GENERATION_MAX_TOKENS is at least 32k to fit a self-contained interactive widget', () => {
  assert.equal(HTML_GENERATION_MAX_TOKENS, 32768);
});

test('generateInteractiveHtml passes HTML_GENERATION_MAX_TOKENS to the underlying LLM call', async () => {
  let observedPreset = '';
  const stubGenerate = async (opts: { requestPreset?: string }) => {
    observedPreset = opts.requestPreset ?? '';
    return '<!DOCTYPE html><html><head><title>x</title></head><body><script>1;</script></body></html>';
  };

  await generateInteractiveHtml(
    {
      question: 'q',
      answerText: 'a',
      visualizationType: 'projectile_motion',
      extractedParameters: {},
    },
    { generate: stubGenerate as never },
  );

  assert.equal(observedPreset, 'artifact');
});

test('HTML generation prompt includes first-screen and stage/sidebar layout constraints', () => {
  const prompt = buildHtmlGenerationPrompt({
    question: '初速度 8m/s，抛射角 35°，观察轨迹和关键运动量',
    answerText: '射程和最大高度由初速度、角度、重力加速度共同决定。',
    visualizationType: 'projectile_motion',
    extractedParameters: { v0: 8, angle: 35, g: 9.8 },
  });

  assert.match(prompt, /1366x768/);
  assert.match(prompt, /1440x900/);
  assert.match(prompt, /1920x1080/);
  assert.match(prompt, /首屏|first-screen|first screen/i);
  assert.match(prompt, /65%-75%/);
  assert.match(prompt, /right explanation\/sidebar|右侧说明栏/);
  assert.match(prompt, /nested scroll|嵌套滚动/i);
  assert.match(prompt, new RegExp(ARTIFACT_DESIGN_CONTRACT_MARKER));
  assert.match(prompt, /STEMOTION_RAG_VISUALIZATION_DESIGN_CONTEXT/);
  assert.match(prompt, /STEMotion visual vocabulary/i);
  assert.match(prompt, /anti-filler/i);
  assert.match(prompt, /problem-specific interaction/i);
  assert.match(HTML_GENERATION_SYSTEM_PROMPT, new RegExp(ARTIFACT_DESIGN_CONTRACT_MARKER));
  assert.match(HTML_GENERATION_SYSTEM_PROMPT, /STEMOTION_RAG_VISUALIZATION_DESIGN_CONTEXT/);
});

test('generateInteractiveHtml recovers truncated output via patchTruncatedHtml', async () => {
  const partialHtml = [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head><meta charset="utf-8"><title>抛体运动</title></head>',
    '<body>',
    '  <canvas id="stage" width="600" height="400"></canvas>',
    '  <input type="range" id="angle" min="0" max="90" value="45">',
    '  <button id="start">开始</button>',
    '  <script>',
    '    const ctx = document.getElementById("stage").getContext("2d");',
    // intentionally cut mid-function — no </script>, no </body>, no </html>
  ].join('\n');

  const stubGenerate = async () => {
    throw new LlmTruncationError(HTML_GENERATION_MAX_TOKENS, HTML_GENERATION_MAX_TOKENS, partialHtml);
  };

  const html = await generateInteractiveHtml(
    {
      question: '以 30° 抛出，求射程',
      answerText: '射程 = v0^2 * sin(2θ) / g',
      visualizationType: 'projectile_motion',
      extractedParameters: { angleDeg: 30, v0: 20 },
    },
    { generate: stubGenerate as never },
  );

  assert.ok(html.startsWith('<!DOCTYPE html>'), 'patched output keeps DOCTYPE');
  assert.ok(html.includes('</script>'), 'patched output must close <script>');
  assert.ok(html.includes('</html>'), 'patched output must close <html>');
});

test('generateInteractiveHtml re-throws non-truncation errors unchanged', async () => {
  const stubGenerate = async () => {
    throw new Error('network down');
  };

  await assert.rejects(
    () =>
      generateInteractiveHtml(
        {
          question: 'q',
          answerText: 'a',
          visualizationType: 'projectile_motion',
          extractedParameters: {},
        },
        { generate: stubGenerate as never },
      ),
    /network down/,
  );
});
