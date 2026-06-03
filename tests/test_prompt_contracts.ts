import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { loadWidgetSystemPrompt, loadWidgetUserPrompt } from '../src/lib/deep-interaction/prompts/loader';

const ROOT = process.cwd();
const SUBJECTS = ['advanced_math', 'chemistry', 'computer_science', 'physics_mechanics'];

function readProjectFile(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

test('subject RAG prompts share citation, evidence, and disclaimer boundaries', () => {
  for (const subject of SUBJECTS) {
    const systemPrompt = readProjectFile(`skills/${subject}/system_prompt.md`);
    const answerTemplate = readProjectFile(`skills/${subject}/answer_template.md`);
    const combined = `${systemPrompt}\n${answerTemplate}`;

    assert.match(combined, /本地知识库/);
    assert.match(combined, /网络检索/);
    assert.match(combined, /本地知识库来源/);
    assert.match(combined, /网络检索来源/);
    assert.match(combined, /当前知识库和网络检索中未找到可靠依据/);
    assert.match(combined, /AI 生成内容，仅供学习参考/);
    assert.doesNotMatch(combined, /尽量附来源编号/);
  }
});

test('deep interaction prompt files keep required widget runtime contract', () => {
  const types = ['simulation', 'game', 'mind_map', '3d_visualization', 'rag_visualization'] as const;

  for (const type of types) {
    const systemPrompt = loadWidgetSystemPrompt(type);
    const userPrompt = loadWidgetUserPrompt(type);
    const combined = `${systemPrompt}\n${userPrompt}`;

    assert.match(combined, /widget-config/);
    assert.match(combined, /SET_WIDGET_STATE/);
    assert.match(combined, /HIGHLIGHT_ELEMENT/);
    assert.match(combined, /ANNOTATE_ELEMENT/);
    assert.match(combined, /REVEAL_ELEMENT/);
    assert.match(combined, /requestAnimationFrame/);
    assert.match(combined, /Return ONLY|只返回/);
  }
});
