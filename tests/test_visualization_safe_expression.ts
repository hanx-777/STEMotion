import assert from 'node:assert/strict';
import test from 'node:test';
import { compileSafeFunctionExpression, evaluateSafeFunctionExpression } from '../src/features/rag/lib/visualization/safe_expression';

test('safe expression evaluator supports generated function graph formulas', () => {
  const value = evaluateSafeFunctionExpression('x * Math.exp(-x*x)', 2);
  assert.ok(value !== undefined);
  assert.ok(Math.abs(value - 2 * Math.exp(-4)) < 1e-9);
});

test('safe expression evaluator supports powers and allowed math functions', () => {
  const value = evaluateSafeFunctionExpression('Math.sin(x) + x ** 2 + Math.sqrt(4)', Math.PI / 2);
  assert.ok(value !== undefined);
  assert.ok(Math.abs(value - (1 + Math.PI ** 2 / 4 + 2)) < 1e-9);
});

test('safe expression evaluator rejects executable JavaScript strings', () => {
  assert.equal(compileSafeFunctionExpression('eval("alert(1)")').ok, false);
  assert.equal(compileSafeFunctionExpression('fetch("/api/secrets")').ok, false);
  assert.equal(compileSafeFunctionExpression('Math.constructor("return window")()').ok, false);
});

test('safe expression evaluator rejects unknown identifiers', () => {
  assert.equal(compileSafeFunctionExpression('window.location').ok, false);
  assert.equal(compileSafeFunctionExpression('process.env.API_KEY').ok, false);
});
