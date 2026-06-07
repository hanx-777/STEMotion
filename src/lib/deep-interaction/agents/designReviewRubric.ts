import type { AgentIssue } from '../types';

export const DESIGN_REVIEW_RUBRIC_MARKER = 'STEMOTION_DESIGN_REVIEW_RUBRIC';
export const RAG_ANSWER_QUALITY_REVIEW_BOUNDARY =
  'RAG answer quality reviewers cover evidence, citation, formula, physics, pedagogy, and safety; artifact UI reviewers cover visual, interaction, and layout quality.';

const DESIGN_BLOCKER_PATTERNS = [
  /first[-\s]?screen|above the fold|首屏|1366x768|1440x900/i,
  /main[-\s]?stage|主舞台|主区域|stage.*small|舞台.*小/i,
  /sidebar|right panel|右栏|侧栏|说明区.*过重|信息区.*过重/i,
  /65%-75%|25%-35%|ratio|比例/i,
  /nested scroll|嵌套滚动|多重滚动/i,
  /mobile|responsive|375px|移动端|响应式|横向溢出|遮挡/i,
  /hit target|44px|触控目标|命中区域|控件.*过小/i,
  /filler|generic hero|placeholder|通用|占位|AI 味/i,
  /design context|visual vocabulary|设计上下文|视觉语汇/i,
  /problem-specific interaction|题目专属|原题互动|explanation-only|说明页/i,
  /STEMotion visual vocabulary|STEMotion 视觉/i,
  /data-screen-label|screen label|屏幕标记/i,
  /visual hierarchy|视觉层级|过度留白|拥挤|文字重叠/i,
] as const;

export function designReviewRubricPrompt(): string {
  return `${DESIGN_REVIEW_RUBRIC_MARKER}:
- First-screen usability: the core stage, primary controls, and main result must be visible at 1366x768 and 1440x900.
- Main-stage ratio: the main simulation/game/visualization stage should receive 65%-75% of desktop space; sidebars, notes, or right panels should stay around 25%-35%.
- Responsive behavior: at 375px mobile width, secondary content must stack/collapse without overlap, horizontal overflow, or hidden controls.
- Scroll discipline: avoid nested scroll regions; keep at most one secondary scroll panel while the main stage remains stable.
- Visual hierarchy and density: reduce repeated titles, oversized headers, excessive whitespace, cramped text, and unclear grouping.
- Design context reuse: check whether the artifact follows existing STEMotion visual vocabulary instead of inventing a disconnected visual system.
- Problem-specific interaction: reject artifacts where controls, animation, labels, or metrics do not directly manipulate or reveal the original problem variables, objects, steps, or requested result.
- Stable screen labels: high-level stage, panel, screen, or slide-like regions should include data-screen-label so feedback can target the right area.
- Interaction quality: controls need visible states, immediate feedback, keyboard/touch usability, and roughly 44px hit targets.
- Anti-filler: reject generic hero sections, decorative placeholder content, and explanation-heavy pages that push the interactive task below the fold.
- Specificity requirement: every design issue must name the affected location or selector, user impact, severity/priority, and a concrete HTML/CSS/JS fix. Do not write only "layout can be improved".`;
}

export function designRepairPrompt(): string {
  return `${DESIGN_REVIEW_RUBRIC_MARKER}_REPAIR:
- Convert design-review issues into actual HTML/CSS/JS changes, not prose-only advice.
- Preserve widget-config, message protocol, safety/runtime constraints, subject content, variables, formulas, and core interactions.
- Preserve or add data-screen-label on high-level screen regions and keep the existing STEMotion visual vocabulary recognizable.
- Preserve problem-specific interaction: controls, animation, labels, and metrics must remain tied to the original question and not become generic explanation content.
- For each design issue, apply the stated location/selector, user impact, priority, and concrete fix.
- Serious first-screen failure, undersized main stage, overweight sidebar, nested scrolling, responsive/mobile occlusion, tiny 44px hit targets, weak visual hierarchy, or filler content must be repaired in the HTML before acceptance.
- Preserve the 65%-75% main-stage and 25%-35% supporting-panel intent when desktop space allows.
- Prefer compact structural fixes: reduce header height, collapse long explanations into details, use a stable 70/30 or 72/28 grid, keep one secondary scroll panel, and ensure controls stay reachable.`;
}

export function followUpDesignProtectionPrompt(): string {
  return `${DESIGN_REVIEW_RUBRIC_MARKER}_FOLLOW_UP:
- Follow-up edits must preserve first-screen usability, main-stage priority, responsive behavior, scroll discipline, visual hierarchy, accessible controls, and anti-filler constraints.
- Follow-up edits must preserve existing STEMotion visual vocabulary, design context, and data-screen-label markers on high-level regions.
- Follow-up edits must preserve problem-specific interaction: do not replace the original task with a generic explainer, decorative layout, or unrelated example.
- Preserve the 65%-75% main-stage and 25%-35% supporting-panel intent when desktop space allows.
- If the user asks to add long explanations or extra panels, keep them compact, collapsible, or inside one secondary scroll area so the core interaction remains visible.
- If a requested change creates design risk, keep fixes concrete by preserving the affected location/selector, user impact, priority, and specific HTML/CSS/JS adjustment.
- Do not let a requested style/content change make the stage smaller than the supporting content, introduce nested scrolling, hide 44px controls on mobile, or replace the task-specific widget with a generic explanation page.`;
}

export function isHtmlDesignIssue(issue: AgentIssue): boolean {
  const htmlTarget = issue.target === undefined || issue.target === 'html' || issue.target === 'all';
  return htmlTarget && (issue.category === 'ux' || issue.category === 'accessibility');
}

export function isDesignQualityBlocker(issue: AgentIssue): boolean {
  if (!isHtmlDesignIssue(issue)) return false;
  if (issue.severity === 'critical' || issue.severity === 'high') return true;

  const text = `${issue.message}\n${issue.evidence ?? ''}\n${issue.suggestion}`;
  return DESIGN_BLOCKER_PATTERNS.some((pattern) => pattern.test(text));
}

export function collectDesignQualityBlockers(issues: AgentIssue[]): AgentIssue[] {
  return issues.filter(isDesignQualityBlocker);
}

export function buildDesignRepairInstruction(issues: AgentIssue[], fallbackSummary?: string): string {
  const designIssues = issues.filter(isHtmlDesignIssue);
  const issueLines = designIssues.slice(0, 8).map(formatDesignIssueForRepair);
  const issueSummary = issueLines.length > 0
    ? issueLines.join('\n')
    : `- ${fallbackSummary ?? 'Design-quality score is below the acceptance threshold; inspect the HTML against the shared rubric.'}`;

  return [
    `${DESIGN_REVIEW_RUBRIC_MARKER}_INSTRUCTION`,
    'Design-quality repair is required for the HTML.',
    'Keep safety/runtime/widget contracts unchanged while making concrete layout, interaction, and accessibility fixes.',
    'Required checks: first screen, 65%-75% main-stage ratio, sidebar weight, responsive/mobile behavior, nested scrolling, visual hierarchy, control density, 44px hit targets, interaction feedback, anti-filler, problem-specific interaction, and accessibility basics.',
    'Also check design context reuse, existing STEMotion visual vocabulary, and data-screen-label coverage for high-level regions.',
    'Each fix must name or modify the affected selector/region, reduce the stated user impact, and keep the core educational interaction visible.',
    'Issue-specific repair targets:',
    issueSummary,
  ].join('\n');
}

function formatDesignIssueForRepair(issue: AgentIssue): string {
  const evidence = issue.evidence ? ` Evidence: ${issue.evidence}` : '';
  return `- [${issue.severity}] target=${issue.target ?? 'html'} message=${issue.message}${evidence} Fix: ${issue.suggestion}`;
}
