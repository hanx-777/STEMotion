import type {
  AnswerSection,
  Citation,
  RagAnswerProtocol,
  RagEvidencePack,
  RagFormulaBlock,
  RagQualityCheck,
  RagQualityReport,
  RagRetrievalReport,
  RagTaskType,
  VisualizationHint,
} from './types';
import { extractLatexFormulas, findBareLatexArtifacts, validateLatexFormula } from './math_render';
import { reviewFinalPresentation } from './presentation_review';

const NO_EVIDENCE_NOTICE = '当前知识库和网络检索中未找到可靠依据';

interface RagReviewInput {
  question: string;
  taskType: RagTaskType;
  answer: string;
  answerSections: AnswerSection[];
  citations: Citation[];
  visualizationHint?: VisualizationHint;
  formulaBlocks?: RagFormulaBlock[];
  answerProtocol?: RagAnswerProtocol;
  retrievalReport?: RagRetrievalReport;
  evidencePack?: RagEvidencePack;
}

export function reviewRagAnswer(input: RagReviewInput): RagQualityReport {
  const presentationReview = reviewFinalPresentation({
    answer: input.answer,
    answerSections: input.answerSections,
    formulaBlocks: input.formulaBlocks,
    citations: input.citations,
    noEvidenceRequired: input.citations.length === 0 || Boolean(input.retrievalReport?.low_evidence),
  });
  const checks = [
    citationConsistencyReviewer(input),
    evidenceSufficiencyReviewer(input),
    noEvidenceReviewer(input),
    structureCompletenessReviewer(input),
    formulaRenderabilityReviewer(input),
    physicsAnswerReviewer(input),
    presentationReview.check,
  ];

  const score = scoreChecks(checks);
  return {
    passed: checks.every((check) => check.severity !== 'error' && check.severity !== 'critical'),
    score,
    checks,
    agent_reviews: [presentationReview.agentReview],
  };
}

function citationConsistencyReviewer(input: RagReviewInput): RagQualityCheck {
  const text = answerText(input.answer, input.answerSections);
  const localCount = input.citations.filter((citation) => citation.source_type === 'local').length;
  const webCount = input.citations.filter((citation) => citation.source_type === 'web').length;
  const missingRefs = findCitationRefs(text).filter((ref) => (
    ref.type === 'L' ? ref.index > localCount : ref.index > webCount
  ));

  if (missingRefs.length > 0) {
    return {
      name: '引用一致性',
      passed: false,
      severity: 'error',
      message: `回答中存在未提供的引用标记：${missingRefs.map((ref) => `[${ref.type}${ref.index}]`).join('、')}`,
    };
  }

  if (input.citations.length === 0 && findCitationRefs(text).length > 0) {
    return {
      name: '引用一致性',
      passed: false,
      severity: 'error',
      message: '当前没有可靠来源，但回答中出现了 citation 标记。',
    };
  }

  return {
    name: '引用一致性',
    passed: true,
    severity: 'info',
    message: `已核对 ${input.citations.length} 条 citation，未发现越界引用。`,
  };
}

function evidenceSufficiencyReviewer(input: RagReviewInput): RagQualityCheck {
  const report = input.retrievalReport;
  const noEvidence = input.citations.length === 0;
  if (report?.low_evidence || noEvidence) {
    const hasNotice = answerText(input.answer, input.answerSections).includes(NO_EVIDENCE_NOTICE);
    return {
      name: '证据充分性',
      passed: hasNotice,
      severity: hasNotice ? 'info' : 'warning',
      message: hasNotice
        ? '回答已明确提示依据不足或证据不足。'
        : '当前检索证据较弱，建议在答案中明确提示依据不足。',
    };
  }

  return {
    name: '证据充分性',
    passed: true,
    severity: 'info',
    message: '当前回答具备可用的本地或网络依据。',
  };
}

function noEvidenceReviewer(input: RagReviewInput): RagQualityCheck {
  if (input.citations.length > 0) {
    return {
      name: '依据不足提示',
      passed: true,
      severity: 'info',
      message: '当前回答包含可追溯来源。',
    };
  }

  const hasNotice = answerText(input.answer, input.answerSections).includes(NO_EVIDENCE_NOTICE);
  return {
    name: '依据不足提示',
    passed: hasNotice,
    severity: hasNotice ? 'info' : 'warning',
    message: hasNotice
      ? '无可靠来源时已提示依据不足。'
      : '当前没有 citation，建议在回答中明确提示“当前知识库和网络检索中未找到可靠依据”。',
  };
}

function structureCompletenessReviewer(input: RagReviewInput): RagQualityCheck {
  const required = requiredSectionIds(input.taskType);
  const sectionIds = new Set(input.answerSections.map((section) => section.id));
  const missing = required.filter((id) => !sectionIds.has(id));

  return {
    name: '结构完整性',
    passed: missing.length === 0,
    severity: missing.length === 0 ? 'info' : 'warning',
    message: missing.length === 0
      ? '当前任务类型所需教学区块齐全。'
      : `缺少教学区块：${missing.join('、')}`,
  };
}

function formulaRenderabilityReviewer(input: RagReviewInput): RagQualityCheck {
  const text = answerText(input.answer, input.answerSections);
  const formulas = input.formulaBlocks?.length
    ? input.formulaBlocks.map((block) => ({ raw: block.latex, latex: block.latex, displayMode: true, start: 0, end: block.latex.length }))
    : extractLatexFormulas(text);
  const invalid = formulas
    .map((formula) => ({ formula, result: validateLatexFormula(formula) }))
    .filter((item) => !item.result.ok);
  const bareArtifacts = findBareLatexArtifacts(text);
  const isFormulaExpected = input.taskType === 'step_solution'
    || input.taskType === 'misconception_diagnosis'
    || /公式|推导|计算|斜抛|projectile/i.test(input.question);
  const missingProjectile = isProjectileQuestion(input)
    ? missingProjectileFormulaParts(text)
    : [];

  if (invalid.length > 0) {
    return {
      name: '公式渲染性',
      passed: false,
      severity: 'error',
      message: `发现 ${invalid.length} 个不可渲染公式，请检查 LaTeX 语法。`,
    };
  }

  if (bareArtifacts.length > 0) {
    return {
      name: '公式渲染性',
      passed: false,
      severity: 'warning',
      message: `发现裸露 LaTeX 痕迹：${bareArtifacts.slice(0, 4).join('、')}。建议使用公式块渲染。`,
    };
  }

  if (missingProjectile.length > 0) {
    return {
      name: '公式渲染性',
      passed: false,
      severity: 'warning',
      message: `斜抛回答建议补充关键公式：${missingProjectile.join('、')}`,
    };
  }

  if (formulas.length === 0 && isFormulaExpected) {
    return {
      name: '公式渲染性',
      passed: false,
      severity: 'warning',
      message: '该任务通常需要公式，但当前回答未识别到可渲染公式。',
    };
  }

  return {
    name: '公式渲染性',
    passed: true,
    severity: 'info',
    message: formulas.length > 0 ? `已识别 ${formulas.length} 个可渲染公式。` : '当前回答未包含需要渲染的公式。',
  };
}

function physicsAnswerReviewer(input: RagReviewInput): RagQualityCheck {
  const text = answerText(input.answer, input.answerSections);
  const isProjectile = isProjectileQuestion(input);
  if (!isProjectile) {
    return {
      name: '物理推导',
      passed: true,
      severity: 'info',
      message: '当前问题未识别为斜抛运动，跳过专项物理推导检查。',
    };
  }

  const missing: string[] = [];
  if (!input.visualizationHint) missing.push('visualization_hint');
  if (!/(分解|v0y|v₀y|sin|竖直分速度|水平分速度)/i.test(text)) missing.push('速度分解');
  if (!/(单位|m\/s|m\/s²|米每秒|m\/s\^2)/i.test(text)) missing.push('单位说明');

  return {
    name: '物理推导',
    passed: missing.length === 0,
    severity: missing.length === 0 ? 'info' : 'warning',
    message: missing.length === 0
      ? '斜抛问题已包含可视化提示、速度分解和单位检查。'
      : `斜抛问题建议补充：${missing.join('、')}`,
  };
}

function requiredSectionIds(taskType: RagTaskType): string[] {
  if (taskType === 'knowledge_qa') return ['concept', 'evidence', 'study_hint', 'citations'];
  if (taskType === 'misconception_diagnosis') return ['misconception', 'cause', 'correction', 'practice', 'citations'];
  if (taskType === 'teacher_prep') return ['objectives', 'intro', 'blackboard', 'questions', 'visualization', 'citations'];
  return ['extract', 'model', 'derivation', 'result', 'pitfalls', 'citations'];
}

function findCitationRefs(text: string): Array<{ type: 'L' | 'W'; index: number }> {
  return [...text.matchAll(/\[([LW])(\d+)\]/g)].map((match) => ({
    type: match[1] as 'L' | 'W',
    index: Number(match[2]),
  }));
}

function answerText(answer: string, sections: AnswerSection[]): string {
  return `${answer}\n${sections.map((section) => `${section.title}\n${section.content}`).join('\n')}`;
}

function scoreChecks(checks: RagQualityCheck[]): number {
  const penalty = checks.reduce((total, check) => {
    if (check.severity === 'critical') return total + 45;
    if (check.severity === 'error') return total + 30;
    if (check.severity === 'warning') return total + 12;
    return total;
  }, 0);
  return Math.max(0, 100 - penalty);
}

function isProjectileQuestion(input: RagReviewInput): boolean {
  return /斜抛|抛体|projectile/i.test(input.question) || input.visualizationHint?.type === 'projectile_motion';
}

function missingProjectileFormulaParts(text: string): string[] {
  const compact = text.replace(/\s+/g, '').replace(/\\left|\\right/g, '').toLowerCase();
  const missing: string[] = [];
  const hasVelocityDecomposition = /(v0y|v_0y|v_{0y}|sinθ|sin\\theta|竖直分速度)/i.test(compact);
  const hasHeight = /(h|最大高度).{0,60}(2g|2\\?g|2\*g)/i.test(compact);
  const hasRange = /(r|射程|水平射程).{0,90}(sin2|sin\(2|2\\theta|2θ|v0x|v_0x)/i.test(compact);

  if (!hasVelocityDecomposition) missing.push('速度分解');
  if (!hasHeight) missing.push('最大高度公式');
  if (!hasRange) missing.push('水平射程公式');
  return missing;
}
