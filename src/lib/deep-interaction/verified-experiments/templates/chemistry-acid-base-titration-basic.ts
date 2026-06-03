import type { VerifiedExperimentTemplate } from '../types';

const html = String.raw`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>酸碱滴定基础实验</title>
  <style>
    *{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f8fafc;color:#172033}.app{min-height:100vh;padding:16px;display:grid;grid-template-columns:minmax(0,1.25fr) minmax(260px,.75fr);gap:12px}header{grid-column:1/-1}.panel{background:#fff;border:1px solid #dbe3ef;border-radius:8px;padding:14px}.stage{min-height:310px;display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:center}.lab{height:270px;position:relative;border-radius:8px;background:linear-gradient(#eef6ff,#fff)}.burette{position:absolute;left:44%;top:12px;width:24px;height:150px;border:3px solid #475569;border-top:0;background:#e0f2fe}.drop{position:absolute;left:calc(44% + 9px);top:160px;width:10px;height:16px;border-radius:50% 50% 60% 60%;background:#38bdf8}.flask{position:absolute;left:33%;bottom:28px;width:120px;height:86px;border:4px solid #475569;border-radius:20px 20px 50px 50px;background:var(--liquid,#f9a8d4);display:grid;place-items:end center;padding-bottom:10px;font-weight:900}.curve{height:270px;border:1px solid #dbe3ef;border-radius:8px;background:#f9fbff}.controls{display:grid;gap:12px}.control label{display:flex;justify-content:space-between;font-size:13px;font-weight:800}.control input{width:100%;accent-color:#0891b2}.buttons{display:flex;gap:8px;flex-wrap:wrap}.buttons button,.quiz button{min-height:38px;border:1px solid #cbd5e1;border-radius:8px;background:#172033;color:#fff;font-weight:800;padding:0 12px}.buttons .secondary{background:#e2e8f0;color:#172033}.metric{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.metric div{border-radius:8px;background:#ecfeff;border:1px solid #a5f3fc;padding:10px;text-align:center}.metric strong{display:block;font-size:22px}.quiz button{display:block;width:100%;margin-top:8px;text-align:left;background:#f8fafc;color:#172033}.highlight{outline:3px solid #f59e0b;outline-offset:3px}@media(max-width:760px){.app{grid-template-columns:1fr;padding:10px}.stage{grid-template-columns:1fr}.metric{grid-template-columns:1fr}}</style>
</head>
<body>
  <main class="app">
    <header><h1>酸碱滴定基础实验</h1><p>滴加强碱，观察强酸-强碱滴定中的 pH、颜色和等量点。</p></header>
    <section class="panel stage" data-role="simulation-main" id="simulation-main"><div class="lab" id="lab"><div class="burette"></div><div class="drop" id="drop"></div><div class="flask" id="flask">溶液</div></div><canvas class="curve" id="curve" width="420" height="270" aria-label="滴定曲线"></canvas></section>
    <aside class="panel controls" data-role="control-panel" id="control-panel">
      <div class="control"><label for="volume">滴加体积 <span id="volume-label">25.0 mL</span></label><input id="volume" data-var="volume" type="range" min="0" max="50" step="0.5" value="25"></div>
      <div class="buttons"><button id="start">自动滴加</button><button id="pause" class="secondary">暂停</button><button id="reset" class="secondary">重置</button></div>
      <div class="metric"><div><span>pH</span><strong id="ph-read">7.0</strong></div><div><span>状态</span><strong id="state-read">等量点附近</strong></div></div>
    </aside>
    <section class="panel" data-role="formula-panel" id="formula-panel"><h2>化学关系</h2><p>强酸-强碱等量点附近 pH 接近 7；不同酸碱体系的终点 pH 不一定都等于 7。</p><p>指示剂颜色应与 pH 区间相关。</p></section>
    <section class="panel" data-role="observation-panel" id="observation-panel"><h2>观察</h2><p id="observation">等量点附近 pH 变化最剧烈。</p></section>
    <section class="panel quiz" data-role="quiz-panel" id="quiz-panel"><h2>小测</h2><p>所有酸碱滴定终点 pH 都等于 7 吗？</p><button data-answer="wrong">是，所有情况都等于 7</button><button data-answer="right">不是，取决于酸碱强弱和指示剂</button><p id="quiz-feedback" aria-live="polite"></p></section>
  </main>
  <script type="application/json" id="widget-config">{"concept":"酸碱滴定","variables":[{"id":"volume","label":"滴加体积","unit":"mL"},{"id":"pH","label":"pH"}],"defaultState":{"volume":25},"messageTargets":[{"id":"simulation-main","purpose":"滴定装置和曲线"},{"id":"control-panel","purpose":"滴加控制"},{"id":"observation-panel","purpose":"观察提示"},{"id":"formula-panel","purpose":"化学关系"},{"id":"quiz-panel","purpose":"小测区"}]}</script>
  <script>
    const volume=document.getElementById('volume'),curve=document.getElementById('curve'),ctx=curve.getContext('2d'),drop=document.getElementById('drop'),flask=document.getElementById('flask');let running=false;
    function ph(v){return 1+12/(1+Math.exp(-(v-25)/1.8))}
    function colorFor(p){if(p<4)return'#f9a8d4';if(p<6.8)return'#fde68a';if(p<8.2)return'#e5e7eb';return'#bfdbfe'}
    function update(){const v=Number(volume.value),p=ph(v);document.getElementById('volume-label').textContent=v.toFixed(1)+' mL';document.getElementById('ph-read').textContent=p.toFixed(1);flask.style.setProperty('--liquid',colorFor(p));let state=p<6.8?'酸性':p>8.2?'碱性':'等量点附近';document.getElementById('state-read').textContent=state;document.getElementById('observation').textContent=Math.abs(v-25)<2?'等量点附近 pH 上升很快，指示剂颜色会明显改变。':'继续滴加时，pH 与颜色会随滴加体积逐步变化。';drawCurve(v)}
    function drawCurve(v){ctx.clearRect(0,0,curve.width,curve.height);ctx.strokeStyle='#cbd5e1';ctx.lineWidth=1;for(let i=0;i<=5;i++){const y=20+i*45;ctx.beginPath();ctx.moveTo(35,y);ctx.lineTo(curve.width-15,y);ctx.stroke()}ctx.strokeStyle='#0891b2';ctx.lineWidth=4;ctx.beginPath();for(let x=0;x<=50;x+=0.5){const px=35+x*(curve.width-55)/50,py=curve.height-25-ph(x)*(curve.height-55)/14;if(x===0)ctx.moveTo(px,py);else ctx.lineTo(px,py)}ctx.stroke();ctx.fillStyle='#ef4444';const px=35+v*(curve.width-55)/50,py=curve.height-25-ph(v)*(curve.height-55)/14;ctx.beginPath();ctx.arc(px,py,6,0,Math.PI*2);ctx.fill();ctx.fillStyle='#475569';ctx.fillText('pH',8,20);ctx.fillText('mL',curve.width-30,curve.height-8)}
    function animate(){if(running){let v=Number(volume.value)+0.08;if(v>50){v=50;running=false}volume.value=v.toFixed(1);drop.style.transform='translateY('+((v%3)*8)+'px)';update()}requestAnimationFrame(animate)}
    volume.addEventListener('input',update);document.getElementById('start').addEventListener('click',()=>{running=true});document.getElementById('pause').addEventListener('click',()=>{running=false});document.getElementById('reset').addEventListener('click',()=>{volume.value=0;running=false;update()});document.querySelectorAll('[data-answer]').forEach(btn=>btn.addEventListener('click',()=>{document.getElementById('quiz-feedback').textContent=btn.dataset.answer==='right'?'正确：强酸强碱接近 7，但不能泛化到所有滴定。':'不对，这只适用于部分体系，不能泛化。'}));
    function mark(sel){const el=document.querySelector(sel);if(!el)return;el.classList.add('highlight');setTimeout(()=>el.classList.remove('highlight'),1800)}
    window.addEventListener('message',event=>{const data=event.data||{};if(data.type==='SET_WIDGET_STATE'&&data.state&&data.state.volume!==undefined){volume.value=data.state.volume;update()}if(data.type==='HIGHLIGHT_ELEMENT')mark(data.target||'[data-role="simulation-main"]');if(data.type==='ANNOTATE_ELEMENT'){const el=document.querySelector(data.target||'[data-role="observation-panel"]');if(el&&data.content)el.title=data.content}if(data.type==='REVEAL_ELEMENT'){const el=document.querySelector(data.target||'[data-role="formula-panel"]');if(el)el.hidden=false}});
    update();animate();window.parent&&window.parent.postMessage({type:'WIDGET_READY'},'*');
  </script>
</body>
</html>`;

export const chemistryAcidBaseTitrationBasicTemplate: VerifiedExperimentTemplate = {
  id: 'chemistry-acid-base-titration-basic',
  title: '酸碱滴定基础实验',
  description: '展示强酸强碱滴定中的 pH、颜色变化和等量点。',
  subjectDomain: 'chemistry',
  topic: '酸碱滴定',
  aliases: ['酸碱滴定', '中和滴定', '滴定实验', 'acid base titration', 'titration'],
  gradeRange: [10, 12],
  interactionType: 'simulation',
  schemaKey: 'chemistry:acid_base_titration',
  html,
  blueprint: {
    id: 'blueprint_template_titration',
    topic: '酸碱滴定',
    originalPrompt: 'verified template',
    subjectDomain: 'chemistry',
    interactionType: 'simulation',
    gradeRange: [10, 12],
    bloomLevel: 'analyze',
    scaffoldingLevel: 'guided',
    coreVariables: [
      { name: '滴加体积', symbol: 'Vb', unit: 'mL', role: 'independent', range: [0, 50], defaultValue: 25, description: '滴入碱液体积。' },
      { name: 'pH', symbol: 'pH', role: 'dependent', description: '随滴加体积变化。' },
      { name: '指示剂颜色', symbol: 'color', role: 'dependent', description: '随 pH 区间变化。' },
    ],
    expectedInsight: '等量点附近 pH 变化最剧烈，指示剂颜色变化与 pH 区间相关。',
    learningObjectives: ['解释滴加体积对 pH 的影响', '识别等量点附近的变化'],
    prerequisites: ['酸碱概念', 'pH 含义'],
    knowledgeConstraints: [
      { id: 'titration-ph-color', description: 'pH 或指示剂颜色变化', mustBeTrue: '必须展示 pH 或指示剂颜色随滴加体积变化。', severity: 'must', checkType: 'visual' },
      { id: 'titration-equivalence', description: '强酸强碱等量点', mustBeTrue: '强酸强碱等量点附近 pH 接近 7。', severity: 'should', checkType: 'conceptual' },
      { id: 'titration-no-overgeneralization', description: '不得错误泛化', mustBeTrue: '不得声称所有酸碱滴定终点 pH 都等于 7。', severity: 'must', checkType: 'conceptual' },
      { id: 'titration-indicator', description: '指示剂颜色区间', mustBeTrue: '指示剂颜色变化应与 pH 区间相关。', severity: 'must', checkType: 'visual' },
    ],
    suggestedVisualStructure: '滴定装置、滴加滑块、pH 读数、颜色变化、曲线和小测。',
    estimatedDurationMinutes: 10,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  editableSlots: [
    { key: 'acidBaseType', label: '酸碱类型', type: 'difficulty', description: '限定为不破坏当前强酸强碱逻辑的讲解层级。', defaultValue: 'strong_acid_strong_base' },
    { key: 'volumeRange', label: '体积范围', type: 'parameter_range', description: '调整滴加体积范围。', defaultValue: [0, 50] },
    { key: 'indicator', label: '指示剂', type: 'visual_style', description: '调整颜色说明，但必须与 pH 区间相关。' },
    { key: 'difficulty', label: '难度', type: 'difficulty', description: '调整讲解深度。' },
    { key: 'quiz', label: '小测', type: 'quiz', description: '替换 quiz。' },
    { key: 'visualStyle', label: '视觉风格', type: 'visual_style', description: '调整配色。' },
  ],
  protectedConstraints: ['不得破坏 pH/颜色变化逻辑。', '不得错误泛化“所有滴定终点 pH=7”。', '不得删除等量点提示。'],
  qualityBaseline: {
    subjectCorrectness: 92,
    interactionCompleteness: 90,
    accessibilityBaseline: ['滑块有 label', 'Canvas 有 aria-label', '支持移动端单列布局'],
    knownLimitations: ['pH 曲线为教学用简化强酸强碱模型。'],
    manuallyReviewed: true,
  },
  version: '1.0.0',
  sourceType: 'original',
  licenseNote: 'Original STEMotion verified template; no third-party code, assets, or branding.',
};
