import { resolveCitationRef } from './citation_refs';
import { parseMarkdownLite, type MarkdownInlineToken, type MarkdownLiteBlock } from './markdown_lite';
import {
  extractLatexFormulas,
  findBareLatexArtifacts,
  validateLatexFormula,
} from './math_render';
import type {
  AnswerSection,
  Citation,
  RagAgentIssue,
  RagAgentReview,
  RagFormulaBlock,
  RagQualityCheck,
} from './types';

const NO_EVIDENCE_NOTICE = '当前知识库和网络检索中未找到可靠依据';

export interface PresentationReviewInput {
  answer: string;
  answerSections: AnswerSection[];
  formulaBlocks?: RagFormulaBlock[];
  citations: Citation[];
  noEvidenceRequired?: boolean;
}

export interface PresentationReviewResult {
  check: RagQualityCheck;
  agentReview: RagAgentReview;
}

export function reviewFinalPresentation(input: PresentationReviewInput): PresentationReviewResult {
  const issues = [
    ...reviewFormulaPresentation(input),
    ...reviewMarkdownPresentation(input.answerSections),
    ...reviewCitationPresentation(input),
    ...reviewNoEvidenceNotice(input),
  ];
  const highestSeverity = issues.some((issue) => issue.severity === 'critical')
    ? 'critical'
    : issues.some((issue) => issue.severity === 'error')
      ? 'error'
      : issues.some((issue) => issue.severity === 'warning')
        ? 'warning'
        : 'info';
  const passed = issues.length === 0;
  const score = passed ? 100 : highestSeverity === 'error' || highestSeverity === 'critical' ? 60 : 82;
  const message = passed
    ? '最终回答的公式、Markdown 与 citation chip 均可被页面安全呈现。'
    : issues.map((issue) => issue.message).slice(0, 3).join('；');

  return {
    check: {
      name: '最终呈现质量',
      passed,
      severity: highestSeverity,
      message,
    },
    agentReview: {
      agent_name: 'PresentationReviewer',
      score,
      passed,
      summary: passed ? '最终呈现检查通过。' : `发现 ${issues.length} 个最终呈现风险。`,
      issues,
    },
  };
}

function reviewFormulaPresentation(input: PresentationReviewInput): RagAgentIssue[] {
  const text = combinedAnswerText(input.answer, input.answerSections);
  const formulas = [
    ...extractLatexFormulas(text),
    ...(input.formulaBlocks ?? []).map((block) => ({
      raw: block.latex,
      latex: block.latex,
      displayMode: true,
      start: 0,
      end: block.latex.length,
    })),
  ];
  const invalid = formulas
    .map((formula) => ({ formula, result: validateLatexFormula(formula) }))
    .filter((item) => !item.result.ok);
  const bareArtifacts = findBareLatexArtifacts(text);
  const issues: RagAgentIssue[] = [];

  if (invalid.length > 0) {
    issues.push({
      severity: 'error',
      message: `存在 ${invalid.length} 个 KaTeX 无法渲染的公式。`,
      suggestion: '改用标准 LaTeX，并将独立公式放入公式块。',
    });
  }

  if (bareArtifacts.length > 0) {
    issues.push({
      severity: 'error',
      message: `页面可能裸露 LaTeX 痕迹：${bareArtifacts.slice(0, 4).join('、')}。`,
      suggestion: '用 \\( ... \\) 或 \\[ ... \\] 包裹公式，或写入 formula_blocks。',
    });
  }

  return issues;
}

function reviewMarkdownPresentation(sections: AnswerSection[]): RagAgentIssue[] {
  const leaked = new Set<string>();
  for (const section of sections) {
    const blocks = parseMarkdownLite(section.content, section.title);
    for (const token of collectTextTokens(blocks)) {
      if (/\*\*|__|`{3,}|^#{1,6}\s/m.test(token.text)) {
        leaked.add(section.title);
      }
    }
  }

  return [...leaked].map((sectionTitle) => ({
    severity: 'error',
    message: `“${sectionTitle}”区块仍可能露出未解析 Markdown 标记。`,
    suggestion: '修正未闭合的加粗、代码块或标题标记。',
  }));
}

function reviewCitationPresentation(input: PresentationReviewInput): RagAgentIssue[] {
  const text = combinedAnswerText(input.answer, input.answerSections);
  const refs = [...new Set([...text.matchAll(/\[([LW])\d+\]/g)].map((match) => match[0]))];
  const unresolved = refs.filter((ref) => !resolveCitationRef(ref, input.citations)?.resolved);
  if (unresolved.length === 0) return [];

  return [{
    severity: 'error',
    message: `存在无法跳转到来源台账的引用标记：${unresolved.join('、')}。`,
    suggestion: '删除不存在的引用，或绑定到已锁定的 citations。',
  }];
}

function reviewNoEvidenceNotice(input: PresentationReviewInput): RagAgentIssue[] {
  const required = input.noEvidenceRequired ?? input.citations.length === 0;
  if (!required || combinedAnswerText(input.answer, input.answerSections).includes(NO_EVIDENCE_NOTICE)) return [];

  return [{
    severity: 'error',
    message: `无可靠 citation 时必须保留“${NO_EVIDENCE_NOTICE}”提示。`,
    suggestion: '在回答开头或结尾加入依据不足提示，并保持 citations 为空。',
  }];
}

function collectTextTokens(blocks: MarkdownLiteBlock[]): Array<Extract<MarkdownInlineToken, { type: 'text' }>> {
  const tokens: Array<Extract<MarkdownInlineToken, { type: 'text' }>> = [];
  for (const block of blocks) {
    if (block.type === 'math_block') continue;
    if (block.type === 'list') {
      for (const item of block.items) {
        tokens.push(...item.filter((token): token is Extract<MarkdownInlineToken, { type: 'text' }> => token.type === 'text'));
      }
      continue;
    }
    tokens.push(...block.tokens.filter((token): token is Extract<MarkdownInlineToken, { type: 'text' }> => token.type === 'text'));
  }
  return tokens;
}

function combinedAnswerText(answer: string, sections: AnswerSection[]): string {
  return `${answer}\n${sections.map((section) => `${section.title}\n${section.content}`).join('\n')}`;
}
