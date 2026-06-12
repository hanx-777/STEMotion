import type { InteractionSchema, InteractionSubject } from './types';

export function createInclinedPlaneSchema(title = '斜面小车模拟实验'): InteractionSchema {
  return {
    type: 'simulation',
    subject: 'physics',
    simulationType: 'inclined_plane',
    title,
    description: '调节斜面角度、摩擦系数和小车质量，观察小车沿斜面下滑时的加速度、速度和位移变化。',
    learningGoals: [
      '理解重力沿斜面的分力如何影响运动',
      '观察摩擦系数对加速度的影响',
      '认识理想斜面中质量不直接改变加速度的原因',
    ],
    parameters: [
      {
        id: 'mass',
        label: '小车质量',
        value: 1.5,
        defaultValue: 1.5,
        min: 0.5,
        max: 5,
        step: 0.1,
        unit: 'kg',
        explanation: '改变质量可以观察受力大小变化，但简化模型中的加速度不直接依赖质量。',
      },
      {
        id: 'angle',
        label: '斜面角度',
        value: 30,
        defaultValue: 30,
        min: 8,
        max: 55,
        step: 1,
        unit: '°',
        explanation: '角度越大，重力沿斜面方向的分量越大。',
      },
      {
        id: 'friction',
        label: '摩擦系数',
        value: 0.12,
        defaultValue: 0.12,
        min: 0,
        max: 0.6,
        step: 0.01,
        explanation: '摩擦越大，小车越不容易加速。',
      },
      {
        id: 'gravity',
        label: '重力加速度',
        value: 9.8,
        defaultValue: 9.8,
        min: 1,
        max: 12,
        step: 0.1,
        unit: 'm/s²',
        explanation: '地球表面通常取 9.8 m/s²。',
      },
    ],
    objects: [
      { id: 'cart', label: '小车', objectType: 'cart' },
      { id: 'ramp', label: '斜面', objectType: 'ramp' },
      { id: 'gravity_arrow', label: '重力', objectType: 'force_arrow' },
      { id: 'normal_arrow', label: '支持力', objectType: 'force_arrow' },
      { id: 'friction_arrow', label: '摩擦力', objectType: 'force_arrow' },
      { id: 'velocity_arrow', label: '速度方向', objectType: 'force_arrow' },
    ],
    formulas: [
      {
        id: 'acceleration',
        title: '斜面加速度',
        latex: 'a = g\\sin(\\theta) - \\mu g\\cos(\\theta)',
        explanation: '把重力分解到斜面方向，再减去摩擦产生的减速项。',
      },
    ],
    metrics: [
      { id: 'acceleration', label: '加速度', unit: 'm/s²' },
      { id: 'velocity', label: '速度', unit: 'm/s' },
      { id: 'distance', label: '位移', unit: 'm' },
      { id: 'time', label: '时间', unit: 's' },
    ],
    charts: [],
    actions: [
      { id: 'say_intro', type: 'speech', text: '先观察小车在斜面上的受力。', durationMs: 1200 },
      { id: 'highlight_ramp', type: 'highlight_object', objectId: 'ramp', durationMs: 800 },
      { id: 'highlight_formula', type: 'highlight_formula', formulaId: 'acceleration', durationMs: 1000 },
      { id: 'start_motion', type: 'start_simulation', durationMs: 2500 },
      { id: 'pause_motion', type: 'pause_simulation', durationMs: 500 },
    ],
    explanationSteps: [
      {
        id: 'step_forces',
        title: '认识斜面受力',
        narration: '小车受到重力、支持力和摩擦力，真正推动下滑的是重力沿斜面的分力。',
        focusObjects: ['cart', 'ramp', 'gravity_arrow'],
        actions: [
          { id: 'step_forces_speech', type: 'speech', text: '观察重力、支持力和摩擦力的方向。', durationMs: 900 },
          { id: 'step_forces_highlight', type: 'highlight_object', objectId: 'gravity_arrow', durationMs: 800 },
        ],
      },
      {
        id: 'step_formula',
        title: '连接公式',
        narration: '简化模型使用 a = g sin(theta) - μ g cos(theta)，并把结果限制为不小于 0。',
        actions: [
          { id: 'step_formula_show', type: 'show_formula', formulaId: 'acceleration', durationMs: 900 },
          { id: 'step_formula_highlight', type: 'highlight_formula', formulaId: 'acceleration', durationMs: 900 },
        ],
      },
    ],
    quiz: [
      {
        id: 'q_mass',
        question: '在这个简化模型中，如果只改变小车质量，加速度通常会怎样？',
        options: ['明显变大', '明显变小', '基本不变', '一定变为 0'],
        correctAnswer: '基本不变',
        explanation: '质量同时影响重力和摩擦力大小，代入 F=ma 后会约去。',
      },
    ],
  };
}

export function createOhmsLawSchema(): InteractionSchema {
  const schema = createInclinedPlaneSchema('欧姆定律模拟实验') as Extract<InteractionSchema, { type: 'simulation' }>;
  return {
    ...schema,
    subject: 'physics',
    simulationType: 'ohms_law',
    description: '通过调节电压和电阻，观察电流如何按照 I = U / R 变化。',
    learningGoals: ['理解电压、电阻、电流之间的关系', '用欧姆定律预测电路结果', '比较不同参数下的电流大小'],
    parameters: [
      { id: 'voltage', label: '电压', value: 6, defaultValue: 6, min: 1, max: 12, step: 0.5, unit: 'V' },
      { id: 'resistance', label: '电阻', value: 10, defaultValue: 10, min: 2, max: 50, step: 1, unit: 'Ω' },
    ],
    objects: [
      { id: 'battery', label: '电源', objectType: 'battery' },
      { id: 'resistor', label: '电阻', objectType: 'resistor' },
    ],
    formulas: [
      { id: 'ohm', title: '欧姆定律', latex: 'I = U / R', explanation: '电流等于电压除以电阻。' },
    ],
    metrics: [{ id: 'current', label: '电流', unit: 'A' }],
  };
}

export function createMindMapSchema(topic: string, subject: InteractionSubject = 'general'): InteractionSchema {
  const root = topic || 'STEM 知识结构';
  return {
    type: 'mind_map',
    title: `${root}思维导图`,
    description: '把核心概念、关键变量、公式和应用场景组织成可浏览的知识网络。',
    learningGoals: ['建立整体概念框架', '识别关键知识之间的关系', '用结构化方式复习主题'],
    rootId: 'root',
    layout: 'radial',
    nodes: [
      { id: 'root', label: root, level: 0, description: '本次学习的中心主题' },
      { id: 'concept', label: '核心概念', level: 1, description: `${subject} 主题中的基本概念` },
      { id: 'variables', label: '关键变量', level: 1, description: '影响现象变化的因素' },
      { id: 'formula', label: '公式与规律', level: 1, description: '用于解释和预测的关系' },
      { id: 'application', label: '应用场景', level: 1, description: '生活或实验中的应用' },
      { id: 'question', label: '常见问题', level: 2, description: '容易混淆或值得追问的地方' },
    ],
    edges: [
      { id: 'e1', source: 'root', target: 'concept' },
      { id: 'e2', source: 'root', target: 'variables' },
      { id: 'e3', source: 'root', target: 'formula' },
      { id: 'e4', source: 'root', target: 'application' },
      { id: 'e5', source: 'concept', target: 'question' },
    ],
    explanationSteps: [
      {
        id: 'map_overview',
        title: '总览结构',
        narration: '先从中心主题出发，看看它连接了哪些核心知识。',
        actions: [{ id: 'focus_root', type: 'focus_node', nodeId: 'root', durationMs: 900 }],
      },
    ],
    quiz: [
      {
        id: 'q_map',
        question: '复习复杂主题时，思维导图最适合先帮助我们做什么？',
        options: ['随机记忆细节', '建立概念之间的关系', '跳过关键公式', '只看一个例题'],
        correctAnswer: '建立概念之间的关系',
        explanation: '思维导图的优势是把概念、变量、公式和应用组织成结构。',
      },
    ],
  };
}

export function createThreeDVisualizationSchema(topic: string, subject: InteractionSubject = 'chemistry'): InteractionSchema {
  return {
    type: '3d_visualization',
    subject,
    title: `${topic || '空间结构'}3D 可视化`,
    description: '用空间对象、标签和分步讲解呈现三维结构，帮助学生建立直观想象。',
    learningGoals: ['从多个视角观察结构', '理解对象之间的空间关系', '把抽象概念转化为可观察模型'],
    objects: [
      { id: 'center', label: '中心结构', shape: 'sphere', position: { x: 0, y: 0, z: 0 }, color: '#2563eb', description: '核心对象' },
      { id: 'part_a', label: '组成部分 A', shape: 'sphere', position: { x: 1.4, y: 0, z: 0 }, color: '#16a34a', description: '与中心结构相连' },
      { id: 'part_b', label: '组成部分 B', shape: 'sphere', position: { x: -1.2, y: 0.8, z: 0.4 }, color: '#f97316', description: '展示空间方向' },
    ],
    camera: { position: { x: 3, y: 2, z: 5 }, target: { x: 0, y: 0, z: 0 } },
    labels: [
      { id: 'label_center', targetId: 'center', text: '中心结构' },
      { id: 'label_relation', targetId: 'part_a', text: '空间连接' },
    ],
    animations: [
      { id: 'rotate_view', type: 'speech', text: '旋转视角可以帮助我们理解三维空间关系。', durationMs: 1000 },
    ],
    explanationSteps: [
      {
        id: 'view_structure',
        title: '观察整体',
        narration: '先观察中心结构和周围组成部分的位置关系。',
        actions: [{ id: 'highlight_center', type: 'highlight_object', objectId: 'center', durationMs: 900 }],
      },
    ],
    quiz: [
      {
        id: 'q_3d',
        question: '3D 可视化最适合帮助我们理解哪类知识？',
        options: ['空间结构', '纯文字定义', '随机数字', '无关信息'],
        correctAnswer: '空间结构',
        explanation: '三维模型适合观察空间位置、方向和连接关系。',
      },
    ],
  };
}

export function createGameSchema(topic: string): InteractionSchema {
  return {
    type: 'game',
    gameType: 'quiz_challenge',
    title: `${topic || 'STEM'}知识挑战`,
    description: '用短回合挑战帮助学生主动回忆概念、判断规律并获得即时反馈。',
    learningGoals: ['在挑战中巩固关键概念', '通过反馈修正误解', '用游戏节奏保持学习投入'],
    rules: ['完成每一关的互动任务', '正确操作可获得分数', '查看反馈后进入下一关'],
    scoring: { correctPoints: 10, bonusRule: '连续正确可以获得额外鼓励。' },
    levels: [
      { id: 'level_1', title: '基础判断', challenge: '识别核心概念', quizQuestionIds: ['q_game_1'] },
      { id: 'level_2', title: '规律应用', challenge: '把规律用于新情境', quizQuestionIds: ['q_game_2'] },
    ],
    explanationSteps: [
      {
        id: 'game_intro',
        title: '开始挑战',
        narration: '先完成基础任务，再挑战应用任务。每次反馈都能帮助你修正理解。',
        actions: [{ id: 'show_game_quiz', type: 'show_quiz', quizId: 'q_game_1', durationMs: 900 }],
      },
    ],
    quiz: [
      {
        id: 'q_game_1',
        question: '做互动挑战时，最重要的学习动作是什么？',
        options: ['猜完就走', '查看反馈并修正理解', '只看分数', '跳过解析'],
        correctAnswer: '查看反馈并修正理解',
        explanation: '反馈让挑战变成学习，而不只是答题。',
      },
      {
        id: 'q_game_2',
        question: '如果一个变量改变后结果也改变，我们应优先做什么？',
        options: ['记录变化并寻找规律', '忽略变化', '删除变量', '停止观察'],
        correctAnswer: '记录变化并寻找规律',
        explanation: '变量和结果之间的关系是 STEM 探究的核心。',
      },
    ],
  };
}
