/**
 * Round 002B — LightweightRagReviewer (Task 5)
 *
 * Consolidates all artifact quality signals into a single LightweightReview.
 * Replaces the default multi-reviewer chain for visualization artifacts.
 *
 * Reviewer only flags hard blockers:
 *   1. Contract / structural failures (runtime risk)
 *   2. Interaction doesn't affect visualization
 *   3. Safety issues
 *   4. Runtime failures
 *   5. UX / first-screen issues
 *   6. Pedagogy issues (non-blocking, niceToHave)
 *   7. Layout / first-screen from lightweight plan
 *   8. Legacy signals (optional, niceToHave only)
 */

import type { LightweightReview } from '@/shared/api/lightweightAgentPipeline';
import type {
  QualityReport,
  AgentEvaluation,
  AgentIssue,
} from '@/features/deep-interaction/lib/types';
import type { RagWidgetContractDiagnostic } from './widgetContract';
import type { ActiveInteractionDiagnostics } from './activeInteractionDiagnostics';
import type { RagLightweightVisualizationPlan } from './lightweight_rag_visualization_agents';

export interface LightweightRagReviewerInput {
  html?: string;
  qualityReport?: QualityReport | null;
  contractDiagnostic?: RagWidgetContractDiagnostic;
  activeInteractionDiagnostics?: ActiveInteractionDiagnostics;
  safetyEval?: AgentEvaluation;
  runtimeEval?: AgentEvaluation;
  pedagogyEval?: AgentEvaluation;
  uxEval?: AgentEvaluation;
  lightweightPlan?: RagLightweightVisualizationPlan;
}

/**
 * Run the unified LightweightReviewer over all available quality signals.
 * Returns a LightweightReview compatible with buildFinalQualityDecision().
 */
export function runLightweightRagReviewer(
  input: LightweightRagReviewerInput,
): LightweightReview {
  const mustFix: LightweightReview['mustFix'] = [];
  const niceToHave: string[] = [];

  // 1. Contract / structural failures → runtime risk
  if (input.contractDiagnostic && !input.contractDiagnostic.passed) {
    const missing = input.contractDiagnostic.missing;
    if (missing.length > 0) {
      const runtimeCritical = missing.some((m) =>
        ['doctype', 'closing html', 'message listener', 'requestAnimationFrame'].includes(m),
      );
      mustFix.push({
        area: 'runtime',
        severity: runtimeCritical ? 'critical' : 'high',
        problem: `Widget contract missing: ${missing.slice(0, 5).join(', ')}`,
        fix: `Ensure all required widget contract items are implemented: ${missing.slice(0, 5).join(', ')}`,
      });
    }
    for (const warning of input.contractDiagnostic.warnings.slice(0, 2)) {
      niceToHave.push(`Widget contract warning: ${warning}`);
    }
  }

  // 2. Active interaction failures → interaction doesn't affect visualization
  if (input.activeInteractionDiagnostics) {
    const diag = input.activeInteractionDiagnostics;
    if (!diag.passed) {
      const reason = diag.failureReason ?? 'No visible state changes detected when interacting with controls';
      mustFix.push({
        area: 'ux',
        severity: 'high',
        problem: `Active interaction failed: ${reason}`,
        fix: 'Ensure buttons/sliders trigger visible state changes in #visualization or #metrics.',
      });
    }
    for (const warning of diag.warnings.slice(0, 2)) {
      niceToHave.push(`Interaction warning: ${warning}`);
    }
  }

  // 3. Safety failures
  if (input.safetyEval) {
    const safetyIssues = collectBlockingIssues(input.safetyEval);
    for (const issue of safetyIssues.slice(0, 2)) {
      mustFix.push({
        area: 'safety',
        severity: mapSeverity(issue.severity),
        problem: issue.message || 'Safety check failed',
        fix: issue.suggestion || 'Remove unsafe code patterns (eval, network requests, storage APIs).',
      });
    }
  }

  // 4. Runtime failures
  if (input.runtimeEval) {
    const runtimeIssues = collectBlockingIssues(input.runtimeEval);
    for (const issue of runtimeIssues.slice(0, 2)) {
      mustFix.push({
        area: 'runtime',
        severity: mapSeverity(issue.severity),
        problem: issue.message || 'Runtime check failed',
        fix: issue.suggestion || 'Fix runtime errors and ensure the widget initializes correctly.',
      });
    }
  }

  // 5. UX / first-screen issues
  if (input.uxEval) {
    const uxIssues = collectBlockingIssues(input.uxEval);
    for (const issue of uxIssues.slice(0, 2)) {
      const isFirstScreenIssue = isFirstScreenOrMainStageIssue(issue.message);
      mustFix.push({
        area: 'ux',
        severity: isFirstScreenIssue ? 'high' : 'medium',
        problem: issue.message || 'UX check failed',
        fix: issue.suggestion || 'Ensure core visualization is visible above the fold; main stage >= 65% width.',
      });
    }
  }

  // 6. Pedagogy — non-blocking, only niceToHave
  if (input.pedagogyEval) {
    const pedagogyIssues = collectBlockingIssues(input.pedagogyEval);
    for (const issue of pedagogyIssues.slice(0, 3)) {
      niceToHave.push(`Pedagogy: ${issue.message || 'review pedagogy alignment'}`);
    }
    if (input.pedagogyEval.issues.length === 0 && input.pedagogyEval.score < 70) {
      niceToHave.push(`Pedagogy score low (${input.pedagogyEval.score}): ${input.pedagogyEval.summary}`);
    }
  }

  // 7. Layout plan: check #visualization presence
  if (input.html && input.html.length > 100) {
    const htmlLower = input.html.toLowerCase();
    const hasVisualization = htmlLower.includes('id="visualization"') || htmlLower.includes("id='visualization'");
    if (!hasVisualization) {
      mustFix.push({
        area: 'ui',
        severity: 'high',
        problem: 'Missing #visualization element — first-screen core content not identifiable.',
        fix: 'Add id="visualization" to the main canvas/SVG/stage container.',
      });
    }
  }


  // Compute final decision
  const hasCritical = mustFix.some((f) => f.severity === 'critical');
  const hasHigh = mustFix.some((f) => f.severity === 'high');
  const score = Math.max(0, 100 - mustFix.length * 15 - niceToHave.length * 2);

  let status: LightweightReview['status'];
  let finalDecision: LightweightReview['finalDecision'];

  if (hasCritical || mustFix.length >= 3) {
    status = 'fail';
    finalDecision = 'reject';
  } else if (hasHigh || mustFix.length > 0) {
    status = 'revise';
    finalDecision = 'revise_once';
  } else {
    status = 'pass';
    finalDecision = 'publish';
  }

  return {
    status,
    score: Math.round(score),
    mustFix,
    niceToHave,
    finalDecision,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function collectBlockingIssues(evaluation: AgentEvaluation): AgentIssue[] {
  if (!evaluation?.issues) return [];
  return evaluation.issues.filter((issue) => {
    const sev = (issue.severity ?? '').toLowerCase();
    return sev === 'critical' || sev === 'high';
  });
}

function mapSeverity(severity: string): 'critical' | 'high' | 'medium' {
  const s = severity?.toLowerCase() ?? '';
  if (s === 'critical') return 'critical';
  if (s === 'high' || s === 'error') return 'high';
  return 'medium';
}

function isFirstScreenOrMainStageIssue(text: string): boolean {
  return /(首屏|first.?screen|above.?fold|主内容|主舞台|main.?stage|不可见|看不见|not.?visible|unusable|不可用)/i.test(text);
}
