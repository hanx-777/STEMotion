export const RAG_VISUALIZATION_DESIGN_CONTEXT_MARKER = 'STEMOTION_RAG_VISUALIZATION_DESIGN_CONTEXT';

interface RagVisualizationDesignContextInput {
  medium: string;
  originalQuestion?: string;
  variables?: Array<{
    name?: string;
    label?: string;
    value?: string | number;
    unit?: string;
    role?: string;
  }>;
  visualObjects?: string[];
  controls?: string[];
  metrics?: string[];
  interactionIntent?: string;
}

export function buildRagVisualizationDesignContext(input: RagVisualizationDesignContextInput): string {
  return `${RAG_VISUALIZATION_DESIGN_CONTEXT_MARKER}:
- Design context first: design the ${input.medium} from the original STEMotion problem, not from a generic web-page pattern.
- STEMotion visual vocabulary: use a restrained STEMotion learning-tool style, compact controls, clear panels, readable labels, and stable ids/data-screen-label markers.
- First-screen stage-first: at 1366x768 and 1440x900, keep the main stage, core controls, and primary result visible above the fold; give the stage priority over narration.
- Problem-specific interaction: every slider, button, animation step, label, and metric must manipulate or reveal the original variables, objects, steps, or requested result.
- Anti-filler: no generic hero, decorative stats, placeholder icons, oversized title screens, marketing copy, or explanation-only pages that push the task below the fold.
- Supporting content discipline: put only necessary variables, formulas, citations, learning goals, and narration into one compact secondary panel or collapsible details.
- Iteration readiness: make high-level regions easy to review by adding data-screen-label and preserving #visualization, #controls, #metrics, widget-config, and message protocol hooks.
- Original question anchor: ${compactLine(input.originalQuestion)}
- Known variables: ${formatVariables(input.variables)}
- Planned visual objects: ${formatList(input.visualObjects)}
- Planned controls: ${formatList(input.controls)}
- Planned metrics: ${formatList(input.metrics)}
- Interaction intent: ${compactLine(input.interactionIntent)}`;
}

function compactLine(value?: string): string {
  const text = value?.replace(/\s+/g, ' ').trim();
  return text || 'derive from the original question and RAG answer; do not invent filler.';
}

function formatVariables(variables?: RagVisualizationDesignContextInput['variables']): string {
  if (!variables?.length) return 'derive from the original question; mark missing values as unknown.';
  return variables
    .slice(0, 8)
    .map((item) => {
      const label = item.label ?? item.name ?? 'variable';
      const value = item.value ?? 'unknown';
      return `${label}=${value}${item.unit ?? ''}${item.role ? ` (${item.role})` : ''}`;
    })
    .join('; ');
}

function formatList(items?: string[]): string {
  const compact = items?.map((item) => item.trim()).filter(Boolean).slice(0, 8) ?? [];
  return compact.length ? compact.join('; ') : 'derive from the original problem; keep only meaningful items.';
}
