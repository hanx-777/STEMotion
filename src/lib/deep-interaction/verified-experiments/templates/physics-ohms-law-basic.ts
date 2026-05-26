import type { VerifiedExperimentTemplate } from '../types';

const html = String.raw`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>欧姆定律基础实验</title>
  <style>
    *{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f8fafc;color:#0f172a}.app{min-height:100vh;padding:16px;display:grid;gap:12px;grid-template-columns:minmax(0,1.3fr) minmax(260px,.7fr)}header{grid-column:1/-1}.panel{border:1px solid #dbe3ef;border-radius:8px;background:white;padding:14px}.stage{min-height:280px;position:relative;overflow:hidden}.circuit{height:210px;border-radius:8px;background:linear-gradient(#eef6ff,#fff);position:relative}.wire{position:absolute;border:6px solid #334155;border-radius:14px;inset:42px 26px}.battery{position:absolute;left:48px;top:82px;width:54px;height:70px;background:#fde68a;border:3px solid #92400e;border-radius:6px;display:grid;place-items:center;font-weight:800}.resistor{position:absolute;right:48px;top:88px;width:88px;height:54px;border:3px solid #7c2d12;background:#fed7aa;border-radius:8px;display:grid;place-items:center;font-weight:800}.meter{position:absolute;left:50%;top:70px;transform:translateX(-50%);width:100px;height:100px;border:4px solid #0f766e;border-radius:50%;background:#ccfbf1;display:grid;place-items:center;text-align:center;font-weight:800}.flow{position:absolute;width:14px;height:14px;border-radius:999px;background:#2563eb;box-shadow:0 0 0 4px rgba(37,99,235,.14)}.controls{display:grid;gap:12px}.control label{display:flex;justify-content:space-between;font-size:13px;font-weight:700}.control input{width:100%;accent-color:#2563eb}.metric{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.metric div{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px;text-align:center}.metric strong{display:block;font-size:22px}.buttons{display:flex;gap:8px;flex-wrap:wrap}.buttons button{min-height:40px;border:0;border-radius:8px;background:#0f172a;color:white;padding:0 12px;font-weight:700}.buttons button.secondary{background:#e2e8f0;color:#0f172a}.quiz button{display:block;width:100%;margin-top:8px;border:1px solid #cbd5e1;background:#f8fafc;border-radius:8px;padding:8px;text-align:left}.highlight{outline:3px solid #f59e0b;outline-offset:3px}@media(max-width:760px){.app{grid-template-columns:1fr;padding:10px}.metric{grid-template-columns:1fr}.stage{min-height:240px}.wire{inset:36px 16px}.battery{left:28px}.resistor{right:28px}.meter{width:88px;height:88px}}</style>
</head>
<body>
  <main class="app">
    <header><h1>欧姆定律基础实验</h1><p>调节电压 U 与电阻 R，观察电流 I 如何变化。</p></header>
    <section class="panel stage" data-role="simulation-main" id="simulation-main">
      <div class="circuit" id="circuit">
        <div class="wire"></div><div class="battery" id="battery">U</div><div class="meter" id="meter">I<br><span id="meter-value">0.60 A</span></div><div class="resistor" id="resistor-box">R</div>
        <div class="flow" id="electron"></div>
      </div>
      <div class="metric"><div><span>电压 U</span><strong id="u-read">6 V</strong></div><div><span>电阻 R</span><strong id="r-read">10 Ω</strong></div><div><span>电流 I</span><strong id="i-read">0.60 A</strong></div></div>
    </section>
    <aside class="panel controls" data-role="control-panel" id="control-panel">
      <div class="control"><label for="voltage">电压 U <span id="voltage-label">6 V</span></label><input id="voltage" data-var="voltage" type="range" min="1" max="12" step="1" value="6"></div>
      <div class="control"><label for="resistance">电阻 R <span id="resistance-label">10 Ω</span></label><input id="resistance" data-var="resistance" type="range" min="2" max="30" step="1" value="10"></div>
      <div class="buttons"><button id="start">开始</button><button id="pause" class="secondary">暂停</button><button id="reset" class="secondary">重置</button></div>
    </aside>
    <section class="panel" data-role="formula-panel" id="formula-panel"><h2>公式</h2><p><strong>I = U / R</strong></p><p>单位：U 用 V，R 用 Ω，I 用 A。</p></section>
    <section class="panel" data-role="observation-panel" id="observation-panel"><h2>观察</h2><p id="observation">电阻不变时，电压越大，电流越大。</p></section>
    <section class="panel quiz" data-role="quiz-panel" id="quiz-panel"><h2>小测</h2><p>电压不变时，增大电阻会怎样？</p><button data-answer="wrong">电流增大</button><button data-answer="right">电流减小</button><p id="quiz-feedback" aria-live="polite"></p></section>
  </main>
  <script type="application/json" id="widget-config">{"concept":"欧姆定律","variables":[{"id":"voltage","label":"电压","unit":"V"},{"id":"resistance","label":"电阻","unit":"Ω"},{"id":"current","label":"电流","unit":"A"}],"defaultState":{"voltage":6,"resistance":10},"messageTargets":[{"id":"simulation-main","purpose":"电路示意主舞台"},{"id":"control-panel","purpose":"调节电压和电阻"},{"id":"observation-panel","purpose":"观察规律"},{"id":"formula-panel","purpose":"公式区"},{"id":"quiz-panel","purpose":"小测区"}]}</script>
  <script>
    const voltage=document.getElementById('voltage'),resistance=document.getElementById('resistance'),electron=document.getElementById('electron');let running=true,t=0;
    function current(){return Number(voltage.value)/Number(resistance.value)}
    function update(){const u=Number(voltage.value),r=Number(resistance.value),i=current();document.getElementById('voltage-label').textContent=u+' V';document.getElementById('resistance-label').textContent=r+' Ω';document.getElementById('u-read').textContent=u+' V';document.getElementById('r-read').textContent=r+' Ω';document.getElementById('i-read').textContent=i.toFixed(2)+' A';document.getElementById('meter-value').textContent=i.toFixed(2)+' A';document.getElementById('observation').textContent=i>=0.8?'电流较大：电压提高或电阻降低都会让电子流动更明显。':i<=0.25?'电流较小：电阻较大或电压较低会限制电流。':'电阻不变时，电压越大，电流越大；电压不变时，电阻越大，电流越小。'}
    function animate(){if(running)t+=0.008+current()*0.018;const w=document.getElementById('circuit').clientWidth,h=document.getElementById('circuit').clientHeight;const x=28+(w-56)*((Math.sin(t)+1)/2);const y=t%6.28<3.14?42:h-56;electron.style.transform='translate('+x+'px,'+y+'px)';requestAnimationFrame(animate)}
    voltage.addEventListener('input',update);resistance.addEventListener('input',update);document.getElementById('start').addEventListener('click',()=>{running=true});document.getElementById('pause').addEventListener('click',()=>{running=false});document.getElementById('reset').addEventListener('click',()=>{voltage.value=6;resistance.value=10;running=true;update()});document.querySelectorAll('[data-answer]').forEach(btn=>btn.addEventListener('click',()=>{document.getElementById('quiz-feedback').textContent=btn.dataset.answer==='right'?'正确：R 增大时 I=U/R 变小。':'再想想 I=U/R 中分母变大会怎样。'}));
    function mark(sel){const el=document.querySelector(sel);if(!el)return;el.classList.add('highlight');setTimeout(()=>el.classList.remove('highlight'),1800)}
    window.addEventListener('message',event=>{const data=event.data||{};if(data.type==='SET_WIDGET_STATE'&&data.state){if(data.state.voltage!==undefined)voltage.value=data.state.voltage;if(data.state.resistance!==undefined)resistance.value=data.state.resistance;update()}if(data.type==='HIGHLIGHT_ELEMENT')mark(data.target||'[data-role="simulation-main"]');if(data.type==='ANNOTATE_ELEMENT'){const el=document.querySelector(data.target||'[data-role="observation-panel"]');if(el&&data.content){el.setAttribute('data-note',data.content);el.title=data.content}}if(data.type==='REVEAL_ELEMENT'){const el=document.querySelector(data.target||'[data-role="formula-panel"]');if(el)el.hidden=false}});
    update();animate();window.parent&&window.parent.postMessage({type:'WIDGET_READY'},'*');
  </script>
</body>
</html>`;

export const physicsOhmsLawBasicTemplate: VerifiedExperimentTemplate = {
  id: 'physics-ohms-law-basic',
  title: '欧姆定律基础实验',
  description: '调节电压和电阻，观察电流变化并理解 I = U / R。',
  subjectDomain: 'physics',
  topic: '欧姆定律',
  aliases: ['欧姆定律', '电流电压电阻', 'Ohm', "Ohm's law", 'ohms law'],
  gradeRange: [7, 9],
  interactionType: 'simulation',
  schemaKey: 'physics:ohms_law',
  html,
  blueprint: {
    id: 'blueprint_template_ohms_law',
    topic: '欧姆定律',
    originalPrompt: 'verified template',
    subjectDomain: 'physics',
    interactionType: 'simulation',
    gradeRange: [7, 9],
    bloomLevel: 'apply',
    scaffoldingLevel: 'guided',
    coreVariables: [
      { name: '电压', symbol: 'U', unit: 'V', role: 'independent', range: [1, 12], defaultValue: 6, description: '推动电荷流动的电势差。' },
      { name: '电阻', symbol: 'R', unit: 'Ω', role: 'independent', range: [2, 30], defaultValue: 10, description: '阻碍电流的程度。' },
      { name: '电流', symbol: 'I', unit: 'A', role: 'dependent', description: '由 I = U / R 计算得到。' },
    ],
    expectedInsight: '电阻不变时电流随电压增大而增大；电压不变时电流随电阻增大而减小。',
    learningObjectives: ['使用 I = U / R 计算电流', '比较电压和电阻对电流的影响'],
    prerequisites: ['基本电路概念', '比例关系'],
    knowledgeConstraints: [
      { id: 'ohm-formula', description: '欧姆定律公式', formula: 'I = U / R', mustBeTrue: '电流等于电压除以电阻。', severity: 'must', checkType: 'formula' },
      { id: 'ohm-units', description: '单位正确', mustBeTrue: 'U 使用 V，R 使用 Ω，I 使用 A。', severity: 'must', checkType: 'unit' },
      { id: 'ohm-voltage-trend', description: '电压趋势', mustBeTrue: '电阻不变时，电流随电压增大而增大。', severity: 'must', checkType: 'conceptual' },
      { id: 'ohm-resistance-trend', description: '电阻趋势', mustBeTrue: '电压不变时，电流随电阻增大而减小。', severity: 'must', checkType: 'conceptual' },
    ],
    suggestedVisualStructure: '电路示意、双滑块、公式区、观察区和小测区。',
    estimatedDurationMinutes: 8,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  editableSlots: [
    { key: 'voltageRange', label: '电压范围', type: 'parameter_range', description: '调整电压滑块的最小值和最大值。', defaultValue: [1, 12] },
    { key: 'resistanceRange', label: '电阻范围', type: 'parameter_range', description: '调整电阻滑块的最小值和最大值。', defaultValue: [2, 30] },
    { key: 'difficulty', label: '难度', type: 'difficulty', description: '调整讲解和 quiz 的难度。', defaultValue: 'middle_school' },
    { key: 'teacherQuestions', label: '教师追问', type: 'teacher_questions', description: '替换观察区中的引导问题。' },
    { key: 'visualStyle', label: '视觉风格', type: 'visual_style', description: '在不改变结构的前提下调整配色。' },
    { key: 'quiz', label: '小测', type: 'quiz', description: '替换 quiz 文案但不改变正确科学关系。' },
  ],
  protectedConstraints: ['不得破坏 I = U / R。', '不得删除 U/R/I。', '不得删除公式区。', '不得删除观察区。'],
  qualityBaseline: {
    subjectCorrectness: 95,
    interactionCompleteness: 92,
    accessibilityBaseline: ['表单控件有 label', '支持 375px 宽度', 'quiz 反馈使用 aria-live'],
    knownLimitations: ['电路示意为概念图，不模拟真实电子微观运动。'],
    manuallyReviewed: true,
  },
  version: '1.0.0',
  sourceType: 'original',
  licenseNote: 'Original STEMotion verified template; no third-party code, assets, or branding.',
};
