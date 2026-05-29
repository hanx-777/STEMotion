import type { DeepInteractionType } from './types';

export interface PhysicsCase {
  id: string;
  title: string;
  description: string;
  prompt: string;
  type: DeepInteractionType;
  icon: string;
}

export const PHYSICS_CASES: PhysicsCase[] = [
  {
    id: 'projectile',
    title: '斜抛运动轨迹',
    description: '调节初始高度、初速度和发射角，观察抛体运动轨迹、落地时间和速度分量变化。',
    prompt: '请生成一个大学物理斜抛运动交互实验：小球从可调初始高度 h（0-5 m）释放，学生可以调节初速度 v0（5-30 m/s）和发射角 θ（10-80°），观察抛体运动轨迹、落地时间、水平射程、最大高度和落地速度。要求显示轨迹动画、速度分量矢量、参数面板和公式推导过程。默认 h=1.20 m，v0=8.0 m/s，θ=35°，g=9.8 m/s²。',
    type: 'simulation',
    icon: 'TrendingUp',
  },
  {
    id: 'circular_motion',
    title: '匀速圆周运动',
    description: '调节线速度和半径，观察向心加速度、周期和角速度的关系。',
    prompt: '请生成一个大学物理匀速圆周运动交互实验：学生可以调节线速度 v（1-20 m/s）和半径 r（0.5-10 m），实时观察物体的圆周运动轨迹、向心加速度 a = v²/r、周期 T = 2πr/v 和角速度 ω = v/r 的变化。要求显示动态旋转动画、速度矢量分解、加速度矢量和参数面板。',
    type: 'simulation',
    icon: 'Circle',
  },
  {
    id: 'energy_conservation',
    title: '机械能守恒',
    description: '调节小球初始高度和质量，观察能量转化过程。',
    prompt: '请生成一个大学物理机械能守恒交互实验：一个小球从斜面顶端释放，学生可以调节初始高度 h（1-10 m）和质量 m（0.5-5 kg），观察小球滑下斜面过程中势能、动能和总机械能的实时变化。要求显示能量条形图、运动动画、速度数值和能量守恒验证。',
    type: 'simulation',
    icon: 'Zap',
  },
  {
    id: 'momentum_collision',
    title: '动量守恒碰撞',
    description: '调节两球质量和初速度，观察弹性/非弹性碰撞过程。',
    prompt: '请生成一个大学物理动量守恒碰撞交互实验：两个小球在水平面上碰撞，学生可以调节两球质量 m1、m2（0.5-5 kg）和初速度 v1、v2（-10~10 m/s），选择弹性碰撞或完全非弹性碰撞，观察碰撞前后动量和动能的变化。要求显示碰撞动画、动量矢量、动能对比和数值面板。',
    type: 'simulation',
    icon: 'ArrowLeftRight',
  },
  {
    id: 'shm',
    title: '简谐振动',
    description: '调节振幅、频率和阻尼，观察弹簧振子的运动和能量变化。',
    prompt: '请生成一个大学物理简谐振动交互实验：一个弹簧振子在水平面上振动，学生可以调节振幅 A（1-10 cm）、频率 f（0.5-5 Hz）和阻尼系数 b（0-0.5），观察位移-时间曲线、速度-时间曲线和能量变化。要求显示振动动画、波形图、相图和参数面板。',
    type: 'simulation',
    icon: 'Activity',
  },
];
