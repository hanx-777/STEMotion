import type { ProgressStage } from './progressTypes';

export function createRagStages(): ProgressStage[] {
  return [
    { id: 'parse', title: '解析问题', description: '识别学科、任务类型和关键信息', status: 'idle' },
    { id: 'retrieve_local', title: '检索本地课程资料', description: '从知识库中查找相关片段', status: 'idle' },
    { id: 'retrieve_web', title: '网络补充检索', description: '本地资料不足时补充公开资料', status: 'idle' },
    { id: 'generate', title: '生成结构化回答', description: '根据任务类型组织回答', status: 'idle' },
    { id: 'citations', title: '整理引用来源', description: '区分本地课程资料和网络补充资料', status: 'idle' },
    { id: 'visualization', title: '生成可视化提示', description: '识别是否可以生成运动轨迹或参数卡片', status: 'idle' },
  ];
}

export function createDeepInteractionStages(): ProgressStage[] {
  return [
    { id: 'session', title: '创建生成会话', description: '初始化交互实验生成环境', status: 'idle' },
    { id: 'planning', title: '分析教学需求', description: '理解学习目标和交互方式', status: 'idle' },
    { id: 'blueprint', title: '生成教学蓝图', description: '建立 LearningBlueprint', status: 'idle' },
    { id: 'validation', title: '校验学科约束', description: '检查知识约束和学科规范', status: 'idle' },
    { id: 'template', title: '匹配可信模板', description: '查找已验证的交互模板', status: 'idle' },
    { id: 'generation', title: '生成交互实验', description: '构建 HTML/SVG/Canvas 交互组件', status: 'idle' },
    { id: 'quality', title: '质量检查', description: '运行多 Agent 质量评审', status: 'idle' },
    { id: 'repair', title: '自动修复', description: '根据评审结果修复问题', status: 'idle' },
    { id: 'complete', title: '生成完成', description: '交互实验已就绪', status: 'idle' },
  ];
}
