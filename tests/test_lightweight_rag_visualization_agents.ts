/**
 * Round 002B — Test suite for lightweight RAG visualization agents
 * Tests: Task 10
 *
 * Covers:
 *   1. Physics (projectile): taskPlan.mainVisualFocus, domainModel variables, visualizationMapping
 *   2. TCP (network): protocol states in domainModel, client/server arrows in mapping
 *   3. BST (algorithm): node/path/comparison in domainModel, node highlight in mapping
 *   4. Mode behavior: fast vs highQuality Specialist
 *   5. Legacy env: isLegacyAgentPipeline flag
 *   6. LightweightRagReviewer: pass/fail/revise decisions
 *   7. FinalQualityDecision: blockingReasons from LightweightReview
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRagVisualizationTaskPlan,
  buildRagDomainModel,
  buildRagVisualizationMapping,
  buildRagUILayoutPlan,
  maybeRunSpecialistVerifier,
  buildRagLightweightVisualizationPlan,
  formatLightweightPlanForPrompt,
  type LightweightAgentInput,
} from '../src/features/rag/lib/visualization/lightweight_rag_visualization_agents';
import { runLightweightRagReviewer } from '../src/features/rag/lib/visualization/lightweightRagReviewer';
import { buildFinalQualityDecision } from '../src/lib/generation/lightweightAgentPipeline';
import { isLegacyAgentPipeline } from '../src/lib/generation/multiAgentGenerationPrompt';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const physicsInput: LightweightAgentInput = {
  question: '一个小球以初速度 v0 = 20 m/s、发射角 θ = 30° 斜抛运动，忽略空气阻力，g = 9.8 m/s²。求最大高度和水平射程。',
  subject: 'physics_mechanics',
  taskType: 'step_solution',
  formulaBlocks: [
    { latex: 'H = v_{0y}^2 / (2g)', explanation: '最大高度' },
    { latex: 'R = v_{0x} \\cdot t', explanation: '水平射程' },
  ],
  finalResults: [
    { label: '最大高度 H', value: '5.10', unit: 'm' },
    { label: '水平射程 R', value: '35.35', unit: 'm' },
  ],
};

const tcpInput: LightweightAgentInput = {
  question: '请演示 TCP 三次握手协议的完整过程，包括 SYN、SYN-ACK、ACK 数据包的交换。',
  subject: 'computer_network',
  taskType: 'knowledge_qa',
};

const bstInput: LightweightAgentInput = {
  question: '演示在二叉搜索树（BST）中插入节点 15 的过程，从根节点 10 开始比较并找到正确位置。',
  subject: 'algorithm',
  taskType: 'step_solution',
};

// ─── Test 1: Physics — Task Planner ────────────────────────────────────────────

test('Physics taskPlan has correct mainVisualFocus and specialist flag', () => {
  const taskPlan = buildRagVisualizationTaskPlan(physicsInput);

  assert.equal(taskPlan.taskType, 'step_solution');
  assert.equal(taskPlan.subjectId, 'physics_mechanics');
  assert.ok(
    taskPlan.mainVisualFocus.includes('velocity') ||
    taskPlan.mainVisualFocus.includes('trajectory') ||
    taskPlan.mainVisualFocus.includes('projectile'),
    `Expected mainVisualFocus to include trajectory/velocity/projectile, got: ${taskPlan.mainVisualFocus}`,
  );
  assert.equal(taskPlan.needsSpecialist, true, 'Physics step_solution should need specialist');
  assert.equal(taskPlan.generationLog.length, 5, 'Should have exactly 5 generation log entries');
});

// ─── Test 2: Physics — Domain Modeler ──────────────────────────────────────────

test('Physics domainModel includes h, g, v variables', () => {
  const taskPlan = buildRagVisualizationTaskPlan(physicsInput);
  const domainModel = buildRagDomainModel(physicsInput, taskPlan);

  assert.equal(domainModel.domain, 'physics');
  assert.ok(domainModel.formulasOrRules.length > 0, 'Should have formulas');
  assert.ok(
    domainModel.formulasOrRules.some((f) => f.includes('v_{0y}') || f.includes('H') || f.includes('2g')),
    'Should include H formula',
  );
  assert.ok(domainModel.states.length > 0, 'Should have physics states');
  assert.ok(
    domainModel.states.some((s) =>
      s.includes('initial') || s.includes('motion') || s.includes('phase') || s.includes('peak'),
    ),
    `States should include motion phases, got: ${domainModel.states.join(', ')}`,
  );
  assert.ok(domainModel.edgeCases.length > 0, 'Should have edge cases');
});

// ─── Test 3: Physics — Visualization Mapper ────────────────────────────────────

test('Physics visualizationMapping includes velocity arrows and trajectory', () => {
  const taskPlan = buildRagVisualizationTaskPlan(physicsInput);
  const domainModel = buildRagDomainModel(physicsInput, taskPlan);
  const mapping = buildRagVisualizationMapping(physicsInput, taskPlan, domainModel);

  assert.ok(mapping.visualObjects.length > 0, 'Should have visual objects');
  assert.ok(mapping.stateToVisualMapping.length > 0, 'Should have state-to-visual mappings');
  assert.ok(mapping.animationSteps.length > 0, 'Should have animation steps');
  assert.ok(mapping.metricsOrLabels.length > 0, 'Should have metrics');
  assert.ok(
    mapping.metricsOrLabels.some((m) => m.includes('H') || m.includes('R') || m.includes('高度') || m.includes('射程')),
    `Metrics should include height/range values, got: ${mapping.metricsOrLabels.join(', ')}`,
  );
  assert.ok(mapping.interactionModel.length > 0, 'Should have interaction model');
});

// ─── Test 4: Physics — UI Layout Plan ──────────────────────────────────────────

test('Physics layoutPlan firstScreenChecklist includes core visualization visibility', () => {
  const taskPlan = buildRagVisualizationTaskPlan(physicsInput);
  const domainModel = buildRagDomainModel(physicsInput, taskPlan);
  const mapping = buildRagVisualizationMapping(physicsInput, taskPlan, domainModel);
  const layoutPlan = buildRagUILayoutPlan(physicsInput, taskPlan, mapping);

  assert.ok(layoutPlan.firstScreenChecklist.length >= 5, 'Should have at least 5 checklist items');
  assert.ok(
    layoutPlan.firstScreenChecklist.some(
      (item) => item.includes('核心可视化') || item.includes('首屏') || item.includes('可见'),
    ),
    'First screen checklist should include core visualization visibility',
  );
  assert.ok(
    layoutPlan.firstScreenChecklist.some((item) => item.includes('65%') || item.includes('主舞台')),
    'First screen checklist should include main stage >= 65% requirement',
  );
  assert.ok(layoutPlan.mainStage.includes('65%'), 'mainStage description should mention 65%');
  assert.ok(layoutPlan.sidePanel.includes('25') || layoutPlan.sidePanel.includes('35'), 'sidePanel should mention 25-35%');
});

// ─── Test 5: TCP — Domain Modeler ──────────────────────────────────────────────

test('TCP domainModel includes SYN/SYN-ACK/ACK protocol states', () => {
  const taskPlan = buildRagVisualizationTaskPlan(tcpInput);
  const domainModel = buildRagDomainModel(tcpInput, taskPlan);

  assert.equal(domainModel.domain, 'computer_network');
  const statesStr = domainModel.states.join(' ');
  assert.ok(
    statesStr.includes('SYN') || statesStr.includes('ESTABLISHED') || statesStr.includes('CLOSED'),
    `TCP states should include SYN/ESTABLISHED/CLOSED, got: ${statesStr}`,
  );
  assert.ok(domainModel.edgeCases.some((e) => e.toLowerCase().includes('packet') || e.toLowerCase().includes('timeout') || e.toLowerCase().includes('ack')),
    `TCP edge cases should include packet/timeout/ACK, got: ${domainModel.edgeCases.join(', ')}`,
  );
});

// ─── Test 6: TCP — Visualization Mapper ────────────────────────────────────────

test('TCP visualizationMapping includes client/server arrows or event frames', () => {
  const taskPlan = buildRagVisualizationTaskPlan(tcpInput);
  const domainModel = buildRagDomainModel(tcpInput, taskPlan);
  const mapping = buildRagVisualizationMapping(tcpInput, taskPlan, domainModel);

  const interactionStr = mapping.interactionModel.join(' ');
  assert.ok(
    interactionStr.includes('SYN') || interactionStr.includes('packet') ||
    interactionStr.includes('Send') || interactionStr.includes('timeline') || interactionStr.includes('Step'),
    `TCP interaction model should include SYN/packet/timeline/Step, got: ${interactionStr}`,
  );
  // TCP has no explicit variables in the input, so stateToVisualMapping may be empty
  // but animationSteps must exist (from defaultStates)
  assert.ok(mapping.animationSteps.length > 0, 'TCP should have animation steps derived from protocol states');
});

// ─── Test 7: BST — Domain Modeler ──────────────────────────────────────────────

test('BST domainModel includes node/path/comparison or insertion states', () => {
  const taskPlan = buildRagVisualizationTaskPlan(bstInput);
  const domainModel = buildRagDomainModel(bstInput, taskPlan);

  assert.equal(domainModel.domain, 'algorithm');
  const statesStr = domainModel.states.join(' ').toLowerCase();
  assert.ok(
    statesStr.includes('initial') || statesStr.includes('comparison') || statesStr.includes('transition') || statesStr.includes('terminal'),
    `BST states should include comparison/transition, got: ${statesStr}`,
  );
  assert.ok(domainModel.edgeCases.some((e) => e.toLowerCase().includes('empty') || e.toLowerCase().includes('single') || e.toLowerCase().includes('element')),
    `BST edge cases should include empty/single element, got: ${domainModel.edgeCases.join(', ')}`,
  );
});

// ─── Test 8: BST — Visualization Mapper ────────────────────────────────────────

test('BST visualizationMapping includes node highlight, path, tree structure changes', () => {
  const taskPlan = buildRagVisualizationTaskPlan(bstInput);
  const domainModel = buildRagDomainModel(bstInput, taskPlan);
  const mapping = buildRagVisualizationMapping(bstInput, taskPlan, domainModel);

  const interactionStr = mapping.interactionModel.join(' ');
  assert.ok(
    interactionStr.includes('Step') || interactionStr.includes('Highlight') || interactionStr.includes('node'),
    `BST interaction should include step-through/highlight/node, got: ${interactionStr}`,
  );
  assert.ok(mapping.animationSteps.length > 0, 'BST should have animation steps');
});

// ─── Test 9: Mode Behavior — fast does not activate Specialist ──────────────────

test('fast mode: specialist is not activated regardless of domain', () => {
  const taskPlan = buildRagVisualizationTaskPlan(physicsInput);
  const domainModel = buildRagDomainModel(physicsInput, taskPlan);
  const resultFast = maybeRunSpecialistVerifier(physicsInput, taskPlan, domainModel, 'fast');

  // Fast mode: maybeRunSpecialistVerifier must return EXACTLY the same object reference
  // (no new notes added), regardless of needsSpecialist flag
  assert.strictEqual(resultFast, domainModel,
    'Fast mode must return the exact same domainModel reference (no specialist enrichment)');
});

// ─── Test 10: Mode Behavior — highQuality activates Specialist ─────────────────

test('highQuality mode: specialist enriches domainModel with notes', () => {
  const taskPlan = buildRagVisualizationTaskPlan(physicsInput);
  const domainModel = buildRagDomainModel(physicsInput, taskPlan);
  const resultHQ = maybeRunSpecialistVerifier(physicsInput, taskPlan, domainModel, 'highQuality');

  assert.ok(
    resultHQ.specialistNotes && resultHQ.specialistNotes.length > 0,
    'highQuality mode should add specialist notes',
  );
  assert.ok(
    resultHQ.specialistNotes!.some((n) => n.toLowerCase().includes('conservation') || n.toLowerCase().includes('physics') || n.toLowerCase().includes('coordinate')),
    `Specialist notes should mention physics validation, got: ${resultHQ.specialistNotes!.join(', ')}`,
  );
});

// ─── Test 11: Orchestrator — buildRagLightweightVisualizationPlan output shape ──

test('buildRagLightweightVisualizationPlan returns full plan with all 4 parts', () => {
  const plan = buildRagLightweightVisualizationPlan(physicsInput, 'balanced');

  assert.ok(plan.taskPlan, 'Should have taskPlan');
  assert.ok(plan.domainModel, 'Should have domainModel');
  assert.ok(plan.visualizationMapping, 'Should have visualizationMapping');
  assert.ok(plan.layoutPlan, 'Should have layoutPlan');

  assert.equal(typeof plan.taskPlan.needsSpecialist, 'boolean');
  assert.ok(Array.isArray(plan.taskPlan.generationLog));
  assert.ok(Array.isArray(plan.domainModel.variables));
  assert.ok(Array.isArray(plan.visualizationMapping.visualObjects));
  assert.ok(Array.isArray(plan.layoutPlan.firstScreenChecklist));
});

// ─── Test 12: formatLightweightPlanForPrompt outputs key sections ──────────────

test('formatLightweightPlanForPrompt includes domain_model, visual_state_mapping, layout_contract', () => {
  const plan = buildRagLightweightVisualizationPlan(physicsInput, 'balanced');
  const prompt = formatLightweightPlanForPrompt(plan);

  assert.ok(prompt.includes('domain_model'), 'Should include domain_model section');
  assert.ok(prompt.includes('visual_state_mapping'), 'Should include visual_state_mapping section');
  assert.ok(prompt.includes('interaction_model'), 'Should include interaction_model section');
  assert.ok(prompt.includes('layout_contract'), 'Should include layout_contract section');
  assert.ok(prompt.includes('65%'), 'Should include main stage 65% constraint');
  assert.ok(prompt.includes('25%') || prompt.includes('35%'), 'Should include side panel 25-35% constraint');
});

// ─── Test 13: Legacy env switch ────────────────────────────────────────────────

test('isLegacyAgentPipeline: returns false when env not set', () => {
  const original = process.env.STEMOTION_RAG_AGENT_PIPELINE;
  delete process.env.STEMOTION_RAG_AGENT_PIPELINE;
  assert.equal(isLegacyAgentPipeline(), false, 'Should return false when env not set');
  if (original !== undefined) process.env.STEMOTION_RAG_AGENT_PIPELINE = original;
});

test('isLegacyAgentPipeline: returns true when env=legacy', () => {
  const original = process.env.STEMOTION_RAG_AGENT_PIPELINE;
  process.env.STEMOTION_RAG_AGENT_PIPELINE = 'legacy';
  assert.equal(isLegacyAgentPipeline(), true, 'Should return true when env=legacy');
  if (original !== undefined) {
    process.env.STEMOTION_RAG_AGENT_PIPELINE = original;
  } else {
    delete process.env.STEMOTION_RAG_AGENT_PIPELINE;
  }
});

// ─── Test 14: LightweightRagReviewer — pass case ───────────────────────────────

test('LightweightRagReviewer: returns publish for clean artifact', () => {
  const review = runLightweightRagReviewer({
    // No failures: contract passed, active interaction passed, no safety/runtime issues
    contractDiagnostic: { passed: true, missing: [], warnings: [] },
    activeInteractionDiagnostics: { passed: true, actionsTested: ['start-btn'], visibleMutations: ['canvas updated'], warnings: [] },
  });

  assert.equal(review.status, 'pass');
  assert.equal(review.finalDecision, 'publish');
  assert.equal(review.mustFix.length, 0);
  assert.ok(review.score >= 70, `Score should be >= 70 for clean artifact, got ${review.score}`);
});

// ─── Test 15: LightweightRagReviewer — revise case ─────────────────────────────

test('LightweightRagReviewer: returns revise_once for active interaction failure', () => {
  const review = runLightweightRagReviewer({
    contractDiagnostic: { passed: true, missing: [], warnings: [] },
    activeInteractionDiagnostics: {
      passed: false,
      actionsTested: ['start-btn'],
      visibleMutations: [],
      warnings: [],
      failureReason: 'No visible DOM changes detected after button click',
    },
  });

  assert.equal(review.status, 'revise', `Expected revise, got ${review.status}`);
  assert.equal(review.finalDecision, 'revise_once');
  assert.ok(review.mustFix.length > 0, 'Should have at least one mustFix item');
  assert.equal(review.mustFix[0].area, 'ux');
});

// ─── Test 16: LightweightRagReviewer — fail case (critical contract failures) ──

test('LightweightRagReviewer: returns reject for critical contract failures', () => {
  const review = runLightweightRagReviewer({
    contractDiagnostic: {
      passed: false,
      missing: ['doctype', 'closing html', 'message listener', 'requestAnimationFrame', 'widget-config'],
      warnings: [],
    },
  });

  assert.equal(review.status, 'fail');
  assert.equal(review.finalDecision, 'reject');
  assert.ok(review.mustFix.some((f) => f.severity === 'critical'), 'Should have critical severity issue');
});

// ─── Test 17: FinalQualityDecision receives LightweightReview blockingReasons ──

test('buildFinalQualityDecision: critical/high LightweightReview mustFix causes blockingReasons', () => {
  const lightweightReview = runLightweightRagReviewer({
    contractDiagnostic: {
      passed: false,
      missing: ['doctype', 'closing html', 'message listener'],
      warnings: [],
    },
  });

  const decision = buildFinalQualityDecision({
    lightweightReview,
    outputForm: 'artifact',
    artifactQualityReport: { passed: false, score: 0, status: 'failed' },
  });

  assert.ok(decision.blockingReasons.length > 0, 'Should have blocking reasons from critical LightweightReview');
  assert.ok(
    decision.decision === 'reject' || decision.decision === 'revise_once',
    `Decision should be reject or revise_once, got: ${decision.decision}`,
  );
});

// ─── Test 18: FinalQualityDecision — pass case ─────────────────────────────────

test('buildFinalQualityDecision: passes when LightweightReview is clean', () => {
  const lightweightReview = runLightweightRagReviewer({
    contractDiagnostic: { passed: true, missing: [], warnings: [] },
    activeInteractionDiagnostics: { passed: true, actionsTested: ['start'], visibleMutations: ['dom-change'], warnings: [] },
  });

  const decision = buildFinalQualityDecision({
    lightweightReview,
    outputForm: 'artifact',
    artifactQualityReport: { passed: true, score: 85, decision: 'publish' },
  });

  assert.equal(decision.overallPassed, true, 'Should pass with clean artifact and review');
  assert.equal(decision.decision, 'publish');
  assert.equal(decision.blockingReasons.length, 0);
});

// ─── Test 19: Missing #visualization element flagged ───────────────────────────

test('LightweightRagReviewer flags missing #visualization element', () => {
  // Use HTML > 100 chars to trigger the check
  const htmlWithoutViz = '<html><body>' + '<div id="controls"></div>'.repeat(10) + '<div id="metrics"></div></body></html>';
  assert.ok(htmlWithoutViz.length > 100, 'Test fixture HTML must be > 100 chars');

  const review = runLightweightRagReviewer({
    html: htmlWithoutViz,
    contractDiagnostic: { passed: true, missing: [], warnings: [] },
    lightweightPlan: buildRagLightweightVisualizationPlan(physicsInput, 'balanced'),
  });

  assert.ok(
    review.mustFix.some((f) => f.area === 'ui' && f.problem.includes('#visualization')),
    `Should flag missing #visualization, got: ${JSON.stringify(review.mustFix)}`,
  );
});
