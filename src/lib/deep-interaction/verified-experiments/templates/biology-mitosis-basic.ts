import type { VerifiedExperimentTemplate } from '../types';

const html = String.raw`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>有丝分裂过程动画</title>
  <style>
    *{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f8fafc;color:#113029}.app{min-height:100vh;padding:16px;display:grid;grid-template-columns:minmax(0,1.25fr) minmax(260px,.75fr);gap:12px}header{grid-column:1/-1}.panel{background:#fff;border:1px solid #dbe3ef;border-radius:8px;padding:14px}.stage{min-height:310px;display:grid;place-items:center}.cell{position:relative;width:min(100%,420px);aspect-ratio:1;border:5px solid #16a34a;border-radius:50%;background:radial-gradient(circle,#dcfce7,#f0fdf4);overflow:hidden}.nucleus{position:absolute;left:25%;top:25%;width:50%;height:50%;border:3px dashed #22c55e;border-radius:50%;opacity:1;transition:.3s}.chromosome{position:absolute;width:52px;height:12px;border-radius:999px;background:#7c3aed;left:calc(50% - 26px);top:calc(50% - 6px);transform-origin:center;transition:.5s}.chromosome:nth-child(2){transform:rotate(45deg)}.chromosome:nth-child(3){transform:rotate(-45deg)}.chromosome:nth-child(4){transform:translate(-44px,0) rotate(90deg)}.chromosome:nth-child(5){transform:translate(44px,0) rotate(90deg)}.spindle{position:absolute;left:8%;right:8%;top:49%;height:2px;background:#0f766e;opacity:.35}.controls{display:grid;gap:10px}.timeline{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.timeline button,.buttons button,.quiz button{min-height:38px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;font-weight:800}.timeline button.active{background:#16a34a;color:#fff;border-color:#16a34a}.buttons{display:flex;gap:8px;flex-wrap:wrap}.buttons button{background:#113029;color:#fff;padding:0 12px}.buttons .secondary{background:#e2e8f0;color:#113029}.quiz button{display:block;width:100%;margin-top:8px;text-align:left}.badge{display:inline-block;border-radius:999px;background:#dcfce7;color:#166534;padding:4px 8px;font-weight:800;font-size:12px}.highlight{outline:3px solid #f59e0b;outline-offset:3px}@media(max-width:760px){.app{grid-template-columns:1fr;padding:10px}.timeline{grid-template-columns:repeat(2,1fr)}.stage{min-height:260px}}</style>
</head>
<body>
  <main class="app">
    <header><h1>有丝分裂过程动画</h1><p>按正确顺序观察前期、中期、后期、末期。</p></header>
    <section class="panel stage" data-role="simulation-main" id="simulation-main">
      <div class="cell" id="cell"><div class="nucleus" id="nucleus"></div><div class="chromosome"></div><div class="chromosome"></div><div class="chromosome"></div><div class="chromosome"></div><div class="spindle" id="spindle"></div></div>
    </section>
    <aside class="panel controls" data-role="control-panel" id="control-panel">
      <div class="timeline" id="timeline"><button data-stage="0">前期</button><button data-stage="1">中期</button><button data-stage="2">后期</button><button data-stage="3">末期</button></div>
      <div class="buttons"><button id="start">播放</button><button id="pause" class="secondary">暂停</button><button id="reset" class="secondary">重置</button></div>
      <label for="speed">动画速度 <input id="speed" data-var="animationSpeed" type="range" min="0.5" max="2" step="0.1" value="1"></label>
    </aside>
    <section class="panel" data-role="formula-panel" id="formula-panel"><h2>阶段顺序</h2><p><span class="badge">前期</span> → <span class="badge">中期</span> → <span class="badge">后期</span> → <span class="badge">末期</span></p><p>有丝分裂通常形成两个遗传物质相同的子细胞。</p></section>
    <section class="panel" data-role="observation-panel" id="observation-panel"><h2 id="stage-title">前期</h2><p id="stage-note">染色体逐渐凝缩，核膜开始变化。</p></section>
    <section class="panel quiz" data-role="quiz-panel" id="quiz-panel"><h2>小测</h2><p>有丝分裂的结果通常是什么？</p><button data-answer="right">形成两个遗传物质相同的子细胞</button><button data-answer="wrong">染色体数目减半</button><p id="quiz-feedback" aria-live="polite"></p></section>
  </main>
  <script type="application/json" id="widget-config">{"concept":"有丝分裂","variables":[{"id":"stage","label":"阶段"},{"id":"animationSpeed","label":"动画速度"}],"defaultState":{"stage":0,"animationSpeed":1},"messageTargets":[{"id":"simulation-main","purpose":"细胞动画"},{"id":"control-panel","purpose":"阶段控制"},{"id":"observation-panel","purpose":"阶段说明"},{"id":"formula-panel","purpose":"阶段顺序"},{"id":"quiz-panel","purpose":"小测区"}]}</script>
  <script>
    const stages=[{name:'前期',note:'染色体逐渐凝缩，核膜开始变化。'},{name:'中期',note:'染色体排列在细胞中央，便于后续分离。'},{name:'后期',note:'姐妹染色单体向细胞两极移动。'},{name:'末期',note:'细胞形成两个遗传物质相同的子细胞。'}];let stage=0,running=true,clock=0;const chrom=[...document.querySelectorAll('.chromosome')],speed=document.getElementById('speed');
    function setStage(next){stage=Math.max(0,Math.min(3,next));document.querySelectorAll('[data-stage]').forEach((b,i)=>b.classList.toggle('active',i===stage));document.getElementById('stage-title').textContent=stages[stage].name;document.getElementById('stage-note').textContent=stages[stage].note;drawStage()}
    function drawStage(){document.getElementById('nucleus').style.opacity=stage===0?'1':stage===3?'0.5':'0.1';document.getElementById('spindle').style.opacity=stage>=1?'0.7':'0.2';chrom.forEach((el,i)=>{let x=0,y=0,r=i%2?45:-45;if(stage===1){x=0;y=(i-1.5)*20;r=90}if(stage===2){x=i<2?-72:72;y=(i%2?-24:24);r=20}if(stage===3){x=i<2?-86:86;y=(i%2?-18:18);r=i%2?40:-40}el.style.transform='translate('+x+'px,'+y+'px) rotate('+r+'deg)'})}
    function animate(){if(running){clock+=0.01*Number(speed.value);if(clock>1){clock=0;setStage((stage+1)%4)}}requestAnimationFrame(animate)}
    document.querySelectorAll('[data-stage]').forEach(btn=>btn.addEventListener('click',()=>{running=false;setStage(Number(btn.dataset.stage))}));document.getElementById('start').addEventListener('click',()=>{running=true});document.getElementById('pause').addEventListener('click',()=>{running=false});document.getElementById('reset').addEventListener('click',()=>{running=true;clock=0;setStage(0)});speed.addEventListener('input',()=>{});
    document.querySelectorAll('[data-answer]').forEach(btn=>btn.addEventListener('click',()=>{document.getElementById('quiz-feedback').textContent=btn.dataset.answer==='right'?'正确：这区别于减数分裂。':'这是减数分裂的特征，不是有丝分裂。'}));
    function mark(sel){const el=document.querySelector(sel);if(!el)return;el.classList.add('highlight');setTimeout(()=>el.classList.remove('highlight'),1800)}
    window.addEventListener('message',event=>{const data=event.data||{};if(data.type==='SET_WIDGET_STATE'&&data.state){if(data.state.stage!==undefined)setStage(Number(data.state.stage));if(data.state.animationSpeed!==undefined)speed.value=data.state.animationSpeed}if(data.type==='HIGHLIGHT_ELEMENT')mark(data.target||'[data-role="simulation-main"]');if(data.type==='ANNOTATE_ELEMENT'){const el=document.querySelector(data.target||'[data-role="observation-panel"]');if(el&&data.content)el.title=data.content}if(data.type==='REVEAL_ELEMENT'){const el=document.querySelector(data.target||'[data-role="formula-panel"]');if(el)el.hidden=false}});
    setStage(0);animate();window.parent&&window.parent.postMessage({type:'WIDGET_READY'},'*');
  </script>
</body>
</html>`;

export const biologyMitosisBasicTemplate: VerifiedExperimentTemplate = {
  id: 'biology-mitosis-basic',
  title: '有丝分裂过程动画',
  description: '按阶段展示有丝分裂中染色体位置和细胞状态变化。',
  subjectDomain: 'biology',
  topic: '有丝分裂',
  aliases: ['有丝分裂', '细胞分裂', 'mitosis', 'cell division'],
  gradeRange: [10, 12],
  interactionType: 'simulation',
  schemaKey: 'biology:cell_division',
  html,
  blueprint: {
    id: 'blueprint_template_mitosis',
    topic: '有丝分裂',
    originalPrompt: 'verified template',
    subjectDomain: 'biology',
    interactionType: 'simulation',
    gradeRange: [10, 12],
    bloomLevel: 'understand',
    scaffoldingLevel: 'guided',
    coreVariables: [
      { name: '阶段', symbol: 'stage', role: 'independent', defaultValue: '前期', description: '前期、中期、后期、末期。' },
      { name: '染色体位置', symbol: 'chromosomePosition', role: 'dependent', description: '随阶段变化。' },
    ],
    expectedInsight: '有丝分裂按前期、中期、后期、末期推进，通常形成两个遗传物质相同的子细胞。',
    learningObjectives: ['识别有丝分裂主要阶段', '解释染色体位置变化'],
    prerequisites: ['细胞结构', '染色体概念'],
    knowledgeConstraints: [
      { id: 'mitosis-sequence', description: '阶段顺序正确', mustBeTrue: '顺序为前期、中期、后期、末期。', severity: 'must', checkType: 'sequence' },
      { id: 'mitosis-outcome', description: '形成两个遗传物质相同的子细胞', mustBeTrue: '有丝分裂通常形成两个遗传物质相同的子细胞。', severity: 'must', checkType: 'conceptual' },
      { id: 'mitosis-not-meiosis', description: '不得混入减数分裂', mustBeTrue: '不得表述为染色体数目减半。', severity: 'must', checkType: 'conceptual' },
    ],
    suggestedVisualStructure: '细胞主舞台、阶段时间轴、阶段说明、小测区。',
    estimatedDurationMinutes: 8,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  editableSlots: [
    { key: 'animationSpeed', label: '动画速度', type: 'animation_speed', description: '调整阶段播放速度。', defaultValue: 1 },
    { key: 'difficulty', label: '难度', type: 'difficulty', description: '调整阶段说明深度。' },
    { key: 'showLabels', label: '显示标签', type: 'layout', description: '控制阶段标签和染色体标签。', defaultValue: true },
    { key: 'teacherQuestions', label: '教师追问', type: 'teacher_questions', description: '替换观察区引导问题。' },
    { key: 'quiz', label: '小测', type: 'quiz', description: '替换 quiz。' },
  ],
  protectedConstraints: ['不得破坏阶段顺序。', '不得出现“染色体数目减半”。', '不得删除阶段说明。'],
  qualityBaseline: {
    subjectCorrectness: 93,
    interactionCompleteness: 90,
    accessibilityBaseline: ['阶段按钮可点击', '移动端双列时间轴', 'quiz 有反馈'],
    knownLimitations: ['动画为概念性形态变化，不追求显微真实比例。'],
    manuallyReviewed: true,
  },
  version: '1.0.0',
  sourceType: 'original',
  licenseNote: 'Original STEMotion verified template; no third-party code, assets, or branding.',
};
