export const ARTIFACT_DESIGN_CONTRACT_MARKER = 'STEMOTION_ARTIFACT_DESIGN_CONTRACT';

export interface ArtifactDesignContractOptions {
  medium?: string;
  mainStage?: string;
  supportPanel?: string;
  supportingContent?: string;
}

export function artifactDesignContractPrompt(options: ArtifactDesignContractOptions = {}): string {
  const medium = options.medium ?? 'interactive artifact';
  const mainStage = options.mainStage ?? 'main visualization/work area';
  const supportPanel = options.supportPanel ?? 'right panels, sidebars, and supporting information';
  const supportingContent =
    options.supportingContent ?? 'questions, variables, learning goals, plans, citations, formulas, and long explanations';

  return `${ARTIFACT_DESIGN_CONTRACT_MARKER}:
- Output-shape awareness: design the ${medium} itself, not a generic landing page, slide, or explanation-only mockup.
- First-screen usability: fit 1366x768, 1440x900, and 1920x1080 with the ${mainStage}, core controls, and main result visible above the fold / first screen.
- Main-stage-first layout: give the ${mainStage} 65%-75% of desktop space; keep ${supportPanel} to 25%-35%.
- Responsive fallback: at narrow widths around 375px, stack or collapse secondary content without overlap or horizontal scrolling.
- Scroll discipline: avoid nested scroll containers; if scrolling is needed, keep it inside one secondary panel while the ${mainStage} remains stable.
- Compact meaningful controls: keep headers and controls tight, use clear labels, and preserve at least 44px hit targets for buttons, sliders, and primary controls.
- Visual hierarchy: use readable typography, spacing, contrast, stable dimensions, and clear grouping; avoid repeated titles, oversized cards, and excessive whitespace.
- Design-context reuse: preserve design context by reusing the subject, variables, formulas, widget-config, stable ids/data-role selectors, and existing STEMotion visual vocabulary instead of generic filler.
- Problem-specific interaction: controls, animation, labels, and metrics must manipulate or reveal the actual prompt variables, objects, steps, or requested result rather than acting as generic decoration.
- Stable screen labels: add data-screen-label to high-level screen, stage, panel, or slide-like regions so reviewers and user comments can identify the affected area.
- Anti-filler: avoid generic hero sections, decorative bloat, marketing copy, and AI-looking placeholder content.
- Splitter optionality: use a draggable splitter only when the structure truly needs it and the implementation is low-cost; otherwise provide a fixed responsive fallback.
- Accessibility basics: keep keyboard access, readable labels, visible states, and reduced-motion friendliness where practical.
- Supporting content placement: place ${supportingContent} in collapsible details, compact side panels, or one secondary scroll panel.`;
}
