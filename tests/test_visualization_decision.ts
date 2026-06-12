import assert from 'node:assert/strict';
import test from 'node:test';
import { decideVisualization } from '../src/features/rag/lib/visualization/decision_agent';

test('returns shouldVisualize=false for definition question', () => {
  const result = decideVisualization({ question: '导数的定义是什么？' });
  assert.equal(result.shouldVisualize, false);
});

test('detects function_graph for monotonicity question', () => {
  const result = decideVisualization({ question: '分析函数 f(x)=xe^{-x^2} 的单调性和极值' });
  assert.equal(result.shouldVisualize, true);
  assert.equal(result.visualizationType, 'function_graph');
});

test('detects force_diagram for force analysis', () => {
  const result = decideVisualization({ question: '物体放在粗糙斜面上，分析它的受力情况' });
  assert.equal(result.shouldVisualize, true);
  assert.equal(result.visualizationType, 'force_diagram');
});

test('detects algorithm_trace for monotonic stack', () => {
  const result = decideVisualization({ question: '解释单调栈是怎么工作的，用 [2,1,2,4,3] 演示' });
  assert.equal(result.shouldVisualize, true);
  assert.equal(result.visualizationType, 'algorithm_trace');
});

test('detects projectile_motion with parameters', () => {
  const result = decideVisualization({ question: '一个物体以 20m/s 的初速度，30° 角斜抛，求最大高度' });
  assert.equal(result.shouldVisualize, true);
  assert.equal(result.visualizationType, 'projectile_motion');
  assert.equal(result.extractedParameters.v0, 20);
  assert.equal(result.extractedParameters.angle_deg, 30);
});

test('returns low confidence for ambiguous question', () => {
  const result = decideVisualization({ question: '什么是栈和队列？' });
  assert.equal(result.confidence < 0.5, true);
});

test('uses answer text for better detection', () => {
  const result = decideVisualization({
    question: '解释这个概念',
    answerText: '函数 f(x) 的单调性可以通过导数 f\'(x) 的符号判断，极值点出现在 f\'(x)=0 处',
  });
  assert.equal(result.visualizationType, 'function_graph');
});
