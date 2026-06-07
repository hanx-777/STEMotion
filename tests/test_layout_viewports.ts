import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import type { InteractionArtifact, InteractionSession } from '../src/lib/deep-interaction/types';
import { createRagVisualizationArtifact } from '../src/lib/rag/visualization/artifactAdapter';
import type { VisualizationSpec } from '../src/lib/rag/visualization/types';

const REPO_ROOT = process.cwd();
const HOST = '127.0.0.1';
const VIEWPORTS = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '375x812', width: 375, height: 812 },
];

test('Round 005 layout stays usable across Edge viewports', { timeout: 180_000 }, async () => {
  const server = await startNextDevServer();
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });

    for (const viewport of VIEWPORTS) {
      await checkDeepInteractionViewport(browser, server.baseUrl, viewport);
      await checkRagVisualizationViewport(browser, server.baseUrl, viewport);
    }
  } finally {
    await browser?.close();
    await stopNextDevServer(server.child);
  }
});

async function checkDeepInteractionViewport(
  browser: Browser,
  baseUrl: string,
  viewport: { name: string; width: number; height: number },
) {
  const { page, errors } = await newInstrumentedPage(browser, viewport);
  await seedLocalStorage(page, createDeepInteractionPersistedState());

  try {
    await page.goto(`${baseUrl}/lab`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-deep-artifact-stage]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(150);

    const shellBox = await requiredBox(page, '[data-deep-layout-shell]', `${viewport.name} deep shell`);
    const mainBox = await requiredBox(page, '[data-deep-main-stage]', `${viewport.name} deep main`);
    const artifactBox = await requiredBox(page, '[data-deep-artifact-viewport]', `${viewport.name} artifact viewport`);
    const htmlBox = await requiredBox(page, '[data-html-widget-shell]', `${viewport.name} HTML widget`);

    assert.ok(artifactBox.width >= Math.min(360, shellBox.width * 0.55), `${viewport.name} artifact stage is too narrow`);
    assert.ok(visibleHeight(artifactBox, viewport.height) >= Math.min(300, viewport.height * 0.45), `${viewport.name} artifact stage is not first-screen visible`);
    assert.ok(htmlBox.height >= Math.min(260, viewport.height * 0.35), `${viewport.name} HTML widget is too short`);
    assert.equal(await computedOverflowY(page, '[data-deep-artifact-viewport]'), 'hidden', `${viewport.name} artifact viewport should own a single clipped stage`);

    if (viewport.width >= 1280) {
      const rightBox = await requiredBox(page, '[data-deep-right-panel]', `${viewport.name} deep right panel`);
      const activeWidth = mainBox.width + rightBox.width;
      assert.ok(mainBox.width / activeWidth >= 0.72, `${viewport.name} deep main stage should dominate the right panel`);
      assert.ok(rightBox.width / activeWidth <= 0.30, `${viewport.name} deep right panel is too wide`);
    } else {
      const mobileBox = await requiredBox(page, '[data-deep-mobile-panel]', `${viewport.name} mobile panel`);
      assert.ok(mobileBox.height <= 96, `${viewport.name} mobile generator panel should stay collapsed over artifacts`);
      assert.ok(mobileBox.y >= artifactBox.y + artifactBox.height * 0.55, `${viewport.name} mobile panel overlaps the artifact interaction center`);
    }

    assertNoErrors(errors, `${viewport.name} /lab`);
  } finally {
    await page.close();
  }
}

async function checkRagVisualizationViewport(
  browser: Browser,
  baseUrl: string,
  viewport: { name: string; width: number; height: number },
) {
  const { page, errors } = await newInstrumentedPage(browser, viewport);
  await seedLocalStorage(page, createRagPersistedState());

  try {
    await page.goto(`${baseUrl}/learn`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-rag-console]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByRole('button', { name: /展开本地学习会话/ }).click();
    await page.locator('button').filter({ hasText: '斜抛运动视口测试' }).first().click();
    await page.locator('[data-rag-visualization-panel]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-rag-workspace-scroll]').evaluate((node) => {
      node.scrollTop = 0;
    });
    await page.waitForTimeout(150);

    const workspaceBox = await requiredBox(page, '[data-rag-workspace-scroll]', `${viewport.name} RAG workspace`);
    const panelBox = await requiredBox(page, '[data-rag-visualization-panel]', `${viewport.name} RAG visualization panel`);
    const stageBox = await requiredBox(page, '[data-rag-visualization-stage]', `${viewport.name} RAG visualization stage`);
    const explanationBox = await requiredBox(page, '[data-rag-explanation-panel]', `${viewport.name} RAG explanation panel`);

    assert.ok(panelBox.y < viewport.height * 0.55, `${viewport.name} RAG visualization panel should be promoted into the first screen`);
    assert.ok(stageBox.y < viewport.height, `${viewport.name} RAG stage starts below the visible viewport`);
    const ragVisibleHeight = visibleHeight(stageBox, viewport.height);
    const ragRequiredHeight = Math.min(260, viewport.height * 0.34);
    assert.ok(
      ragVisibleHeight >= ragRequiredHeight,
      `${viewport.name} RAG stage has too little visible area: y=${Math.round(stageBox.y)}, height=${Math.round(stageBox.height)}, visible=${Math.round(ragVisibleHeight)}, required=${Math.round(ragRequiredHeight)}`,
    );
    assert.equal(await computedOverflowY(page, '[data-rag-visualization-panel]'), 'visible', `${viewport.name} visualization panel should not introduce another vertical scroller`);

    if (viewport.width >= 1024) {
      const activeWidth = stageBox.width + explanationBox.width;
      assert.ok(stageBox.width / activeWidth >= 0.70, `${viewport.name} RAG visual stage should dominate the explanation panel`);
      assert.ok(explanationBox.width / activeWidth <= 0.30, `${viewport.name} RAG explanation panel is too wide`);
    } else {
      assert.ok(stageBox.width >= workspaceBox.width * 0.88, `${viewport.name} mobile RAG stage should use most of the workspace width`);
      assert.ok(explanationBox.y >= stageBox.y + stageBox.height - 2, `${viewport.name} mobile explanation should stack below the visual stage`);
    }

    assertNoErrors(errors, `${viewport.name} /learn`);
  } finally {
    await page.close();
  }
}

async function newInstrumentedPage(
  browser: Browser,
  viewport: { width: number; height: number },
): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage({ viewport });
  const errors: string[] = [];

  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && !text.startsWith('Failed to load resource')) {
      errors.push(`console: ${text}`);
    }
  });
  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && !isIgnoredResponse(response.url())) {
      errors.push(`network ${response.status()}: ${response.url()}`);
    }
  });

  return { page, errors };
}

async function seedLocalStorage(page: Page, entries: Record<string, unknown>) {
  await page.addInitScript((items) => {
    try {
      if (window.self !== window.top) return;
    } catch {
      return;
    }
    for (const [key, value] of Object.entries(items)) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Sandboxed frames cannot access storage; only the top app frame needs fixtures.
      }
    }
  }, entries);
}

function createDeepInteractionPersistedState(): Record<string, unknown> {
  const now = '2026-06-01T00:00:00.000Z';
  const sessionId = 'layout_lab_session';
  const artifact = createHtmlWidgetArtifact(sessionId, now);
  const session: InteractionSession = {
    id: sessionId,
    title: 'HTML Widget 视口测试',
    topic: '斜抛运动互动实验',
    subject: 'physics',
    gradeLevel: 'high_school',
    mode: 'deep_interaction',
    interactionType: 'simulation',
    status: 'ready',
    progress: 100,
    messages: [
      { id: 'layout_lab_user', role: 'user', content: '生成一个斜抛运动互动实验', createdAt: now },
      { id: 'layout_lab_assistant', role: 'assistant', content: '已生成互动实验。', relatedArtifactId: artifact.id, createdAt: now },
    ],
    artifacts: [artifact],
    currentArtifactId: artifact.id,
    createdAt: now,
    updatedAt: now,
  };

  return {
    'stemotion-interaction-sessions': {
      state: { sessions: [session], currentSessionId: sessionId },
      version: 2,
    },
    'stemotion-interaction-artifacts': {
      state: { artifactsBySession: { [sessionId]: [artifact] } },
      version: 2,
    },
  };
}

function createRagPersistedState(): Record<string, unknown> {
  const now = '2026-06-01T00:00:00.000Z';
  const artifact = createRagVisualizationArtifact({
    spec: projectileSpec,
    source: 'student',
    subject: 'physics_mechanics',
    originalQuestion: '初速度 8m/s，抛射角 35°，观察轨迹和关键运动量',
    taskType: 'step_solution',
    now,
  });
  const citation = {
    source_type: 'local' as const,
    source: 'mechanics.md',
    page: 1,
    chunk_id: 'layout_chunk',
    subject: 'physics_mechanics',
    file_name: 'mechanics.md',
  };
  const result = {
    subject: 'physics_mechanics',
    subject_display_name: '大学物理力学',
    task_type: 'step_solution',
    answer_protocol: 'json',
    answer: '斜抛运动可以分解为水平方向匀速运动和竖直方向匀变速运动。',
    answer_sections: [
      {
        id: 'analysis',
        title: '运动分解',
        content: '水平方向速度保持不变，竖直方向受重力影响。',
      },
    ],
    formula_blocks: [{ id: 'range', label: '水平射程', latex: 'R=\\frac{v_0^2\\sin 2\\theta}{g}' }],
    final_results: [{ label: '可观察指标', value: '最大高度、水平射程、飞行时间' }],
    citations: [citation],
    retrieved_chunks: [
      {
        content: '斜抛运动的水平分量保持恒定，竖直分量按重力加速度变化。',
        score: 0.92,
        metadata: {
          source: 'mechanics.md',
          subject: 'physics_mechanics',
          file_name: 'mechanics.md',
          page: 1,
          chunk_id: 'layout_chunk',
          created_at: now,
          source_type: 'local',
        },
      },
    ],
    source_summary: { local_count: 1, web_count: 0 },
    retrieval_report: {
      local_candidate_count: 1,
      local_reliable_count: 1,
      web_count: 0,
      top_local_score: 0.92,
      lexical_top_k: 6,
      embedding_top_k: 6,
      rerank_top_k: 6,
      evidence_threshold: 0.35,
      used_embedding: true,
      triggered_web_search: false,
      low_evidence: false,
      rewritten_queries: [],
      keywords: ['斜抛运动', '最大高度', '水平射程'],
    },
    quality_report: { passed: true, score: 90, checks: [] },
    visualization_artifact: artifact,
    visualization_status: 'ready',
    auto_saved_at: now,
  };
  const session = {
    id: 'layout_rag_session',
    title: '斜抛运动视口测试',
    question: '初速度 8m/s，抛射角 35°，观察轨迹和关键运动量',
    subject: 'physics_mechanics',
    taskType: 'step_solution',
    useWebSearch: false,
    result,
    demoFallback: false,
    createdAt: now,
    updatedAt: now,
  };

  return {
    'stemotion-rag-sessions': {
      state: { sessions: [session], currentSessionId: session.id },
      version: 1,
    },
  };
}

function createHtmlWidgetArtifact(sessionId: string, now: string): InteractionArtifact {
  return {
    id: 'layout_html_widget_artifact',
    sessionId,
    type: 'simulation',
    title: '斜抛运动互动实验',
    description: '调节初速度和角度，观察轨迹、最大高度、飞行时间与水平射程。',
    status: 'ready',
    version: 1,
    createdAt: now,
    updatedAt: now,
    schema: {
      type: 'simulation',
      title: '斜抛运动互动实验',
      description: '调节初速度和角度，观察轨迹、最大高度、飞行时间与水平射程。',
      subject: 'physics',
      simulationType: 'generic_simulation',
      learningGoals: ['理解速度分解', '观察角度对射程的影响'],
      explanationSteps: [
        { id: 'setup', title: '设置参数', narration: '选择初速度和抛射角。' },
        { id: 'observe', title: '观察轨迹', narration: '比较最大高度和水平射程。' },
      ],
      parameters: [
        { id: 'v0', label: '初速度', value: 8, defaultValue: 8, min: 1, max: 30, step: 1, unit: 'm/s' },
        { id: 'theta', label: '抛射角', value: 35, defaultValue: 35, min: 5, max: 80, step: 1, unit: 'deg' },
      ],
      objects: [{ id: 'ball', label: '小球', objectType: 'generic' }],
      formulas: [{ id: 'range', title: '水平射程', latex: 'R=\\frac{v_0^2\\sin 2\\theta}{g}', explanation: '忽略空气阻力。' }],
      actions: [],
      metrics: [
        { id: 'height', label: '最大高度', unit: 'm' },
        { id: 'range', label: '水平射程', unit: 'm' },
      ],
      htmlWidget: {
        html: htmlWidgetFixture,
        widgetType: 'simulation',
        widgetConfig: {
          concept: '斜抛运动',
          variables: [],
          defaultState: { v0: 8, theta: 35 },
          messageTargets: [{ id: 'stage', purpose: '更新轨迹参数' }],
        },
        allowedMessageTypes: ['SET_WIDGET_STATE'],
      },
    },
  };
}

const projectileSpec: VisualizationSpec = {
  type: 'projectile_motion',
  title: '斜抛运动可视化',
  description: '观察初速度、角度和重力如何共同决定轨迹。',
  knowledgePoint: '斜抛运动',
  scenario: '二维抛体轨迹',
  visualGoal: '观察轨迹、速度分解、最大高度和水平射程。',
  variables: [
    { name: 'v0', label: '初速度', value: '8', unit: 'm/s' },
    { name: 'theta', label: '抛射角', value: '35', unit: 'deg' },
  ],
  brief: {
    originalQuestion: '初速度 8m/s，抛射角 35°，观察轨迹和关键运动量',
    knowledgePoint: '斜抛运动',
    scenario: '二维抛体轨迹',
    variables: [
      { name: 'v0', label: '初速度', value: '8', unit: 'm/s' },
      { name: 'theta', label: '抛射角', value: '35', unit: 'deg' },
    ],
    visualGoal: '观察轨迹、速度分解、最大高度和水平射程。',
    recommendedType: 'projectile_motion',
    mustShow: ['轨迹', '最大高度', '水平射程'],
    avoidGenericDemo: true,
    confidence: 0.9,
    source: 'heuristic',
  },
  parameters: {
    v0: 8,
    angle_deg: 35,
    g: 9.8,
  },
};

const htmlWidgetFixture = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; min-height: 100%; background: #f8fafc; font-family: system-ui, sans-serif; }
      .stage { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) 220px; gap: 16px; padding: 18px; box-sizing: border-box; color: #0f172a; }
      .canvas { border: 1px solid #cbd5e1; border-radius: 8px; background: linear-gradient(#eff6ff, #f8fafc 58%, #dcfce7 58%); position: relative; overflow: hidden; }
      .arc { position: absolute; inset: 12% 8% 22%; border-top: 4px solid #2563eb; border-radius: 50% 50% 0 0; transform: skewX(-8deg); }
      .ball { position: absolute; left: 56%; top: 30%; width: 20px; height: 20px; border-radius: 999px; background: #f97316; box-shadow: 0 10px 20px rgba(249, 115, 22, .24); }
      .metrics { display: grid; gap: 10px; align-content: start; }
      .metric { border: 1px solid #cbd5e1; border-radius: 8px; background: white; padding: 12px; }
      .label { font-size: 12px; color: #64748b; }
      .value { margin-top: 6px; font-size: 22px; font-weight: 800; }
      @media (max-width: 700px) { .stage { grid-template-columns: 1fr; padding: 12px; } .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    </style>
  </head>
  <body>
    <main class="stage" data-fixture-widget>
      <section class="canvas" aria-label="斜抛运动轨迹">
        <div class="arc"></div>
        <div class="ball"></div>
      </section>
      <aside class="metrics">
        <div class="metric"><div class="label">最大高度</div><div class="value">2.1 m</div></div>
        <div class="metric"><div class="label">水平射程</div><div class="value">6.0 m</div></div>
        <div class="metric"><div class="label">飞行时间</div><div class="value">0.94 s</div></div>
      </aside>
    </main>
  </body>
</html>`;

async function requiredBox(page: Page, selector: string, label: string) {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'visible', timeout: 10_000 });
  const box = await locator.boundingBox();
  assert.ok(box, `${label} has no bounding box`);
  return box;
}

function visibleHeight(box: { y: number; height: number }, viewportHeight: number): number {
  return Math.max(0, Math.min(box.y + box.height, viewportHeight) - Math.max(box.y, 0));
}

async function computedOverflowY(page: Page, selector: string): Promise<string> {
  return page.locator(selector).first().evaluate((node) => getComputedStyle(node).overflowY);
}

function assertNoErrors(errors: string[], label: string) {
  assert.deepEqual(errors, [], `${label} emitted browser errors`);
}

function isIgnoredResponse(url: string): boolean {
  return url.endsWith('/favicon.ico');
}

async function startNextDevServer(): Promise<{ child: ChildProcess; baseUrl: string }> {
  const port = await getFreePort();
  const child = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'dev', '--hostname', HOST, '--port', String(port)],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  const appendOutput = (chunk: Buffer) => {
    output = `${output}${chunk.toString()}`.slice(-4000);
  };
  child.stdout.on('data', appendOutput);
  child.stderr.on('data', appendOutput);

  const baseUrl = `http://${HOST}:${port}`;
  await waitForHttp(`${baseUrl}/lab`, () => {
    if (child.exitCode !== null) {
      throw new Error(`next dev exited before readiness.\n${output}`);
    }
  });
  return { child, baseUrl };
}

async function stopNextDevServer(child: ChildProcess) {
  if (child.exitCode !== null || child.killed) return;
  child.kill('SIGTERM');
  await Promise.race([
    once(child, 'exit'),
    delay(5_000).then(() => {
      if (child.exitCode === null && !child.killed) child.kill('SIGKILL');
    }),
  ]);
}

async function getFreePort(): Promise<number> {
  const server = createServer();
  server.listen(0, HOST);
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object', 'could not allocate a port');
  const port = address.port;
  server.close();
  await once(server, 'close');
  return port;
}

async function waitForHttp(url: string, checkProcess: () => void) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    checkProcess();
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      // The dev server is still booting.
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${url}`);
}
