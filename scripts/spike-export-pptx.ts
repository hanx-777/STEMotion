/**
 * STEMotion Export to PPT feasibility spike.
 *
 * Usage:
 *   npm run spike:export-pptx
 *
 * This script intentionally does not touch product routes or UI. It validates a
 * self-contained STEMotion widget, renders it with Playwright, captures a 16:9
 * screenshot, and writes a small PowerPoint deck with pptxgenjs.
 */

import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pptxgen from 'pptxgenjs';
import { chromium } from 'playwright';
import { validateInteractiveHtml } from '../src/lib/generation/htmlSafety';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const outputDir = resolve(projectRoot, 'tmp', 'export-spike');
const screenshotPath = resolve(outputDir, 'artifact-screenshot.png');
const pptxPath = resolve(outputDir, 'stemotion-export-spike.pptx');
const companionHtmlPath = resolve(outputDir, 'interactive-demo.html');
const readmePath = resolve(outputDir, 'README.md');
const companionHtmlHref = 'interactive-demo.html';

const slideWidth = 13.333;
const screenshotWidth = 12;
const screenshotHeight = 6.75;

interface SpikeArtifact {
  title: string;
  description: string;
  schema: {
    htmlWidget: {
      html: string;
    };
  };
  blueprint: {
    topic: string;
    learningObjectives: string[];
    coreVariables: Array<{ symbol: string; name: string; role: string; unit?: string }>;
    expectedInsight: string;
  };
  qualityReport: {
    finalScore: number;
    level: string;
    strengths: string[];
    suggestions: string[];
  };
}

const artifact: SpikeArtifact = {
  title: 'Ohm Law Export Spike',
  description: 'A minimal self-contained STEMotion widget used to validate screenshot and PPTX export.',
  schema: {
    htmlWidget: {
      html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ohm Law Export Spike</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; font-family: Arial, sans-serif; background: #f8fafc; color: #172033; }
    body { display: grid; place-items: center; padding: 18px; }
    .widget { width: min(100%, 1180px); min-height: 680px; display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(300px, .65fr); gap: 14px; }
    header { grid-column: 1 / -1; padding: 12px 14px; border: 1px solid #dbe3ef; border-radius: 8px; background: #ffffff; }
    h1 { margin: 0 0 4px; font-size: 26px; }
    p { margin: 0; line-height: 1.5; }
    .panel { border: 1px solid #dbe3ef; border-radius: 8px; background: #ffffff; padding: 14px; }
    .stage { position: relative; min-height: 470px; overflow: hidden; }
    canvas { width: 100%; height: 390px; border: 1px solid #cbd5e1; border-radius: 8px; background: linear-gradient(180deg, #eef6ff 0%, #ffffff 100%); }
    .controls { display: grid; gap: 12px; }
    label { display: grid; gap: 5px; font-size: 13px; font-weight: 700; }
    input[type="range"] { width: 100%; accent-color: #2563eb; }
    button { min-height: 38px; border: 0; border-radius: 8px; padding: 0 12px; background: #172033; color: #ffffff; font-weight: 700; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; }
    .metric { border-radius: 8px; background: #eff6ff; padding: 10px; font-weight: 800; }
    .formula { font-size: 20px; font-weight: 900; color: #1d4ed8; }
    .quiz button { width: 100%; margin-top: 8px; background: #f8fafc; color: #172033; border: 1px solid #cbd5e1; text-align: left; }
    .highlight { outline: 4px solid #f59e0b; outline-offset: 3px; }
    @media (max-width: 760px) {
      body { padding: 10px; }
      .widget { grid-template-columns: 1fr; min-height: auto; }
      canvas { height: 320px; }
    }
  </style>
</head>
<body>
  <main class="widget">
    <header>
      <h1>Ohm Law Interactive Snapshot</h1>
      <p>Adjust voltage and resistance to observe how current changes according to I = U / R.</p>
    </header>
    <section class="panel stage" data-role="simulation-main" id="simulation-main">
      <canvas id="circuit" width="820" height="430" aria-label="Simple circuit visualization"></canvas>
    </section>
    <aside class="panel controls" data-role="control-panel" id="control-panel">
      <label>Voltage U: <span id="voltage-value">6.0 V</span><input id="voltage" type="range" min="1" max="12" step="0.5" value="6"></label>
      <label>Resistance R: <span id="resistance-value">6.0 ohm</span><input id="resistance" type="range" min="1" max="12" step="0.5" value="6"></label>
      <div class="row">
        <button id="start">Pause</button>
        <button id="reset">Reset</button>
      </div>
      <section class="metric" data-role="formula-panel" id="formula-panel">
        <div class="formula">I = U / R = <span id="current-value">1.00 A</span></div>
      </section>
      <section class="metric" data-role="observation-panel" id="observation-panel">
        With resistance fixed, increasing voltage increases current.
      </section>
      <section class="quiz" data-role="quiz-panel" id="quiz-panel">
        <strong>Quick check</strong>
        <button id="quiz-answer">If U doubles and R stays fixed, current doubles.</button>
      </section>
    </aside>
  </main>
  <script type="application/json" id="widget-config">{"concept":"Ohm Law","variables":[{"name":"voltage","symbol":"U","unit":"V"},{"name":"resistance","symbol":"R","unit":"ohm"},{"name":"current","symbol":"I","unit":"A"}],"defaultState":{"voltage":6,"resistance":6,"running":true},"messageTargets":[{"id":"simulation-main","purpose":"circuit visualization"},{"id":"control-panel","purpose":"student controls"},{"id":"observation-panel","purpose":"relationship observation"},{"id":"formula-panel","purpose":"formula readout"},{"id":"quiz-panel","purpose":"quick check"}]}</script>
  <script>
    const canvas = document.getElementById('circuit');
    const ctx = canvas.getContext('2d');
    const voltage = document.getElementById('voltage');
    const resistance = document.getElementById('resistance');
    const voltageValue = document.getElementById('voltage-value');
    const resistanceValue = document.getElementById('resistance-value');
    const currentValue = document.getElementById('current-value');
    const observation = document.getElementById('observation-panel');
    let running = true;
    let pulse = 0;

    function numberValue(input) { return Number(input.value); }
    function current() { return numberValue(voltage) / numberValue(resistance); }
    function updateText() {
      const u = numberValue(voltage);
      const r = numberValue(resistance);
      const i = current();
      voltageValue.textContent = u.toFixed(1) + ' V';
      resistanceValue.textContent = r.toFixed(1) + ' ohm';
      currentValue.textContent = i.toFixed(2) + ' A';
      observation.textContent = r <= 4
        ? 'Lower resistance allows more current for the same voltage.'
        : 'With resistance fixed, increasing voltage increases current.';
    }
    function draw() {
      const u = numberValue(voltage);
      const r = numberValue(resistance);
      const i = current();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 12;
      ctx.strokeStyle = '#334155';
      ctx.strokeRect(120, 105, 570, 205);
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(82, 145, 74, 130);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px Arial';
      ctx.fillText(u.toFixed(1) + 'V', 94, 218);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(360, 82, 110, 48);
      ctx.fillStyle = '#172033';
      ctx.font = 'bold 18px Arial';
      ctx.fillText(r.toFixed(1) + 'ohm', 386, 113);
      const dots = Math.max(3, Math.round(i * 4));
      for (let n = 0; n < dots; n += 1) {
        const x = 175 + ((pulse * 4 + n * 52) % 470);
        ctx.beginPath();
        ctx.arc(x, 105, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#22c55e';
        ctx.fill();
      }
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 28px Arial';
      ctx.fillText('Current I = ' + i.toFixed(2) + ' A', 245, 370);
    }
    function tick() {
      if (running) pulse += 1;
      updateText();
      draw();
      requestAnimationFrame(tick);
    }
    function mark(target) {
      const element = document.querySelector(target || '[data-role="simulation-main"]');
      if (!element) return;
      element.classList.add('highlight');
      setTimeout(() => element.classList.remove('highlight'), 1200);
    }
    voltage.addEventListener('input', updateText);
    resistance.addEventListener('input', updateText);
    document.getElementById('start').addEventListener('click', (event) => {
      running = !running;
      event.currentTarget.textContent = running ? 'Pause' : 'Start';
    });
    document.getElementById('reset').addEventListener('click', () => {
      voltage.value = '6';
      resistance.value = '6';
      running = true;
      document.getElementById('start').textContent = 'Pause';
      updateText();
    });
    document.getElementById('quiz-answer').addEventListener('click', () => {
      observation.textContent = 'Correct: I = U / R, so doubling U doubles I when R is unchanged.';
    });
    window.addEventListener('message', (event) => {
      const data = event.data || {};
      if (data.type === 'SET_WIDGET_STATE' && data.state) {
        if (data.state.voltage !== undefined) voltage.value = String(data.state.voltage);
        if (data.state.resistance !== undefined) resistance.value = String(data.state.resistance);
        if (data.state.running !== undefined) running = Boolean(data.state.running);
        updateText();
      }
      if (data.type === 'HIGHLIGHT_ELEMENT') mark(data.target);
      if (data.type === 'ANNOTATE_ELEMENT') {
        const element = document.querySelector(data.target || '[data-role="observation-panel"]');
        if (element && data.content) element.setAttribute('title', String(data.content));
      }
      if (data.type === 'REVEAL_ELEMENT') {
        const element = document.querySelector(data.target || '[data-role="formula-panel"]');
        if (element) element.hidden = false;
      }
    });
    updateText();
    tick();
    if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'WIDGET_READY' }, '*');
  </script>
</body>
</html>`,
    },
  },
  blueprint: {
    topic: 'Ohm Law',
    learningObjectives: [
      'Explain the relationship between voltage, resistance, and current.',
      'Use I = U / R to predict current when voltage or resistance changes.',
      'Identify voltage and resistance as controllable variables.',
    ],
    coreVariables: [
      { symbol: 'U', name: 'Voltage', role: 'independent', unit: 'V' },
      { symbol: 'R', name: 'Resistance', role: 'independent', unit: 'ohm' },
      { symbol: 'I', name: 'Current', role: 'dependent', unit: 'A' },
    ],
    expectedInsight: 'Current increases as voltage increases and decreases as resistance increases, following I = U / R.',
  },
  qualityReport: {
    finalScore: 91,
    level: 'excellent',
    strengths: [
      'The widget keeps voltage, resistance, and current visible together.',
      'The formula and observation panel reinforce the expected insight.',
      'Stable data-role targets support teacher actions.',
    ],
    suggestions: [
      'Add a second scenario comparing two resistors side by side.',
      'Include a short reflection prompt after the quiz.',
    ],
  },
};

async function main() {
  const start = Date.now();
  const interceptedRequests: string[] = [];

  await mkdir(outputDir, { recursive: true });

  const html = artifact.schema.htmlWidget.html;
  const safetyResult = validateInteractiveHtml(html);
  if (!safetyResult.ok) {
    throw new Error(`HTML safety check failed: ${safetyResult.errors.join(' ')}`);
  }

  try {
    await renderScreenshot(html, interceptedRequests);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isMissingPlaywrightBrowserError(message)) {
      console.error('Playwright Chromium is not installed. Run: npx playwright install chromium');
    }
    throw error;
  }

  await writeCompanionFiles(html);
  const companionInteractivityOk = await verifyCompanionHtmlInteractivity();
  const hyperlinkWritten = await createPptx();

  const elapsedMs = Date.now() - start;
  const screenshotSize = await fileSize(screenshotPath);
  const pptxSize = await fileSize(pptxPath);
  const companionHtmlSize = await fileSize(companionHtmlPath);
  const readmeSize = await fileSize(readmePath);

  console.log('\nSTEMotion Export to PPT spike completed.');
  console.log(`PPTX: ${pptxPath}`);
  console.log(`Screenshot: ${screenshotPath}`);
  console.log(`Interactive HTML: ${companionHtmlPath}`);
  console.log(`Bundle README: ${readmePath}`);
  console.log(`PPTX size: ${formatBytes(pptxSize)}`);
  console.log(`Screenshot size: ${formatBytes(screenshotSize)}`);
  console.log(`Interactive HTML size: ${formatBytes(companionHtmlSize)}`);
  console.log(`Bundle README size: ${formatBytes(readmeSize)}`);
  console.log(`HTML safety check: passed`);
  console.log(`Network requests blocked: ${interceptedRequests.length}`);
  if (interceptedRequests.length > 0) {
    for (const url of interceptedRequests.slice(0, 8)) {
      console.log(`  - ${url}`);
    }
    if (interceptedRequests.length > 8) console.log(`  ... ${interceptedRequests.length - 8} more`);
  }
  console.log(`Hyperlink written: ${hyperlinkWritten ? 'yes' : 'no'}`);
  console.log(`Hyperlink target: ${companionHtmlHref}`);
  console.log(`Companion HTML local browser interactivity check: ${companionInteractivityOk ? 'passed' : 'failed'}`);
  console.log('Note: local or relative PPT hyperlinks may be blocked by PowerPoint, WPS, Keynote, or OS security policies. Verify manually.');
  console.log(`Elapsed: ${(elapsedMs / 1000).toFixed(2)}s`);
}

async function writeCompanionFiles(html: string) {
  const safetyResult = validateInteractiveHtml(html);
  if (!safetyResult.ok) {
    throw new Error(`Companion HTML safety check failed: ${safetyResult.errors.join(' ')}`);
  }

  await writeFile(companionHtmlPath, html, 'utf8');
  await writeFile(readmePath, buildBundleReadme(), 'utf8');
}

function buildBundleReadme(): string {
  return `# STEMotion Teaching Presentation Bundle

This folder is a feasibility spike output, not a production export feature.

## Files

- \`stemotion-export-spike.pptx\` is a static teaching presentation deck.
- \`artifact-screenshot.png\` is the 16:9 snapshot used inside the deck.
- \`interactive-demo.html\` is the real interactive experiment.
- \`README.md\` explains how to use this bundle.

## How to Use

1. Open \`stemotion-export-spike.pptx\` for classroom explanation or presentation.
2. Use the "Open Interactive Experiment" link on the Interactive Demo slide when your presentation software allows local hyperlinks.
3. If the PPT link does not open, manually double-click \`interactive-demo.html\` in this same folder.
4. Keep the PPTX and HTML files in the same folder when moving or sharing this bundle.

## Important Limitation

Ordinary PPTX files do not guarantee embedded execution of HTML, CSS, JavaScript, or Canvas widgets. This bundle uses PowerPoint as the teaching deck and the companion HTML file as the true interactive environment.

No prompt text, API key, model profile, or sensitive configuration is included in this spike bundle.
`;
}

async function renderScreenshot(html: string, interceptedRequests: string[]) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      serviceWorkers: 'block',
    });
    context.setDefaultTimeout(10_000);
    context.setDefaultNavigationTimeout(10_000);

    await context.route('**/*', async (route) => {
      const requestUrl = route.request().url();
      if (/^(https?|file|ftp|wss?):/i.test(requestUrl)) {
        interceptedRequests.push(requestUrl);
        await route.abort();
        return;
      }
      await route.continue();
    });

    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 10_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: screenshotPath,
      type: 'png',
      fullPage: false,
      timeout: 10_000,
    });
    await context.close();
  } finally {
    await browser.close();
  }
}

async function createPptx(): Promise<boolean> {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'STEMotion';
  pptx.company = 'STEMotion';
  pptx.subject = 'Export to PPT feasibility spike';
  pptx.title = artifact.title;
  pptx.theme = {
    headFontFace: 'Aptos Display',
    bodyFontFace: 'Aptos',
  };

  addTitleSlide(pptx);
  addLearningObjectivesSlide(pptx);
  addScreenshotSlide(pptx);
  addInsightSlide(pptx);
  addQualitySlide(pptx);
  const hyperlinkWritten = addInteractiveDemoSlide(pptx);

  await pptx.writeFile({ fileName: pptxPath });
  return hyperlinkWritten;
}

function addTitleSlide(pptx: pptxgen) {
  const slide = pptx.addSlide();
  addSlideBackground(slide);
  slide.addText('STEMotion Export Spike', {
    x: 0.75,
    y: 0.8,
    w: 11.8,
    h: 0.55,
    fontSize: 18,
    bold: true,
    color: '2563EB',
    margin: 0,
  });
  slide.addText(artifact.title, {
    x: 0.75,
    y: 1.5,
    w: 11.8,
    h: 0.9,
    fontSize: 34,
    bold: true,
    color: '172033',
    margin: 0,
    breakLine: false,
    fit: 'shrink',
  });
  slide.addText(artifact.description, {
    x: 0.78,
    y: 2.62,
    w: 10.5,
    h: 0.72,
    fontSize: 16,
    color: '475569',
    fit: 'shrink',
    margin: 0,
  });
  slide.addShape('roundRect', {
    x: 0.78,
    y: 4.25,
    w: 4.2,
    h: 1.25,
    rectRadius: 0.08,
    fill: { color: 'EFF6FF' },
    line: { color: 'BFDBFE', width: 1 },
  });
  slide.addText(`Topic\n${artifact.blueprint.topic}`, {
    x: 1.05,
    y: 4.52,
    w: 3.6,
    h: 0.75,
    fontSize: 15,
    bold: true,
    color: '1E3A8A',
    breakLine: false,
    fit: 'shrink',
  });
  slide.addText(`Quality Score\n${artifact.qualityReport.finalScore} (${artifact.qualityReport.level})`, {
    x: 5.35,
    y: 4.52,
    w: 4.2,
    h: 0.75,
    fontSize: 15,
    bold: true,
    color: '166534',
    breakLine: false,
    fit: 'shrink',
  });
}

function addLearningObjectivesSlide(pptx: pptxgen) {
  const slide = pptx.addSlide();
  addSlideBackground(slide);
  addHeading(slide, 'Learning Objectives');
  addBullets(slide, artifact.blueprint.learningObjectives, 0.9, 1.35, 11.6, 3.6);
  slide.addText('These objectives are sourced from the test artifact blueprint fixture.', {
    x: 0.9,
    y: 6.45,
    w: 11.6,
    h: 0.35,
    fontSize: 11,
    color: '64748B',
    margin: 0,
  });
}

function addScreenshotSlide(pptx: pptxgen) {
  const slide = pptx.addSlide();
  slide.background = { color: 'F8FAFC' };
  slide.addText('Artifact Snapshot', {
    x: 0.65,
    y: 0.16,
    w: 5,
    h: 0.32,
    fontSize: 15,
    bold: true,
    color: '172033',
    margin: 0,
  });
  slide.addImage({
    path: screenshotPath,
    x: (slideWidth - screenshotWidth) / 2,
    y: 0.62,
    w: screenshotWidth,
    h: screenshotHeight,
  });
}

function addInteractiveDemoSlide(pptx: pptxgen): boolean {
  const slide = pptx.addSlide();
  addSlideBackground(slide);
  addHeading(slide, 'Interactive Demo');
  slide.addText('Use the deck for explanation, then open the companion HTML file for the real interaction.', {
    x: 0.9,
    y: 1.08,
    w: 11.4,
    h: 0.35,
    fontSize: 13,
    color: '475569',
    margin: 0,
    fit: 'shrink',
  });
  slide.addImage({
    path: screenshotPath,
    x: 0.9,
    y: 1.65,
    w: 7.15,
    h: 4.02,
  });
  slide.addText('Companion file', {
    x: 8.55,
    y: 1.8,
    w: 3.6,
    h: 0.28,
    fontSize: 14,
    bold: true,
    color: '172033',
    margin: 0,
  });
  slide.addText(companionHtmlHref, {
    x: 8.55,
    y: 2.2,
    w: 3.9,
    h: 0.35,
    fontSize: 16,
    bold: true,
    color: '1D4ED8',
    margin: 0,
  });
  slide.addText('If the local hyperlink is blocked, open this HTML file manually from the same folder.', {
    x: 8.55,
    y: 2.72,
    w: 3.9,
    h: 0.72,
    fontSize: 12,
    color: '64748B',
    margin: 0,
    fit: 'shrink',
  });
  slide.addShape('roundRect', {
    x: 8.55,
    y: 4.1,
    w: 3.8,
    h: 0.72,
    rectRadius: 0.08,
    fill: { color: '2563EB' },
    line: { color: '1D4ED8', width: 1 },
    hyperlink: {
      url: companionHtmlHref,
      tooltip: 'Open interactive-demo.html',
    },
  });
  slide.addText('Open Interactive Experiment', {
    x: 8.78,
    y: 4.3,
    w: 3.34,
    h: 0.28,
    fontSize: 13,
    bold: true,
    color: 'FFFFFF',
    margin: 0,
    align: 'center',
    fit: 'shrink',
    hyperlink: {
      url: companionHtmlHref,
      tooltip: 'Open interactive-demo.html',
    },
  });
  slide.addText('Compatibility with PowerPoint, WPS, and Keynote must be checked manually.', {
    x: 0.9,
    y: 6.35,
    w: 11.4,
    h: 0.35,
    fontSize: 11,
    color: '64748B',
    margin: 0,
  });
  return true;
}

function addInsightSlide(pptx: pptxgen) {
  const slide = pptx.addSlide();
  addSlideBackground(slide);
  addHeading(slide, 'Expected Insight / Core Variables');
  slide.addText(artifact.blueprint.expectedInsight, {
    x: 0.9,
    y: 1.35,
    w: 11.6,
    h: 0.9,
    fontSize: 18,
    bold: true,
    color: '1E3A8A',
    fit: 'shrink',
    margin: 0,
  });

  const rows = [
    ['Symbol', 'Variable', 'Role', 'Unit'],
    ...artifact.blueprint.coreVariables.map((item) => [item.symbol, item.name, item.role, item.unit ?? '']),
  ];
  slide.addTable(rows as unknown as pptxgen.TableRow[], {
    x: 0.9,
    y: 2.7,
    w: 11.3,
    h: 2.15,
    border: { color: 'CBD5E1', pt: 1 },
    fill: { color: 'FFFFFF' },
    color: '172033',
    fontFace: 'Aptos',
    fontSize: 13,
    margin: 0.12,
  });
}

function addQualitySlide(pptx: pptxgen) {
  const slide = pptx.addSlide();
  addSlideBackground(slide);
  addHeading(slide, 'Quality Report');
  slide.addText(`Final score: ${artifact.qualityReport.finalScore} / 100\nLevel: ${artifact.qualityReport.level}`, {
    x: 0.9,
    y: 1.2,
    w: 4.2,
    h: 0.75,
    fontSize: 18,
    bold: true,
    color: '166534',
    margin: 0,
  });
  slide.addText('Strengths', {
    x: 0.9,
    y: 2.25,
    w: 5.5,
    h: 0.32,
    fontSize: 17,
    bold: true,
    color: '172033',
    margin: 0,
  });
  addBullets(slide, artifact.qualityReport.strengths, 0.9, 2.75, 5.5, 2.6, 13);
  slide.addText('Suggestions', {
    x: 7,
    y: 2.25,
    w: 5.5,
    h: 0.32,
    fontSize: 17,
    bold: true,
    color: '172033',
    margin: 0,
  });
  addBullets(slide, artifact.qualityReport.suggestions, 7, 2.75, 5.3, 2.6, 13);
}

function addSlideBackground(slide: pptxgen.Slide) {
  slide.background = { color: 'F8FAFC' };
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: slideWidth,
    h: 0.12,
    fill: { color: '2563EB' },
    line: { color: '2563EB' },
  });
}

function addHeading(slide: pptxgen.Slide, text: string) {
  slide.addText(text, {
    x: 0.9,
    y: 0.55,
    w: 11.5,
    h: 0.5,
    fontSize: 26,
    bold: true,
    color: '172033',
    margin: 0,
    fit: 'shrink',
  });
}

function addBullets(
  slide: pptxgen.Slide,
  items: string[],
  x: number,
  y: number,
  w: number,
  h: number,
  fontSize = 16,
) {
  slide.addText(
    items.map((item) => `- ${item}`).join('\n'),
    {
      x,
      y,
      w,
      h,
      fontSize,
      color: '334155',
      margin: 0.08,
      breakLine: false,
      fit: 'shrink',
      paraSpaceAfter: 10,
    },
  );
}

async function verifyCompanionHtmlInteractivity(): Promise<boolean> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      serviceWorkers: 'block',
    });
    context.setDefaultTimeout(10_000);
    context.setDefaultNavigationTimeout(10_000);

    const companionUrl = pathToFileURL(companionHtmlPath).href;
    await context.route('**/*', async (route) => {
      const requestUrl = route.request().url();
      if (requestUrl === companionUrl) {
        await route.continue();
        return;
      }
      if (/^(https?|file|ftp|wss?):/i.test(requestUrl)) {
        await route.abort();
        return;
      }
      await route.continue();
    });

    const page = await context.newPage();
    await page.goto(companionUrl, { waitUntil: 'domcontentloaded', timeout: 10_000 });
    await page.waitForTimeout(500);

    await page.locator('#voltage').evaluate((element) => {
      const input = element as HTMLInputElement;
      input.value = '9';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const changedCurrent = (await page.locator('#current-value').textContent())?.trim() ?? '';

    await page.locator('#reset').click();
    const resetCurrent = (await page.locator('#current-value').textContent())?.trim() ?? '';

    await context.close();
    return changedCurrent.includes('1.50 A') && resetCurrent.includes('1.00 A');
  } finally {
    await browser.close();
  }
}

async function fileSize(path: string): Promise<number> {
  return (await stat(path)).size;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function isMissingPlaywrightBrowserError(message: string): boolean {
  return /Executable doesn't exist|browserType\.launch|playwright install/i.test(message);
}

main().catch((error) => {
  console.error('\nSTEMotion Export to PPT spike failed.');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  console.error('\nNext step suggestion: fix the reported spike blocker before adding any API route or UI.');
  process.exitCode = 1;
});
