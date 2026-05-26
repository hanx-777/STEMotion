import type { ExperimentConfig } from '../schema/experiment';

const WIDGET_MESSAGES = [
  'SET_WIDGET_STATE',
  'HIGHLIGHT_ELEMENT',
  'ANNOTATE_ELEMENT',
  'REVEAL_ELEMENT',
] as const;

export function generateInclinedPlaneMock(prompt = ''): ExperimentConfig {
  const requestedMassComparison = /质量|mass|different/i.test(prompt);

  return {
    id: 'inclined-plane-cart-mass-comparison',
    title: '不同质量小车在斜面上的运动',
    subject: 'physics',
    gradeLevel: 'K-12 / 初高中衔接',
    description: '通过可调质量、斜面角度、摩擦系数和重力，观察小车沿斜面下滑时的加速度、速度与位移变化。',
    learningGoals: [
      '理解重力在斜面方向和平行方向的分解。',
      '使用 a = g sin(theta) - mu g cos(theta) 解释下滑加速度。',
      '观察在简化模型中质量不会改变加速度，但会改变力的大小。',
      '比较摩擦系数和斜面角度对运动结果的影响。',
    ],
    renderer: 'inclined_plane',
    environment: { gravity: 9.8, friction: true, airResistance: false },
    objects: [
      { id: 'cart', type: 'cart', label: '实验小车', initialState: { positionMeters: 0, velocityMetersPerSecond: 0 } },
      { id: 'ramp', type: 'inclined_plane', label: '可调斜面', initialState: { angleDegrees: 30 } },
    ],
    parameters: [
      {
        id: 'mass',
        label: '小车质量',
        type: 'number',
        defaultValue: requestedMassComparison ? 2 : 1,
        min: 0.2,
        max: 8,
        step: 0.1,
        unit: 'kg',
        explanation: '质量会改变重力和法向力大小，但在这个简化加速度公式中会相互抵消。',
      },
      {
        id: 'angle',
        label: '斜面角度',
        type: 'number',
        defaultValue: 30,
        min: 5,
        max: 65,
        step: 1,
        unit: 'deg',
        explanation: '角度越大，重力沿斜面向下的分量越大。',
      },
      {
        id: 'friction',
        label: '摩擦系数',
        type: 'number',
        defaultValue: 0.12,
        min: 0,
        max: 0.8,
        step: 0.01,
        unit: '',
        explanation: '摩擦系数越大，阻碍下滑的加速度项越大。',
      },
      {
        id: 'gravity',
        label: '重力加速度',
        type: 'number',
        defaultValue: 9.8,
        min: 1.6,
        max: 12,
        step: 0.1,
        unit: 'm/s^2',
        explanation: '不同星球或课堂假设下可调整重力加速度。',
      },
    ],
    simulation: {
      type: 'inclined_plane_cart',
      model: 'acceleration = max(0, g * sin(theta) - mu * g * cos(theta))',
      timeStepMs: 16,
      durationSeconds: 8,
      trackedMetrics: ['time', 'acceleration', 'velocity', 'distance'],
    },
    actions: [
      {
        id: 'speech_intro',
        type: 'speech',
        text: '我们先观察小车、斜面和四个可调参数。今天的目标是判断质量是否会改变斜面下滑加速度。',
        duration: 2600,
      },
      { id: 'highlight_cart', type: 'highlight_object', objectId: 'cart', color: '#2563eb', duration: 1400 },
      {
        id: 'speech_forces',
        type: 'speech',
        text: '小车受到竖直向下的重力、垂直斜面的支持力，以及沿斜面向上的摩擦力。',
        duration: 2800,
      },
      {
        id: 'show_acceleration_formula',
        type: 'show_formula',
        formulaId: 'acceleration',
        title: '斜面加速度',
        latex: 'a = max(0, g sin(theta) - mu g cos(theta))',
        duration: 1200,
      },
      { id: 'highlight_formula', type: 'highlight_formula', formulaId: 'acceleration', duration: 1200 },
      { id: 'show_acc_metric', type: 'show_metric', metricId: 'acceleration', label: '加速度', duration: 600 },
      {
        id: 'speech_start',
        type: 'speech',
        text: '现在启动模拟。注意速度会随时间线性增加，而位移增长会越来越快。',
        duration: 2200,
      },
      { id: 'start_first_run', type: 'start_simulation', duration: 3600 },
      { id: 'pause_first_run', type: 'pause_simulation', duration: 400 },
      {
        id: 'speech_mass_change',
        type: 'speech',
        text: '接下来把质量调大。公式中质量已经抵消，所以加速度不会因为质量本身改变。',
        duration: 3000,
      },
      { id: 'reset_before_compare', type: 'reset_simulation', duration: 600 },
      { id: 'set_heavier_cart', type: 'set_parameter', parameterId: 'mass', value: 5, duration: 900 },
      { id: 'start_second_run', type: 'start_simulation', duration: 3000 },
      { id: 'compare_mass_result', type: 'compare_result', targetIds: ['mass', 'acceleration'], duration: 2200 },
      { id: 'show_quiz', type: 'show_quiz', quizId: 'q_mass_acceleration', duration: 1200 },
    ],
    explanationSteps: [
      {
        id: 'step_observe',
        title: '观察实验对象',
        narration: '识别小车、斜面和力的方向。',
        actionIds: ['speech_intro', 'highlight_cart', 'speech_forces'],
      },
      {
        id: 'step_formula',
        title: '建立简化模型',
        narration: '把重力分解到斜面方向，并扣除摩擦项。',
        actionIds: ['show_acceleration_formula', 'highlight_formula', 'show_acc_metric', 'speech_start'],
      },
      {
        id: 'step_run',
        title: '运行第一次模拟',
        narration: '观察速度、位移与时间的关系。',
        actionIds: ['start_first_run', 'pause_first_run'],
      },
      {
        id: 'step_compare_mass',
        title: '改变质量并比较',
        narration: '比较轻车和重车在同一角度与摩擦下的加速度。',
        actionIds: ['speech_mass_change', 'reset_before_compare', 'set_heavier_cart', 'start_second_run', 'compare_mass_result'],
      },
      { id: 'step_quiz', title: '课堂检查', narration: '用一道互动题确认学生是否理解变量关系。', actionIds: ['show_quiz'] },
    ],
    quiz: [
      {
        id: 'q_mass_acceleration',
        type: 'multiple_choice',
        question: '在这个简化模型中，只改变小车质量，加速度会怎样变化？',
        options: ['质量越大，加速度越大', '质量越大，加速度越小', '加速度基本不变'],
        correctAnswer: '加速度基本不变',
        explanation: '因为 a = g sin(theta) - mu g cos(theta) 中没有质量项。',
      },
    ],
  };
}

export function generateParallelCircuitMock(): ExperimentConfig {
  return {
    id: 'parallel-circuit-explorer',
    title: '并联电路探索器',
    subject: 'physics',
    gradeLevel: 'K-12 / 初中物理',
    description: '通过电压、电阻和支路开关，观察并联电路中各支路电流与总电流的关系。',
    learningGoals: [
      '理解并联电路中各支路两端电压相同。',
      '使用 I = U / R 计算每条支路电流。',
      '观察总电流等于各支路电流之和。',
      '通过开关控制支路，比较通路数量对总电流的影响。',
    ],
    renderer: 'interactive_html',
    environment: { circuitType: 'parallel', idealWire: true },
    objects: [
      { id: 'battery', type: 'battery', label: '电源', initialState: { voltage: 12 } },
      { id: 'branch-1', type: 'resistor_branch', label: '支路 1', initialState: { resistance: 10, enabled: true } },
      { id: 'branch-2', type: 'resistor_branch', label: '支路 2', initialState: { resistance: 20, enabled: true } },
      { id: 'branch-3', type: 'resistor_branch', label: '支路 3', initialState: { resistance: 30, enabled: true } },
    ],
    parameters: [
      { id: 'voltage', label: '电源电压', type: 'number', defaultValue: 12, min: 3, max: 24, step: 0.5, unit: 'V' },
      { id: 'r1', label: '支路 1 电阻', type: 'number', defaultValue: 10, min: 5, max: 60, step: 1, unit: 'Ω' },
      { id: 'r2', label: '支路 2 电阻', type: 'number', defaultValue: 20, min: 5, max: 60, step: 1, unit: 'Ω' },
      { id: 'r3', label: '支路 3 电阻', type: 'number', defaultValue: 30, min: 5, max: 60, step: 1, unit: 'Ω' },
    ],
    simulation: {
      type: 'parallel_circuit',
      model: 'I_branch = U / R_branch; I_total = I1 + I2 + I3',
      timeStepMs: 16,
      durationSeconds: 10,
      trackedMetrics: ['totalCurrent', 'branchCurrent1', 'branchCurrent2', 'branchCurrent3'],
    },
    interactiveWidget: {
      html: buildParallelCircuitHtml(),
      widgetType: 'simulation',
      allowedMessageTypes: [...WIDGET_MESSAGES],
      widgetConfig: {
        concept: 'parallel_circuit',
        variables: ['voltage', 'r1', 'r2', 'r3', 'b1', 'b2', 'b3'],
        defaultState: { voltage: 12, r1: 10, r2: 20, r3: 30, b1: true, b2: true, b3: true, running: false },
      },
    },
    actions: [
      {
        id: 'circuit_intro',
        type: 'speech',
        text: '这是一个并联电路。三条支路连接在同一组电源两端，所以每条支路的电压相同。',
        duration: 2600,
      },
      {
        id: 'highlight_voltage',
        type: 'highlight_widget_element',
        target: '#voltage-slider',
        content: '电源电压会同时影响每条支路的电流。',
        duration: 1600,
      },
      {
        id: 'show_ohm_formula',
        type: 'show_formula',
        formulaId: 'ohm',
        title: '欧姆定律',
        latex: 'I = U / R',
        duration: 1000,
      },
      {
        id: 'annotate_branch_1',
        type: 'annotate_widget_element',
        target: '#branch-1-resistor',
        content: '支路 1 的电阻较小，因此在相同电压下电流较大。',
        duration: 2200,
      },
      { id: 'start_circuit', type: 'start_simulation', duration: 2600 },
      {
        id: 'set_high_voltage',
        type: 'set_widget_state',
        state: { voltage: 18, running: true },
        duration: 2200,
      },
      {
        id: 'open_branch_3',
        type: 'set_widget_state',
        state: { b3: false, running: true },
        duration: 1600,
      },
      {
        id: 'annotate_total_current',
        type: 'annotate_widget_element',
        target: '#total-current-card',
        content: '断开一条支路后，总电流会减少，因为总电流是各支路电流之和。',
        duration: 2600,
      },
      {
        id: 'show_parallel_formula',
        type: 'show_formula',
        formulaId: 'parallel-current',
        title: '并联总电流',
        latex: 'I_total = I1 + I2 + I3',
        duration: 1200,
      },
      { id: 'show_circuit_quiz', type: 'show_quiz', quizId: 'q_parallel_total_current', duration: 1200 },
    ],
    explanationSteps: [
      {
        id: 'step_parallel_structure',
        title: '认识并联结构',
        narration: '观察三条支路如何连接在同一个电源两端。',
        actionIds: ['circuit_intro', 'highlight_voltage', 'show_ohm_formula'],
      },
      {
        id: 'step_branch_current',
        title: '支路电流',
        narration: '在相同电压下，电阻越小，支路电流越大。',
        actionIds: ['annotate_branch_1', 'start_circuit', 'set_high_voltage'],
      },
      {
        id: 'step_total_current',
        title: '总电流关系',
        narration: '断开一条支路，观察总电流如何变化。',
        actionIds: ['open_branch_3', 'annotate_total_current', 'show_parallel_formula'],
      },
      {
        id: 'step_circuit_quiz',
        title: '课堂检查',
        narration: '用一道题确认并联电路的总电流规律。',
        actionIds: ['show_circuit_quiz'],
      },
    ],
    quiz: [
      {
        id: 'q_parallel_total_current',
        type: 'multiple_choice',
        question: '在并联电路中，闭合更多支路时，总电流通常会怎样变化？',
        options: ['增大', '减小', '保持为零'],
        correctAnswer: '增大',
        explanation: '每条闭合支路都会贡献电流，总电流等于各支路电流之和。',
      },
    ],
  };
}

export function generateMockExperimentFromPrompt(prompt: string): ExperimentConfig {
  if (/并联|电路|欧姆|电阻|电流|ohm|circuit|parallel/i.test(prompt)) {
    return generateParallelCircuitMock();
  }

  return generateInclinedPlaneMock(prompt);
}

function buildParallelCircuitHtml(): string {
  return String.raw`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>并联电路探索器</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #1f2937;
      --muted: #64748b;
      --line: #334155;
      --panel: #ffffff;
      --soft: #f1f5f9;
      --accent: #ea580c;
      --purple: #7c3aed;
      --electron: #facc15;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: #eef4fb;
      color: var(--ink);
    }
    .lab {
      min-height: 100vh;
      display: grid;
      grid-template-columns: minmax(300px, 400px) 1fr;
      gap: 0;
      border: 1px solid #dbe5f0;
      background: #edf3f9;
    }
    .controls {
      background: rgba(255,255,255,0.96);
      border-right: 1px solid #dbe5f0;
      padding: 24px;
      overflow: auto;
    }
    .stage {
      position: relative;
      min-height: 560px;
      padding: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    h1 {
      margin: 0 0 12px;
      font-size: 24px;
      line-height: 1.2;
      letter-spacing: 0;
    }
    .eyebrow {
      font-size: 13px;
      font-weight: 800;
      color: #64748b;
      margin-bottom: 8px;
    }
    .button-row {
      display: grid;
      grid-template-columns: 1fr 100px;
      gap: 10px;
      margin: 18px 0 24px;
    }
    button {
      min-height: 44px;
      border: 0;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 800;
      cursor: pointer;
      touch-action: manipulation;
    }
    #main-btn {
      background: var(--accent);
      color: white;
    }
    #reset-btn {
      background: #eef2f7;
      color: #475569;
    }
    .field {
      padding: 16px 0;
      border-top: 1px solid #e2e8f0;
    }
    .field-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
      margin-bottom: 12px;
    }
    label, .label {
      font-size: 15px;
      font-weight: 800;
      color: #334155;
    }
    .value {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: var(--purple);
      font-weight: 900;
    }
    input[type="range"] {
      width: 100%;
      min-height: 44px;
      accent-color: var(--purple);
      cursor: pointer;
    }
    .branch-card {
      margin-top: 14px;
      padding: 14px;
      border-radius: 8px;
      background: #f8fafc;
    }
    .branch-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .switch {
      width: 58px;
      height: 32px;
      padding: 3px;
      border-radius: 999px;
      background: #cbd5e1;
      display: flex;
      justify-content: flex-start;
      transition: background 160ms ease;
    }
    .switch.on {
      background: #10b981;
      justify-content: flex-end;
    }
    .knob {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: white;
      box-shadow: 0 1px 4px rgba(15,23,42,0.24);
    }
    .meta {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      color: #475569;
    }
    .metric-card {
      position: absolute;
      top: 20px;
      left: 20px;
      min-width: 130px;
      padding: 14px 16px;
      border: 1px solid #dbe5f0;
      border-radius: 8px;
      background: white;
      box-shadow: 0 8px 18px rgba(15,23,42,0.06);
      z-index: 2;
    }
    .metric-card .small {
      color: #94a3b8;
      font-size: 12px;
      font-weight: 800;
    }
    .metric-card .big {
      margin-top: 6px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 26px;
      font-weight: 900;
    }
    .status {
      position: absolute;
      top: 20px;
      right: 22px;
      padding: 8px 14px;
      border-radius: 999px;
      background: #e2e8f0;
      color: #475569;
      font-size: 13px;
      font-weight: 900;
      z-index: 2;
    }
    .status.running {
      background: #bbf7d0;
      color: #047857;
    }
    svg {
      width: min(900px, 100%);
      height: auto;
      max-height: 82vh;
      overflow: visible;
    }
    .wire {
      fill: none;
      stroke: var(--line);
      stroke-width: 4;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .resistor {
      fill: white;
      stroke: #334155;
      stroke-width: 2;
    }
    .electron {
      fill: var(--electron);
      stroke: #eab308;
      stroke-width: 1;
      opacity: 0;
    }
    .electron.on {
      opacity: 1;
    }
    .disabled-wire {
      opacity: 0.28;
    }
    .hidden { display: none; }
    .legend {
      position: absolute;
      bottom: 18px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 18px;
      color: #475569;
      font-size: 13px;
      font-weight: 800;
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      display: inline-block;
      margin-right: 6px;
    }
    .teacher-annotation {
      position: fixed;
      max-width: 260px;
      background: rgba(124,58,237,0.96);
      color: white;
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 14px;
      line-height: 1.45;
      z-index: 50;
      box-shadow: 0 14px 28px rgba(76,29,149,0.24);
    }
    .highlighted {
      outline: 3px solid rgba(124,58,237,0.85);
      outline-offset: 4px;
      animation: pulse-highlight 1s ease-in-out infinite;
    }
    @keyframes pulse-highlight {
      0%, 100% { outline-color: rgba(124,58,237,0.85); }
      50% { outline-color: rgba(124,58,237,0.35); }
    }
    @media (max-width: 780px) {
      .lab {
        grid-template-columns: 1fr;
      }
      .controls {
        border-right: 0;
        border-bottom: 1px solid #dbe5f0;
        max-height: 42vh;
      }
      .stage {
        min-height: 360px;
        padding: 16px;
      }
      .metric-card, .status {
        position: static;
        margin: 0 8px 8px;
      }
      .stage {
        align-items: flex-start;
        flex-direction: column;
      }
      svg {
        max-height: none;
      }
      .legend {
        position: static;
        transform: none;
        margin: 8px auto 0;
      }
    }
  </style>
</head>
<body>
  <script type="application/json" id="widget-config">
    {
      "type": "simulation",
      "concept": "parallel_circuit",
      "variables": [
        { "name": "voltage", "label": "电源电压", "min": 3, "max": 24, "default": 12, "unit": "V" },
        { "name": "r1", "label": "支路 1 电阻", "min": 5, "max": 60, "default": 10, "unit": "Ω" },
        { "name": "r2", "label": "支路 2 电阻", "min": 5, "max": 60, "default": 20, "unit": "Ω" },
        { "name": "r3", "label": "支路 3 电阻", "min": 5, "max": 60, "default": 30, "unit": "Ω" }
      ]
    }
  </script>
  <main class="lab">
    <aside class="controls">
      <div class="eyebrow">电源总开关 & 动画</div>
      <h1>并联电路模拟</h1>
      <div class="button-row">
        <button id="main-btn" type="button" aria-label="启动或暂停实验">启动实验</button>
        <button id="reset-btn" type="button" aria-label="重置实验">重置</button>
      </div>

      <section class="field" id="voltage-control">
        <div class="field-header">
          <label for="voltage-slider">电源电压 (U)</label>
          <span class="value" id="voltage-display">12.0 V</span>
        </div>
        <input id="voltage-slider" data-var="voltage" type="range" min="3" max="24" step="0.5" value="12" />
      </section>

      <section class="field">
        <div class="eyebrow">支路参数调节</div>
        <div class="branch-card" id="branch-1-card">
          <div class="branch-top">
            <span class="label">支路 1</span>
            <button id="b1-toggle" class="switch on" type="button" aria-label="切换支路 1"><span class="knob"></span></button>
          </div>
          <input id="r1-slider" data-var="r1" type="range" min="5" max="60" step="1" value="10" />
          <div class="meta"><span id="r1-display">R1: 10Ω</span><span id="i1-display">I1: 1.20A</span></div>
        </div>
        <div class="branch-card" id="branch-2-card">
          <div class="branch-top">
            <span class="label">支路 2</span>
            <button id="b2-toggle" class="switch on" type="button" aria-label="切换支路 2"><span class="knob"></span></button>
          </div>
          <input id="r2-slider" data-var="r2" type="range" min="5" max="60" step="1" value="20" />
          <div class="meta"><span id="r2-display">R2: 20Ω</span><span id="i2-display">I2: 0.60A</span></div>
        </div>
        <div class="branch-card" id="branch-3-card">
          <div class="branch-top">
            <span class="label">支路 3</span>
            <button id="b3-toggle" class="switch on" type="button" aria-label="切换支路 3"><span class="knob"></span></button>
          </div>
          <input id="r3-slider" data-var="r3" type="range" min="5" max="60" step="1" value="30" />
          <div class="meta"><span id="r3-display">R3: 30Ω</span><span id="i3-display">I3: 0.40A</span></div>
        </div>
      </section>
    </aside>

    <section class="stage" id="circuit-stage">
      <div class="metric-card" id="total-current-card">
        <div class="small">总电流 (I总)</div>
        <div class="big" id="total-current-display">2.20 A</div>
      </div>
      <div class="status" id="status-pill">已暂停</div>

      <svg id="circuit-svg" viewBox="0 0 900 520" role="img" aria-label="并联电路示意图">
        <line class="wire" x1="250" y1="120" x2="250" y2="420"></line>
        <line class="wire" x1="760" y1="120" x2="760" y2="420"></line>
        <line class="wire" x1="250" y1="120" x2="760" y2="120"></line>
        <line class="wire" x1="250" y1="260" x2="760" y2="260"></line>
        <line class="wire" x1="250" y1="420" x2="760" y2="420"></line>
        <line class="wire" x1="250" y1="260" x2="250" y2="330"></line>
        <line class="wire" x1="250" y1="330" x2="250" y2="420"></line>
        <line class="wire" x1="230" y1="252" x2="270" y2="252"></line>
        <line class="wire" x1="238" y1="274" x2="262" y2="274"></line>
        <text x="216" y="246" font-size="20" font-weight="900" fill="#334155">+</text>
        <text x="218" y="282" font-size="20" font-weight="900" fill="#334155">-</text>

        <g id="branch-1-svg">
          <rect id="branch-1-resistor" class="resistor" x="430" y="98" width="88" height="44" rx="2"></rect>
          <line x1="450" y1="99" x2="450" y2="141" stroke="#ef4444" stroke-width="7"></line>
          <line x1="478" y1="99" x2="478" y2="141" stroke="#64748b" stroke-width="7"></line>
          <line x1="506" y1="99" x2="506" y2="141" stroke="#facc15" stroke-width="7"></line>
          <text x="456" y="90" font-size="14" fill="#334155">支路 1</text>
          <text id="branch-1-label" x="459" y="158" font-size="13" fill="#334155">10Ω</text>
        </g>
        <g id="branch-2-svg">
          <rect id="branch-2-resistor" class="resistor" x="430" y="238" width="88" height="44" rx="2"></rect>
          <line x1="450" y1="239" x2="450" y2="281" stroke="#3b82f6" stroke-width="7"></line>
          <line x1="478" y1="239" x2="478" y2="281" stroke="#3b82f6" stroke-width="7"></line>
          <line x1="506" y1="239" x2="506" y2="281" stroke="#facc15" stroke-width="7"></line>
          <text x="456" y="230" font-size="14" fill="#334155">支路 2</text>
          <text id="branch-2-label" x="459" y="298" font-size="13" fill="#334155">20Ω</text>
        </g>
        <g id="branch-3-svg">
          <rect id="branch-3-resistor" class="resistor" x="430" y="398" width="88" height="44" rx="2"></rect>
          <line x1="450" y1="399" x2="450" y2="441" stroke="#10b981" stroke-width="7"></line>
          <line x1="478" y1="399" x2="478" y2="441" stroke="#10b981" stroke-width="7"></line>
          <line x1="506" y1="399" x2="506" y2="441" stroke="#64748b" stroke-width="7"></line>
          <text x="456" y="390" font-size="14" fill="#334155">支路 3</text>
          <text id="branch-3-label" x="459" y="458" font-size="13" fill="#334155">30Ω</text>
        </g>
      </svg>

      <div class="legend" aria-hidden="true">
        <span><i class="dot" style="background:#facc15"></i>电子流动</span>
        <span><i class="dot" style="background:#334155"></i>导线</span>
        <span><i class="dot" style="background:#f8fafc;border:2px solid #334155"></i>用电器</span>
      </div>
    </section>
  </main>

  <script>
    const defaults = { voltage: 12, r1: 10, r2: 20, r3: 30, b1: true, b2: true, b3: true, running: false };
    const state = { ...defaults, phase: 0 };
    const svg = document.getElementById('circuit-svg');
    const electrons = [];
    const branchY = { 1: 120, 2: 260, 3: 420 };

    function byId(id) { return document.getElementById(id); }
    function current(index) {
      if (!state['b' + index]) return 0;
      return state.voltage / state['r' + index];
    }
    function totalCurrent() {
      return current(1) + current(2) + current(3);
    }
    function setText(id, value) {
      const el = byId(id);
      if (el) el.textContent = value;
    }
    function syncInputs() {
      ['voltage', 'r1', 'r2', 'r3'].forEach(function(key) {
        const slider = byId(key + '-slider');
        if (slider) slider.value = state[key];
      });
      [1, 2, 3].forEach(function(i) {
        byId('b' + i + '-toggle').classList.toggle('on', state['b' + i]);
        byId('branch-' + i + '-svg').classList.toggle('disabled-wire', !state['b' + i]);
      });
    }
    function render() {
      const i1 = current(1);
      const i2 = current(2);
      const i3 = current(3);
      setText('voltage-display', state.voltage.toFixed(1) + ' V');
      setText('r1-display', 'R1: ' + state.r1 + 'Ω');
      setText('r2-display', 'R2: ' + state.r2 + 'Ω');
      setText('r3-display', 'R3: ' + state.r3 + 'Ω');
      setText('i1-display', 'I1: ' + i1.toFixed(2) + 'A');
      setText('i2-display', 'I2: ' + i2.toFixed(2) + 'A');
      setText('i3-display', 'I3: ' + i3.toFixed(2) + 'A');
      setText('total-current-display', totalCurrent().toFixed(2) + ' A');
      setText('branch-1-label', state.r1 + 'Ω');
      setText('branch-2-label', state.r2 + 'Ω');
      setText('branch-3-label', state.r3 + 'Ω');
      byId('main-btn').textContent = state.running ? '暂停实验' : '启动实验';
      byId('status-pill').textContent = state.running ? '运行中' : '已暂停';
      byId('status-pill').classList.toggle('running', state.running);
      syncInputs();
      updateElectrons();
    }
    function pathPoint(points, progress) {
      let lengths = [];
      let total = 0;
      for (let i = 0; i < points.length - 1; i++) {
        const dx = points[i + 1][0] - points[i][0];
        const dy = points[i + 1][1] - points[i][1];
        const len = Math.sqrt(dx * dx + dy * dy);
        lengths.push(len);
        total += len;
      }
      let target = (progress % 1) * total;
      for (let i = 0; i < lengths.length; i++) {
        if (target <= lengths[i]) {
          const ratio = target / lengths[i];
          return [
            points[i][0] + (points[i + 1][0] - points[i][0]) * ratio,
            points[i][1] + (points[i + 1][1] - points[i][1]) * ratio
          ];
        }
        target -= lengths[i];
      }
      return points[0];
    }
    function ensureElectrons() {
      if (electrons.length) return;
      for (let branch = 1; branch <= 3; branch++) {
        for (let i = 0; i < 8; i++) {
          const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          circle.setAttribute('r', '5');
          circle.setAttribute('class', 'electron');
          svg.appendChild(circle);
          electrons.push({ branch, offset: i / 8, el: circle });
        }
      }
    }
    function updateElectrons() {
      ensureElectrons();
      electrons.forEach(function(item) {
        const y = branchY[item.branch];
        const path = [[250,260],[250,y],[430,y],[518,y],[760,y],[760,260],[250,260]];
        const active = state['b' + item.branch] && state.running;
        item.el.classList.toggle('on', active);
        const point = pathPoint(path, state.phase + item.offset);
        item.el.setAttribute('cx', point[0]);
        item.el.setAttribute('cy', point[1]);
      });
    }
    function tick() {
      if (state.running) {
        state.phase = (state.phase + 0.0025 + totalCurrent() * 0.0008) % 1;
        updateElectrons();
      }
      requestAnimationFrame(tick);
    }
    function setWidgetState(next) {
      Object.keys(next || {}).forEach(function(key) {
        if (key in state) state[key] = next[key];
      });
      render();
    }
    function resetSimulation() {
      Object.assign(state, defaults, { phase: 0 });
      render();
    }
    function annotate(target, content) {
      const el = document.querySelector(target);
      if (!el || !content) return;
      const rect = el.getBoundingClientRect();
      const tip = document.createElement('div');
      tip.className = 'teacher-annotation';
      tip.textContent = content;
      tip.style.top = Math.max(12, rect.top - 52) + 'px';
      tip.style.left = Math.min(window.innerWidth - 280, Math.max(12, rect.left)) + 'px';
      document.body.appendChild(tip);
      setTimeout(function() { tip.remove(); }, 3600);
    }
    function highlight(target) {
      const el = document.querySelector(target);
      if (!el) return;
      el.classList.add('highlighted');
      setTimeout(function() { el.classList.remove('highlighted'); }, 3200);
    }

    byId('main-btn').addEventListener('click', function() {
      state.running = !state.running;
      render();
    });
    byId('reset-btn').addEventListener('click', resetSimulation);
    ['voltage', 'r1', 'r2', 'r3'].forEach(function(key) {
      byId(key + '-slider').addEventListener('input', function(event) {
        state[key] = Number(event.target.value);
        render();
      });
    });
    [1, 2, 3].forEach(function(i) {
      byId('b' + i + '-toggle').addEventListener('click', function() {
        state['b' + i] = !state['b' + i];
        render();
      });
    });
    window.addEventListener('keydown', function(event) {
      if (event.code === 'Space') {
        event.preventDefault();
        state.running = !state.running;
        render();
      }
      if (event.key.toLowerCase() === 'r') resetSimulation();
    });
    window.addEventListener('message', function(event) {
      const data = event.data || {};
      if (data.type === 'SET_WIDGET_STATE') setWidgetState(data.state || {});
      if (data.type === 'HIGHLIGHT_ELEMENT') {
        highlight(data.target);
        if (data.content) annotate(data.target, data.content);
      }
      if (data.type === 'ANNOTATE_ELEMENT') annotate(data.target, data.content);
      if (data.type === 'REVEAL_ELEMENT') {
        const el = document.querySelector(data.target);
        if (el) el.classList.remove('hidden');
      }
    });

    render();
    tick();
  </script>
</body>
</html>`;
}
