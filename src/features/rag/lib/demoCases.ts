import type { AnswerSection, Citation, RagTaskType, VisualizationHint } from './types';

export type DemoGroupId = 'student' | 'teacher' | 'visualization';

export interface DemoCase {
  id: string;
  group: DemoGroupId;
  title: string;
  subject: string;
  taskType: RagTaskType;
  question: string;
  description: string;
  expectedHighlights: string[];
  fallbackAnswerSections: AnswerSection[];
  fallbackCitations: Citation[];
  fallbackVisualizationHint?: VisualizationHint;
}

const projectileHint: VisualizationHint = {
  type: 'projectile_motion',
  parameters: {
    v0: 8.0,
    angle_deg: 35,
    g: 9.8,
  },
};

const projectileCitation: Citation = {
  source_type: 'local',
  source: 'projectile_motion.md',
  chunk_id: 'demo_projectile_motion_001',
  subject: 'physics_mechanics',
  file_name: 'projectile_motion.md',
};

export const DEMO_CASES: DemoCase[] = [
  {
    id: 'projectile',
    group: 'student',
    title: '非零高度斜抛运动建模',
    subject: 'physics_mechanics',
    taskType: 'step_solution',
    question:
      '在大学物理力学实验中，某小球从高度 h = 1.20 m 的平台边缘以初速度 v0 = 8.0 m/s、仰角 θ = 35° 斜向上抛出。忽略空气阻力，取 g = 9.8 m/s²。请建立二维运动模型，求小球落地时间、水平射程、最大高度，并分析 θ 对射程的影响。',
    description: '展示非零初始高度条件下的斜抛运动建模、分步推导、参数分析和可视化参数。',
    expectedHighlights: ['模型假设', '运动分解', '落地时间', '水平射程', '最大高度', '参数分析', '引用来源', '可视化参数'],
    fallbackAnswerSections: [
      { id: 'assumptions', title: '模型假设', content: '忽略空气阻力；重力加速度恒定 g = 9.8 m/s²；小球视为质点；初始高度 h = 1.20 m。' },
      { id: 'extract', title: '已知量提取', content: 'h = 1.20 m，v0 = 8.0 m/s，θ = 35°，g = 9.8 m/s²。初速度分量：v0x = v0 cosθ ≈ 6.55 m/s，v0y = v0 sinθ ≈ 4.59 m/s。' },
      { id: 'model', title: '物理模型判断', content: '该问题属于非零初始高度的斜抛运动模型，水平方向匀速运动，竖直方向匀变速运动。' },
      { id: 'derivation', title: '分步推导', content: '竖直方向：y(t) = h + v0y·t - ½gt²。令 y(t) = 0 求落地时间 t。最大高度 H = h + v0y²/(2g)。水平射程 R = v0x·t。' },
      { id: 'result', title: '结果', content: '落地时间 t ≈ 1.18 s，最大高度 H ≈ 2.28 m，水平射程 R ≈ 7.74 m（需数值求解竖直方程）。' },
      { id: 'analysis', title: '参数分析', content: 'θ 增大时竖直分速度增大，最大高度增加；但水平分速度减小，射程变化取决于 h 和 θ 的综合影响。当 h > 0 时，最大射程对应的发射角小于 45°。' },
      { id: 'pitfalls', title: '易错点', content: '不能直接套用同高落地射程公式 R = v0²sin(2θ)/g；非零高度条件下需通过求解二次方程得到落地时间。' },
      { id: 'citations', title: '引用来源', content: '[1] projectile_motion.md（本地课程资料）' },
    ],
    fallbackCitations: [projectileCitation],
    fallbackVisualizationHint: projectileHint,
  },
  {
    id: 'circular',
    group: 'student',
    title: '向心加速度的矢量分析',
    subject: 'physics_mechanics',
    taskType: 'knowledge_qa',
    question:
      '在大学物理中，为什么匀速圆周运动的速度大小不变但仍需引入向心加速度？请从速度矢量的微分定义出发，说明加速度的物理意义、方向特征和公式推导过程。',
    description: '展示从矢量微分角度理解向心加速度的概念讲解。',
    expectedHighlights: ['速度是矢量', '矢量微分', '速度方向变化', '向心加速度', 'a = v²/r', '方向指向圆心', '引用来源'],
    fallbackAnswerSections: [
      { id: 'concept', title: '核心概念', content: '速度是矢量，有大小和方向。加速度定义为速度矢量的时间变化率 a = dv/dt。即使速度大小不变，方向变化仍产生加速度。' },
      { id: 'derivation', title: '矢量推导', content: '在 dt 时间内，速度矢量方向变化 dθ = v·dt/r，速度变化量 |dv| = v·dθ = v²·dt/r，因此 |a| = |dv|/dt = v²/r。' },
      { id: 'direction', title: '方向特征', content: '加速度方向始终指向圆心（向心），与速度方向垂直，不改变速度大小，只改变速度方向。' },
      { id: 'study_hint', title: '学习建议', content: '复习矢量运算和极限概念，结合圆周运动的矢量图理解 dv 的方向。' },
      { id: 'citations', title: '引用来源', content: '演示样例结果需在真实运行后补充本地课程资料或网络补充资料 citation。' },
    ],
    fallbackCitations: [],
  },
  {
    id: 'mistake',
    group: 'student',
    title: '斜抛运动公式误用诊断',
    subject: 'physics_mechanics',
    taskType: 'misconception_diagnosis',
    question:
      '学生在求解斜抛运动最大高度时写道：H = v0² / (2g)，并认为发射角越大射程一定越大。请判断该答案是否正确，分析其中的公式误用和概念错误，给出正确的推导过程和复习建议。',
    description: '展示公式适用条件误用和概念错误的诊断分析。',
    expectedHighlights: ['公式适用条件', '竖直分速度', '速度分解', '射程与角度关系', '错因分析', '复习建议', '引用来源'],
    fallbackAnswerSections: [
      { id: 'misconception', title: '学生可能误解', content: 'H = v0²/(2g) 是竖直上抛公式，学生将总初速度 v0 直接代入，忽略了斜抛运动中需要先分解速度。' },
      { id: 'cause', title: '错误原因', content: '该公式仅适用于初速度完全竖直向上的情况。斜抛运动中竖直分速度为 v0y = v0 sinθ，正确公式为 H = (v0 sinθ)²/(2g)。' },
      { id: 'range_error', title: '射程误区', content: '射程 R = v0² sin(2θ)/g，在同高落地条件下 θ = 45° 时射程最大。发射角增大不一定增大射程，需考虑 sin(2θ) 的变化。' },
      { id: 'correction', title: '纠正思路', content: '先分解初速度为水平和竖直分量，再分别应用运动学公式。非零高度条件下射程公式更复杂。' },
      { id: 'practice', title: '巩固练习', content: '比较 30°、45°、60° 下的最大高度和射程，分析非零初始高度条件下最大射程角度的变化。' },
      { id: 'citations', title: '引用来源', content: '[1] projectile_motion.md（本地课程资料）' },
    ],
    fallbackCitations: [projectileCitation],
    fallbackVisualizationHint: projectileHint,
  },
  {
    id: 'teacher',
    group: 'teacher',
    title: '非零高度斜抛运动课堂演示',
    subject: 'physics_mechanics',
    taskType: 'teacher_prep',
    question:
      '请为大学物理"非零初始高度条件下的斜抛运动建模"设计一段 15 分钟课堂演示，要求包含教学目标、模型假设、公式推导、参数变化实验、课堂互动问题、学生易错点和课后拓展练习。',
    description: '突出教师助教场景，生成面向大学物理课堂的完整演示方案。',
    expectedHighlights: ['教学目标', '模型假设', '公式推导', '参数变化实验', '互动问题', '学生易错点', '课后拓展', '引用来源'],
    fallbackAnswerSections: [
      { id: 'objectives', title: '教学目标', content: '学生能够建立非零初始高度的斜抛运动模型，完成速度分解和运动方程求解，理解参数对运动轨迹的影响。' },
      { id: 'assumptions', title: '模型假设', content: '忽略空气阻力；重力加速度恒定；小球视为质点；初始高度 h > 0。' },
      { id: 'blackboard', title: '公式推导', content: 'v0x = v0 cosθ，v0y = v0 sinθ；y(t) = h + v0y·t - ½gt²；令 y(t) = 0 求解落地时间（二次方程）。' },
      { id: 'experiment', title: '参数变化实验', content: '固定 v0 = 8 m/s，改变 θ（15°-75°），观察轨迹变化；固定 θ = 35°，改变 h（0-3 m），观察落地时间和射程变化。' },
      { id: 'questions', title: '互动问题', content: 'h > 0 时最大射程角度还是 45° 吗？落地速度方向与发射角度有何关系？' },
      { id: 'pitfalls', title: '学生易错点', content: '直接套用同高落地公式；忽略落地时间需数值求解；混淆最大高度和最大射程的条件。' },
      { id: 'extensions', title: '课后拓展', content: '考虑空气阻力的斜抛运动数值模拟；三维空间中的斜抛运动。' },
      { id: 'citations', title: '引用来源', content: '[1] projectile_motion.md（本地课程资料）' },
    ],
    fallbackCitations: [projectileCitation],
    fallbackVisualizationHint: projectileHint,
  },
  {
    id: 'trajectory_viz',
    group: 'visualization',
    title: '非零高度斜抛运动轨迹分析',
    subject: 'physics_mechanics',
    taskType: 'step_solution',
    question:
      '请为斜抛运动 h = 1.20 m、v0 = 8.0 m/s、θ = 35° 生成完整的运动轨迹分析，包含落地时间、最大高度、水平射程和落地速度的分步推导。',
    description: '展示非零高度条件下的轨迹可视化参数和运动学公式推导。',
    expectedHighlights: ['模型假设', '分步推导', '落地时间', '最大高度', '水平射程', '落地速度', '可视化参数', '引用来源'],
    fallbackAnswerSections: [
      { id: 'assumptions', title: '模型假设', content: '忽略空气阻力，g = 9.8 m/s²，h = 1.20 m，v0 = 8.0 m/s，θ = 35°。' },
      { id: 'derivation', title: '分步推导', content: 'v0x = 8.0 cos35° ≈ 6.55 m/s，v0y = 8.0 sin35° ≈ 4.59 m/s。落地时间由 1.20 + 4.59t - 4.9t² = 0 求解。最大高度 H = 1.20 + 4.59²/(2×9.8) ≈ 2.28 m。' },
      { id: 'result', title: '结果', content: '落地时间 t ≈ 1.18 s，水平射程 R ≈ 7.74 m，最大高度 H ≈ 2.28 m，落地速度 ≈ 8.96 m/s（方向约 -55°）。' },
      { id: 'citations', title: '引用来源', content: '[1] projectile_motion.md（本地课程资料）' },
    ],
    fallbackCitations: [projectileCitation],
    fallbackVisualizationHint: projectileHint,
  },
];
