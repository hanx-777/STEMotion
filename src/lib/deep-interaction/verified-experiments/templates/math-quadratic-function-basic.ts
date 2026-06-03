import type { VerifiedExperimentTemplate } from '../types';

const html = String.raw`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>二次函数参数探索器</title>
  <style>
    *{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f8fafc;color:#172033}.app{min-height:100vh;padding:16px;display:grid;grid-template-columns:minmax(0,1.35fr) minmax(260px,.65fr);gap:12px}header{grid-column:1/-1}.panel{background:#fff;border:1px solid #dbe3ef;border-radius:8px;padding:14px}.canvas-wrap{position:relative;min-height:310px}canvas{width:100%;height:300px;border-radius:8px;background:#f9fbff;border:1px solid #dbe3ef}.controls{display:grid;gap:12px}.control label{display:flex;justify-content:space-between;font-size:13px;font-weight:800}.control input{width:100%;accent-color:#7c3aed}.buttons{display:flex;gap:8px;flex-wrap:wrap}.buttons button,.quiz button{border:0;border-radius:8px;min-height:38px;padding:0 12px;font-weight:800;background:#172033;color:#fff}.buttons .secondary{background:#e2e8f0;color:#172033}.formula{font-size:18px;font-weight:900}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.note{background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;padding:9px}.quiz button{display:block;width:100%;margin-top:8px;text-align:left;background:#f8fafc;color:#172033;border:1px solid #cbd5e1}.highlight{outline:3px solid #f59e0b;outline-offset:3px}@media(max-width:760px){.app{grid-template-columns:1fr;padding:10px}.grid{grid-template-columns:1fr}canvas{height:260px}.canvas-wrap{min-height:270px}}</style>
</head>
<body>
  <main class="app">
    <header><h1>二次函数参数探索器</h1><p>调节 a、b、c，观察抛物线、对称轴和顶点如何变化。</p></header>
    <section class="panel canvas-wrap" data-role="simulation-main" id="simulation-main"><canvas id="graph" width="720" height="360" aria-label="二次函数图像"></canvas></section>
    <aside class="panel controls" data-role="control-panel" id="control-panel">
      <div class="control"><label for="a">a <span id="a-label">1.0</span></label><input id="a" data-var="a" type="range" min="-3" max="3" step="0.1" value="1"></div>
      <div class="control"><label for="b">b <span id="b-label">0.0</span></label><input id="b" data-var="b" type="range" min="-5" max="5" step="0.1" value="0"></div>
      <div class="control"><label for="c">c <span id="c-label">0.0</span></label><input id="c" data-var="c" type="range" min="-5" max="5" step="0.1" value="0"></div>
      <div class="buttons"><button id="start">播放扫描</button><button id="pause" class="secondary">暂停</button><button id="reset" class="secondary">重置</button></div>
    </aside>
    <section class="panel" data-role="formula-panel" id="formula-panel"><h2>函数与对称轴</h2><p class="formula" id="formula">y = 1x² + 0x + 0</p><div class="grid"><div class="note">对称轴：<strong id="axis">x = 0</strong></div><div class="note">顶点：<strong id="vertex">(0, 0)</strong></div></div></section>
    <section class="panel" data-role="observation-panel" id="observation-panel"><h2>观察</h2><p id="observation">a > 0 时开口向上；|a| 越大，开口越窄。</p></section>
    <section class="panel quiz" data-role="quiz-panel" id="quiz-panel"><h2>小测</h2><p>a 从 1 变为 2 时，抛物线会怎样？</p><button data-answer="right">开口变窄</button><button data-answer="wrong">对称轴一定变成 x=2</button><p id="quiz-feedback" aria-live="polite"></p></section>
  </main>
  <script type="application/json" id="widget-config">{"concept":"二次函数","variables":[{"id":"a","label":"二次项系数"},{"id":"b","label":"一次项系数"},{"id":"c","label":"常数项"}],"defaultState":{"a":1,"b":0,"c":0},"messageTargets":[{"id":"simulation-main","purpose":"图像区"},{"id":"control-panel","purpose":"参数控制"},{"id":"observation-panel","purpose":"观察提示"},{"id":"formula-panel","purpose":"公式与对称轴"},{"id":"quiz-panel","purpose":"小测区"}]}</script>
  <script>
    const canvas=document.getElementById('graph'),ctx=canvas.getContext('2d'),aEl=document.getElementById('a'),bEl=document.getElementById('b'),cEl=document.getElementById('c');let running=true,pulse=0;
    function val(el){return Number(el.value)}function y(x,a,b,c){return a*x*x+b*x+c}
    function mapX(x){return canvas.width/2+x*42}function mapY(yv){return canvas.height/2-yv*22}
    function update(){const a=val(aEl),b=val(bEl),c=val(cEl),axis=-b/(2*a),vy=y(axis,a,b,c);document.getElementById('a-label').textContent=a.toFixed(1);document.getElementById('b-label').textContent=b.toFixed(1);document.getElementById('c-label').textContent=c.toFixed(1);document.getElementById('formula').textContent='y = '+a.toFixed(1)+'x² + '+b.toFixed(1)+'x + '+c.toFixed(1);document.getElementById('axis').textContent='x = '+axis.toFixed(2);document.getElementById('vertex').textContent='('+axis.toFixed(2)+', '+vy.toFixed(2)+')';document.getElementById('observation').textContent=(a>0?'a > 0，开口向上。':'a < 0，开口向下。')+' |a| 越大，开口越窄；b 会改变对称轴 x = -b/(2a)。';draw()}
    function draw(){const a=val(aEl)||0.1,b=val(bEl),c=val(cEl),axis=-b/(2*a);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#cbd5e1';ctx.lineWidth=1;for(let x=-8;x<=8;x++){ctx.beginPath();ctx.moveTo(mapX(x),0);ctx.lineTo(mapX(x),canvas.height);ctx.stroke()}for(let yy=-7;yy<=7;yy++){ctx.beginPath();ctx.moveTo(0,mapY(yy));ctx.lineTo(canvas.width,mapY(yy));ctx.stroke()}ctx.strokeStyle='#334155';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,mapY(0));ctx.lineTo(canvas.width,mapY(0));ctx.moveTo(mapX(0),0);ctx.lineTo(mapX(0),canvas.height);ctx.stroke();ctx.strokeStyle='#7c3aed';ctx.lineWidth=4;ctx.beginPath();for(let x=-8;x<=8;x+=0.05){const px=mapX(x),py=mapY(y(x,a,b,c));if(x===-8)ctx.moveTo(px,py);else ctx.lineTo(px,py)}ctx.stroke();ctx.setLineDash([8,6]);ctx.strokeStyle='#ef4444';ctx.beginPath();ctx.moveTo(mapX(axis),0);ctx.lineTo(mapX(axis),canvas.height);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#ef4444';ctx.beginPath();ctx.arc(mapX(axis),mapY(y(axis,a,b,c)),6+Math.sin(pulse)*2,0,Math.PI*2);ctx.fill()}
    function animate(){if(running)pulse+=0.08;draw();requestAnimationFrame(animate)}
    [aEl,bEl,cEl].forEach(el=>el.addEventListener('input',update));document.getElementById('start').addEventListener('click',()=>{running=true});document.getElementById('pause').addEventListener('click',()=>{running=false});document.getElementById('reset').addEventListener('click',()=>{aEl.value=1;bEl.value=0;cEl.value=0;running=true;update()});document.querySelectorAll('[data-answer]').forEach(btn=>btn.addEventListener('click',()=>{document.getElementById('quiz-feedback').textContent=btn.dataset.answer==='right'?'正确：|a| 变大时开口更窄。':'再看公式，对称轴由 -b/(2a) 决定。'}));
    function mark(sel){const el=document.querySelector(sel);if(!el)return;el.classList.add('highlight');setTimeout(()=>el.classList.remove('highlight'),1800)}
    window.addEventListener('message',event=>{const data=event.data||{};if(data.type==='SET_WIDGET_STATE'&&data.state){if(data.state.a!==undefined)aEl.value=data.state.a;if(data.state.b!==undefined)bEl.value=data.state.b;if(data.state.c!==undefined)cEl.value=data.state.c;update()}if(data.type==='HIGHLIGHT_ELEMENT')mark(data.target||'[data-role="simulation-main"]');if(data.type==='ANNOTATE_ELEMENT'){const el=document.querySelector(data.target||'[data-role="observation-panel"]');if(el&&data.content)el.title=data.content}if(data.type==='REVEAL_ELEMENT'){const el=document.querySelector(data.target||'[data-role="formula-panel"]');if(el)el.hidden=false}});
    update();animate();window.parent&&window.parent.postMessage({type:'WIDGET_READY'},'*');
  </script>
</body>
</html>`;

export const mathQuadraticFunctionBasicTemplate: VerifiedExperimentTemplate = {
  id: 'math-quadratic-function-basic',
  title: '二次函数参数探索器',
  description: '调节 a、b、c，观察抛物线、对称轴和顶点。',
  subjectDomain: 'math',
  topic: '二次函数',
  aliases: ['二次函数', '抛物线', 'quadratic function', 'parabola'],
  gradeRange: [10, 12],
  interactionType: 'simulation',
  schemaKey: 'math:quadratic_function',
  html,
  blueprint: {
    id: 'blueprint_template_quadratic',
    topic: '二次函数',
    originalPrompt: 'verified template',
    subjectDomain: 'math',
    interactionType: 'simulation',
    gradeRange: [10, 12],
    bloomLevel: 'analyze',
    scaffoldingLevel: 'guided',
    coreVariables: [
      { name: '二次项系数', symbol: 'a', role: 'independent', range: [-3, 3], defaultValue: 1, description: '控制开口方向和宽窄。' },
      { name: '一次项系数', symbol: 'b', role: 'independent', range: [-5, 5], defaultValue: 0, description: '影响对称轴。' },
      { name: '常数项', symbol: 'c', role: 'independent', range: [-5, 5], defaultValue: 0, description: '影响纵截距。' },
    ],
    expectedInsight: 'a 控制开口方向和宽窄，b 影响对称轴，c 影响纵截距。',
    learningObjectives: ['解释 a/b/c 对图像的作用', '用 x = -b/(2a) 判断对称轴'],
    prerequisites: ['函数图像', '坐标系'],
    knowledgeConstraints: [
      { id: 'quadratic-formula', description: '二次函数表达式', formula: 'y = ax^2 + bx + c', mustBeTrue: '图像必须对应 y = ax^2 + bx + c。', severity: 'must', checkType: 'formula' },
      { id: 'quadratic-axis', description: '对称轴公式', formula: 'x = -b / (2a)', mustBeTrue: '对称轴必须是 x = -b/(2a)。', severity: 'must', checkType: 'formula' },
      { id: 'quadratic-a-direction', description: '开口方向', mustBeTrue: 'a > 0 开口向上，a < 0 开口向下。', severity: 'must', checkType: 'conceptual' },
      { id: 'quadratic-a-width', description: '开口宽窄', mustBeTrue: '|a| 越大，开口越窄。', severity: 'must', checkType: 'visual' },
    ],
    suggestedVisualStructure: 'Canvas 图像、参数滑块、公式区、观察区和小测区。',
    estimatedDurationMinutes: 10,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  editableSlots: [
    { key: 'aRange', label: 'a 范围', type: 'parameter_range', description: '调整 a 的滑块范围。', defaultValue: [-3, 3] },
    { key: 'bRange', label: 'b 范围', type: 'parameter_range', description: '调整 b 的滑块范围。', defaultValue: [-5, 5] },
    { key: 'cRange', label: 'c 范围', type: 'parameter_range', description: '调整 c 的滑块范围。', defaultValue: [-5, 5] },
    { key: 'difficulty', label: '难度', type: 'difficulty', description: '调整题目和提示深度。' },
    { key: 'showVertex', label: '显示顶点', type: 'layout', description: '显示或强调顶点坐标。', defaultValue: true },
    { key: 'showAxis', label: '显示对称轴', type: 'layout', description: '显示或强调对称轴。', defaultValue: true },
    { key: 'quiz', label: '小测', type: 'quiz', description: '替换 quiz 文案。' },
  ],
  protectedConstraints: ['不得破坏公式。', '不得错误表现 a/b/c 的作用。', '不得删除图像区。', '不得删除对称轴逻辑。'],
  qualityBaseline: {
    subjectCorrectness: 94,
    interactionCompleteness: 91,
    accessibilityBaseline: ['滑块有 label', 'Canvas 有 aria-label', '支持移动端单列布局'],
    knownLimitations: ['图像比例为教学简化比例。'],
    manuallyReviewed: true,
  },
  version: '1.0.0',
  sourceType: 'original',
  licenseNote: 'Original STEMotion verified template; no third-party code, assets, or branding.',
};
