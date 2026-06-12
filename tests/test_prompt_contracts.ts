import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { loadWidgetSystemPrompt, loadWidgetUserPrompt } from '../src/features/deep-interaction/lib/prompts/loader';
import {
  ARTIFACT_DESIGN_CONTRACT_MARKER,
  artifactDesignContractPrompt,
} from '../src/lib/generation/artifactDesignContract';
import {
  DESIGN_REVIEW_RUBRIC_MARKER,
  designRepairPrompt,
  designReviewRubricPrompt,
  followUpDesignProtectionPrompt,
} from '../src/features/deep-interaction/lib/agents/designReviewRubric';
import { widgetSystemPrompt } from '../src/lib/generation/promptTemplates';
import {
  HTML_GENERATION_SYSTEM_PROMPT,
  buildHtmlGenerationPrompt,
} from '../src/features/rag/lib/visualization/htmlGenerator';
import {
  RAG_WIDGET_HTML_SYSTEM_PROMPT,
  buildRagWidgetHtmlPrompt,
} from '../src/features/rag/lib/visualization/auditPipeline';
import { buildWidgetRefineSystemPrompt } from '../src/features/deep-interaction/lib/followUpHandler.server';
import {
  MULTI_AGENT_GENERATION_PROMPT_MARKER,
  buildInternalMultiAgentPlanningPrompt,
} from '../src/lib/generation/multiAgentGenerationPrompt';

const ROOT = process.cwd();
const SUBJECTS = ['advanced_math', 'chemistry', 'computer_science', 'physics_mechanics'];
const FORBIDDEN_SOURCE_TEXT = new RegExp([
  ['Claude', 'Design'].join(' '),
  ['artifact', '_tool'].join(''),
  ['str_replace', '_editor'].join(''),
  ['Computer', 'Use'].join(' '),
  'window\\.claude',
  'done\\(',
  'questions_v2',
  'copy_starter_component',
  'fork_verifier_agent',
].join('|'), 'i');

function readProjectFile(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

function assertHasArtifactDesignContract(source: string, label: string): void {
  assert.match(source, new RegExp(ARTIFACT_DESIGN_CONTRACT_MARKER), `${label} should include the shared design contract marker`);
  assert.match(source, /first screen|above the fold/i, `${label} should protect first-screen usability`);
  assert.match(source, /65%-75%/, `${label} should protect main-stage ratio`);
  assert.match(source, /responsive/i, `${label} should require responsive fallback`);
  assert.match(source, /nested scroll/i, `${label} should control nested scrolling`);
  assert.match(source, /44px|hit targets/i, `${label} should protect control hit targets`);
  assert.match(source, /visual hierarchy/i, `${label} should require visual hierarchy`);
  assert.match(source, /Anti-filler|generic hero/i, `${label} should prevent filler visuals`);
  assert.match(source, /stable ids\/data-role|data-role/i, `${label} should preserve stable ids/data-role context`);
  assert.doesNotMatch(source, FORBIDDEN_SOURCE_TEXT, `${label} must not copy forbidden source text`);
}

function assertHasDesignReviewRubric(source: string, label: string): void {
  assert.match(source, new RegExp(DESIGN_REVIEW_RUBRIC_MARKER), `${label} should include the shared design-review marker`);
  assert.match(source, /first[-\s]?screen|首屏/i, `${label} should review first-screen usability`);
  assert.match(source, /65%-75%/, `${label} should review main-stage ratio`);
  assert.match(source, /responsive|375px|移动端/i, `${label} should review responsive behavior`);
  assert.match(source, /nested scroll|嵌套滚动/i, `${label} should review nested scrolling`);
  assert.match(source, /visual hierarchy|视觉层级/i, `${label} should review visual hierarchy`);
  assert.match(source, /44px|hit targets|命中区域/i, `${label} should review control hit targets`);
  assert.match(source, /filler|generic hero|AI 味/i, `${label} should reject filler content`);
  assert.match(source, /location|selector|位置|target=.*html/i, `${label} should require issue location or selector`);
  assert.match(source, /impact|priority|优先级|severity/i, `${label} should require impact and priority`);
  assert.match(source, /concrete|具体|Fix:/i, `${label} should require concrete fixes`);
  assert.doesNotMatch(source, FORBIDDEN_SOURCE_TEXT, `${label} should not include source tool protocol text`);
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

test('artifact and reviewer prompts require compact first-screen layout review', () => {
  const widgetTypes = ['simulation', 'game', 'mind_map', '3d_visualization', 'rag_visualization'] as const;

  for (const type of widgetTypes) {
    const systemPrompt = loadWidgetSystemPrompt(type);
    assert.match(systemPrompt, /1366x768/);
    assert.match(systemPrompt, /1440x900/);
    assert.match(systemPrompt, /首屏|first screen/i);
    assert.match(systemPrompt, /65%-75%/);
    assert.match(systemPrompt, /nested scroll|嵌套滚动/i);
  }

  const uxEvaluatorSource = readProjectFile('src/lib/deep-interaction/agents/uxEvaluatorAgent.ts');
  assert.match(uxEvaluatorSource, /1366x768/);
  assert.match(uxEvaluatorSource, /1440x900/);
  assert.match(uxEvaluatorSource, /draggable splitter|可拖动分隔栏/i);
  assert.match(uxEvaluatorSource, /具体修改建议/);
});

test('reviewer-specific design rubric requires specific actionable design fixes', () => {
  assertHasDesignReviewRubric(designReviewRubricPrompt(), 'design review rubric prompt');
  assertHasDesignReviewRubric(designRepairPrompt(), 'design repair prompt');
  assertHasDesignReviewRubric(followUpDesignProtectionPrompt(), 'follow-up design protection prompt');

  const uxEvaluatorSource = readProjectFile('src/lib/deep-interaction/agents/uxEvaluatorAgent.ts');
  const judgeSource = readProjectFile('src/lib/deep-interaction/agents/judgeAgent.ts');
  const repairSource = readProjectFile('src/lib/deep-interaction/agents/repairAgent.ts');
  const followUpPrompt = buildWidgetRefineSystemPrompt({
    title: 'Projectile motion',
    concept: 'projectile motion',
  });

  assert.match(uxEvaluatorSource, /designReviewRubricPrompt/);
  assert.match(judgeSource, /collectDesignQualityBlockers/);
  assert.match(judgeSource, /buildDesignRepairInstruction/);
  assert.match(repairSource, /designRepairPrompt/);
  assertHasDesignReviewRubric(followUpPrompt, 'follow-up system prompt');
});

test('shared artifact design contract covers key prompt principles without Claude-specific source text', () => {
  const contract = artifactDesignContractPrompt();

  assertHasArtifactDesignContract(contract, 'shared artifact design contract');
  assert.match(contract, /output-shape awareness/i);
  assert.match(contract, /Design-context reuse/i);
  assert.match(contract, /Splitter optionality/i);
  assert.match(contract, /Accessibility basics/i);
  assert.doesNotMatch(contract, FORBIDDEN_SOURCE_TEXT);
});

test('artifact generation prompt paths reuse the shared design contract', () => {
  const legacyWidgetPrompt = widgetSystemPrompt({
    id: 'projectile-widget',
    title: 'Projectile motion',
    subject: 'physics',
    gradeLevel: 'middle_school',
    concept: 'projectile motion',
    description: 'Show trajectory and key metrics.',
    learningGoals: ['Relate velocity components to trajectory.'],
    variables: [{ name: 'angle', label: 'Angle', min: 0, max: 90, default: 35, step: 1, unit: 'deg' }],
    animationIntent: 'Animate projectile trajectory.',
    formulae: [{ id: 'range', title: 'Range', latex: 'R = v^2 sin(2theta) / g' }],
    quiz: {
      question: 'What changes range?',
      options: ['angle', 'color'],
      correctAnswer: 'angle',
      explanation: 'Range depends on launch angle.',
    },
    safetyNotes: ['classroom safe'],
    messageTargets: [{ id: '#visualization', purpose: 'main stage' }],
  });
  const lightweightSystemPrompt = HTML_GENERATION_SYSTEM_PROMPT;
  const lightweightUserPrompt = buildHtmlGenerationPrompt({
    question: '初速度 8m/s，抛射角 35°，观察轨迹和关键运动量',
    answerText: '射程和最大高度由初速度、角度、重力加速度共同决定。',
    visualizationType: 'projectile_motion',
    extractedParameters: { v0: 8, angle: 35, g: 9.8 },
  });
  const auditSystemPrompt = RAG_WIDGET_HTML_SYSTEM_PROMPT;
  const auditUserPrompt = buildRagWidgetHtmlPrompt({
    question: '单调栈求下一个更大元素，输入 [2,1,2,4,3]',
    answerText: '用栈保存待解决下标。',
    plan: {
      shouldGenerate: true,
      problemRestatement: '单调栈求下一个更大元素，输入 [2,1,2,4,3]',
      knowledgePoint: '单调栈',
      variables: [{ name: 'nums', label: '输入数组', value: '[2,1,2,4,3]', role: 'given' }],
      visualObjects: ['数组条形图', '栈容器', '输出数组'],
      controls: ['start', 'reset'],
      metrics: ['当前下标', '输出数组'],
      animationRequirements: ['逐步读取元素', '弹出时高亮'],
      successCriteria: ['展示弹出条件'],
      rightPanelNarration: [],
      recommendedType: 'interactive_html',
      confidence: 0.9,
    },
  });
  const followUpPrompt = buildWidgetRefineSystemPrompt({
    title: 'Projectile motion',
    concept: 'projectile motion',
  });

  for (const [label, prompt] of [
    ['legacy widget generation prompt', legacyWidgetPrompt],
    ['RAG lightweight system prompt', lightweightSystemPrompt],
    ['RAG lightweight user prompt', lightweightUserPrompt],
    ['RAG audit system prompt', auditSystemPrompt],
    ['RAG audit user prompt', auditUserPrompt],
    ['Deep Interaction follow-up prompt', followUpPrompt],
  ] as const) {
    assertHasArtifactDesignContract(prompt, label);
    assert.doesNotMatch(prompt, FORBIDDEN_SOURCE_TEXT, `${label} should not include external tool protocol`);
  }
});

test('shared internal multi-agent prompt covers all roles without changing output shape', () => {
  const artifactPrompt = buildInternalMultiAgentPlanningPrompt({
    mode: 'artifact',
    artifactKind: 'self-contained interactive HTML',
  });
  const answerPrompt = buildInternalMultiAgentPlanningPrompt({
    mode: 'answer',
    artifactKind: 'RAG JSON answer',
  });
  const reviewerPrompt = buildInternalMultiAgentPlanningPrompt({
    mode: 'reviewer',
    artifactKind: 'quality review JSON',
  });

  for (const [label, prompt] of [
    ['artifact', artifactPrompt],
    ['answer', answerPrompt],
    ['reviewer', reviewerPrompt],
  ] as const) {
    assert.match(prompt, new RegExp(MULTI_AGENT_GENERATION_PROMPT_MARKER), `${label} prompt should include shared marker`);
    assert.match(prompt, /Orchestrator/);
    assert.match(prompt, /Core Analysis Agent/);
    assert.match(prompt, /Architecture Agent/);
    assert.match(prompt, /Logic Agent/);
    assert.match(prompt, /Visualization \/ Interaction Agent/);
    assert.match(prompt, /UI Design Agent/);
    assert.match(prompt, /Content \/ Localization Agent/);
    assert.match(prompt, /Implementation Agent/);
    assert.match(prompt, /Reviewer \/ Critic Agent/);
    assert.match(prompt, /internal planning|内部规划/i);
    assert.match(prompt, /do not output|不要输出/i);
    assert.match(prompt, /chain-of-thought|思维链/i);
  }

  assert.match(artifactPrompt, /HTML only|完整 HTML|Return ONLY/i);
  assert.match(answerPrompt, /JSON answer protocol|JSON/i);
  assert.match(reviewerPrompt, /review JSON|纯 JSON|JSON/i);
});

test('all generation prompt surfaces reuse the shared internal multi-agent flow', () => {
  const lightweightSystemPrompt = HTML_GENERATION_SYSTEM_PROMPT;
  const lightweightUserPrompt = buildHtmlGenerationPrompt({
    question: '初速度 8m/s，抛射角 35°，观察轨迹和关键运动量',
    answerText: '射程和最大高度由初速度、角度、重力加速度共同决定。',
    visualizationType: 'projectile_motion',
    extractedParameters: { v0: 8, angle: 35, g: 9.8 },
  });
  const auditPrompt = `${RAG_WIDGET_HTML_SYSTEM_PROMPT}\n${buildRagWidgetHtmlPrompt({
    question: '单调栈求下一个更大元素，输入 [2,1,2,4,3]',
    answerText: '用栈保存待解决下标。',
    plan: {
      shouldGenerate: true,
      problemRestatement: '单调栈求下一个更大元素，输入 [2,1,2,4,3]',
      knowledgePoint: '单调栈',
      variables: [{ name: 'nums', label: '输入数组', value: '[2,1,2,4,3]', role: 'given' }],
      visualObjects: ['数组条形图', '栈容器', '输出数组'],
      controls: ['start', 'reset'],
      metrics: ['当前下标', '输出数组'],
      animationRequirements: ['逐步读取元素', '弹出时高亮'],
      successCriteria: ['展示弹出条件'],
      rightPanelNarration: [],
      recommendedType: 'interactive_html',
      confidence: 0.9,
    },
  })}`;
  const followUpPrompt = buildWidgetRefineSystemPrompt({
    title: 'Projectile motion',
    concept: 'projectile motion',
  });
  const legacyWidgetPrompt = widgetSystemPrompt({
    id: 'projectile-widget',
    title: 'Projectile motion',
    subject: 'physics',
    gradeLevel: 'middle_school',
    concept: 'projectile motion',
    description: 'Show trajectory and key metrics.',
    learningGoals: ['Relate velocity components to trajectory.'],
    variables: [{ name: 'angle', label: 'Angle', min: 0, max: 90, default: 35, step: 1, unit: 'deg' }],
    animationIntent: 'Animate projectile trajectory.',
    formulae: [{ id: 'range', title: 'Range', latex: 'R = v^2 sin(2theta) / g' }],
    quiz: {
      question: 'What changes range?',
      options: ['angle', 'color'],
      correctAnswer: 'angle',
      explanation: 'Range depends on launch angle.',
    },
    safetyNotes: ['classroom safe'],
    messageTargets: [{ id: '#visualization', purpose: 'main stage' }],
  });

  for (const [label, prompt] of [
    ['RAG lightweight system prompt', lightweightSystemPrompt],
    ['RAG lightweight user prompt', lightweightUserPrompt],
    ['RAG audit prompt', auditPrompt],
    ['Deep Interaction follow-up prompt', followUpPrompt],
    ['legacy widget prompt', legacyWidgetPrompt],
  ] as const) {
    assert.match(prompt, new RegExp(MULTI_AGENT_GENERATION_PROMPT_MARKER), `${label} should include shared multi-agent marker`);
  }

  for (const path of [
    'src/lib/rag/rag_pipeline.ts',
    'src/lib/deep-interaction/agentWidgetPipeline.ts',
    'src/lib/deep-interaction/agents/repairAgent.ts',
    'src/lib/deep-interaction/agents/pedagogyEvaluatorAgent.ts',
    'src/lib/deep-interaction/agents/uxEvaluatorAgent.ts',
    'src/lib/rag/agents/reviewers/reviewer_utils.ts',
  ]) {
    const source = readProjectFile(path);
    assert.match(source, /buildInternalMultiAgentPlanningPrompt/, `${path} should compose the shared internal multi-agent flow`);
  }
});

test('RAG audit HTML prompt prioritizes single-pass high-resource generation', () => {
  const prompt = `${RAG_WIDGET_HTML_SYSTEM_PROMPT}\n${buildRagWidgetHtmlPrompt({
    question: '解释 fib(4) 递归调用栈如何展开和回溯',
    answerText: '先展开调用，到达边界条件后逐层返回。',
    plan: {
      shouldGenerate: true,
      problemRestatement: '解释 fib(4) 递归调用栈如何展开和回溯',
      knowledgePoint: '递归调用栈',
      variables: [{ name: 'n', label: '递归输入', value: '4', role: 'given' }],
      visualObjects: ['调用帧堆叠', '返回值箭头', '递归树分支'],
      controls: ['start', 'reset', '逐层回溯'],
      metrics: ['当前深度', '活跃调用帧', '返回值'],
      animationRequirements: ['调用帧入栈', '边界条件返回', '父调用汇总返回值'],
      successCriteria: ['看清 fib(4) 如何由 fib(3) 和 fib(2) 汇总'],
      rightPanelNarration: [],
      recommendedType: 'interactive_html',
      confidence: 0.92,
    },
  })}`;

  assert.match(prompt, /single-pass|一次性/i);
  assert.match(prompt, /high-resource|高资源|最大.*资源/i);
  assert.match(prompt, /internal self-check|内部自检/i);
  assert.match(prompt, /state machine|真实状态机/i);
  assert.match(prompt, /id="start-btn"/);
  assert.match(prompt, /id="reset-btn"/);
  assert.match(prompt, /SVG\/Canvas\/DOM/i);
  assert.match(prompt, /first viewport|首屏/i);
  assert.match(prompt, /not a generic explanation page|不是通用解释页/i);
  assert.match(prompt, /not a marketing|不要.*营销/i);
});

test('deep interaction pipeline composes shared design contract without rewriting markdown prompts', () => {
  const pipelineSource = readProjectFile('src/lib/deep-interaction/agentWidgetPipeline.ts');

  assert.match(pipelineSource, /artifactDesignContractPrompt/);
  assert.match(pipelineSource, /widgetPromptForType/);
  assert.match(pipelineSource, /repairWidgetHtml/);
  assert.match(pipelineSource, /buildInternalMultiAgentPlanningPrompt/);
});

test('deep interaction default pipeline is publish-first and no longer runs a repair loop', () => {
  const pipelineSource = readProjectFile('src/lib/deep-interaction/agentWidgetPipeline.ts');
  const artifactReadyIndex = pipelineSource.indexOf("type: 'artifact_ready'");
  const qualityUpdatedIndex = pipelineSource.indexOf("type: 'artifact_quality_updated'");

  assert.ok(artifactReadyIndex > 0, 'pipeline should emit artifact_ready');
  assert.ok(qualityUpdatedIndex > artifactReadyIndex, 'post-publish quality update should happen after artifact_ready');
  assert.doesNotMatch(pipelineSource, /const MAX_ITERATIONS = 5/);
  assert.doesNotMatch(pipelineSource, /for \(let iteration = 1; iteration <= MAX_ITERATIONS; iteration\+\+\)/);
  assert.doesNotMatch(pipelineSource, /repairArtifact\(/);
  assert.doesNotMatch(pipelineSource, /type: 'repair_started'/);
  assert.doesNotMatch(pipelineSource, /type: 'repair_completed'/);
});
