import type { VisualizationType } from './types';

export interface DetectionPattern {
  type: VisualizationType;
  keywords: RegExp[];
  minConfidence: number;
}

export const DETECTION_PATTERNS: DetectionPattern[] = [
  {
    type: 'function_graph',
    keywords: [
      /函数图像|函数图形|画出.*函数|绘制.*图像/i,
      /单调性|极值|拐点|凹凸性|零点/i,
      /f\(x\)\s*=/i,
      /求导|导数.*符号|f'\(x\)/i,
      /积分面积|曲线.*交点/i,
    ],
    minConfidence: 0.4,
  },
  {
    type: 'force_diagram',
    keywords: [
      /受力|力的分解|力的合成|力的分析/i,
      /牛顿第二定律|摩擦力|支持力|重力.*分力/i,
      /斜面|incline/i,
      /F\s*=\s*ma|合力|平衡力|法向力|切向力|张力/i,
    ],
    minConfidence: 0.3,
  },
  {
    type: 'algorithm_trace',
    keywords: [
      /栈|队列|链表|二叉树|堆|图.*遍历/i,
      /DFS|BFS|深度优先|广度优先/i,
      /单调栈|单调队列|滑动窗口/i,
      /排序过程|快速排序|归并排序|堆排序/i,
      /动态规划|状态转移|最短路径/i,
      /表达式求值|括号匹配/i,
    ],
    minConfidence: 0.15,
  },
  {
    type: 'projectile_motion',
    keywords: [
      /斜抛|抛体|平抛|projectile/i,
      /初速度.*角度|角度.*初速度/i,
      /抛射角|射程|最大高度/i,
    ],
    minConfidence: 0.5,
  },
];
