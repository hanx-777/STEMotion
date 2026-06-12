export const MULTI_AGENT_GENERATION_PROMPT_MARKER = 'STEMOTION_INTERNAL_MULTI_AGENT_GENERATION_FLOW';

/**
 * Round 002B: Legacy flag.
 * When true, detailedRoleLines() expands to the full 8-agent role set (pre-002B behaviour).
 * Controlled by env STEMOTION_RAG_AGENT_PIPELINE=legacy.
 */
export function isLegacyAgentPipeline(): boolean {
  return process.env.STEMOTION_RAG_AGENT_PIPELINE === 'legacy';
}

export type MultiAgentGenerationMode =
  | 'answer'
  | 'artifact'
  | 'planning'
  | 'refine'
  | 'repair'
  | 'reviewer';

export interface InternalMultiAgentPlanningPromptInput {
  mode: MultiAgentGenerationMode;
  artifactKind: string;
  outputInstruction?: string;
  compact?: boolean;
}

export function buildInternalMultiAgentPlanningPrompt(input: InternalMultiAgentPlanningPromptInput): string {
  const roleLines = input.compact
    ? compactRoleLines()
    : detailedRoleLines();
  return [
    `## ${MULTI_AGENT_GENERATION_PROMPT_MARKER}`,
    'Internal agent plan / 内部 Agent 规划.',
    `Use this as internal planning only for ${input.artifactKind}. Do not output the internal planning, agent notes, hidden analysis, or chain-of-thought / 思维链.`,
    modeInstruction(input.mode),
    roleLines,
    input.outputInstruction ? `Output shape reminder: ${input.outputInstruction}` : undefined,
  ].filter(Boolean).join('\n\n');
}

function modeInstruction(mode: MultiAgentGenerationMode): string {
  if (mode === 'answer') {
    return 'Mode: answer. Preserve the existing JSON answer protocol; use the agents only to improve correctness, grounding, structure, and learner-facing wording.';
  }
  if (mode === 'artifact') {
    return 'Mode: artifact. Optimize for a single-pass high-resource generation and return HTML only / 完整 HTML only when the surrounding prompt asks for HTML.';
  }
  if (mode === 'planning') {
    return 'Mode: planning. Return only the requested planning JSON shape; do not expose the agent-by-agent notes.';
  }
  if (mode === 'refine') {
    return 'Mode: refine. Preserve the existing artifact behavior while applying the requested change; return only the requested final artifact.';
  }
  if (mode === 'repair') {
    return 'Mode: repair. Fix only the reported defects, preserve working behavior, and return only the requested replacement artifact or JSON.';
  }
  return 'Mode: reviewer. Return only review JSON / 纯 JSON with concrete issues, severity, evidence, and fixes; do not output planning notes.';
}

function detailedRoleLines(): string {
  // Round 002B: Default is lightweight 5-agent roles.
  // Legacy 8-agent roles are preserved below and activated via STEMOTION_RAG_AGENT_PIPELINE=legacy.
  if (isLegacyAgentPipeline()) {
    return legacyDetailedRoleLines();
  }
  return [
    'Internal roles to run in one pass (lightweight 5-agent, Round 002B):',
    '- Task Planner: identify task type, core goal, target user, output form (answer/artifact/answer_with_artifact), and whether a Specialist is needed.',
    '- Domain Modeler: extract variables, formulas/rules, key states, and edge cases for the domain (physics/math/algorithm/network/ML/chemistry/generic).',
    '- Visualization Mapper: map domain model to visual objects, state-to-visual encodings, animation steps, metrics/labels, and interaction model.',
    '- UI Builder: enforce layout contract — main stage >= 65%, side panel 25-35%, explanations collapsed, first-screen shows core visualization, no nested scroll, responsive fallback.',
    '- Quality Reviewer: check functional correctness, first-screen usability, main-stage visibility, control interactivity, runtime safety, and problem-specific accuracy. Do NOT simulate additional citation/evidence/safety/pedagogy/numerical serial reviewers.',
  ].join('\n');
}

function legacyDetailedRoleLines(): string {
  // Pre-002B 8-agent role set — activated only when STEMOTION_RAG_AGENT_PIPELINE=legacy.
  return [
    'Internal roles to run in one pass:',
    '- Orchestrator: coordinate the task; decompose it into core analysis, architecture, logic, visualization, UI, content, implementation, and review before final output.',
    '- Core Analysis Agent: identify task type, key entities, inputs, outputs, state changes, constraints, boundary cases, and risks.',
    '- Architecture Agent: choose the app/page/content shape, primary user flow, main area, support panels, tabs/details, and first-screen priorities.',
    '- Logic Agent: design data structures, algorithm flow, state model, edge cases, diagnostics, and per-step snapshots when useful.',
    '- Visualization / Interaction Agent: decide visual targets, controls, step tracking, highlights, feedback, error states, and main-stage visibility.',
    '- UI Design Agent: design wireframe, main-stage ratio, compact controls, responsive behavior, visual hierarchy, hit targets, and scroll discipline.',
    '- Content / Localization Agent: unify language, terminology, UI copy, helper text, educational explanation, and concise professional wording.',
    '- Implementation Agent: produce runnable, maintainable final code/content with no unnecessary dependencies or pseudo-code.',
    '- Reviewer / Critic Agent: internally check functional correctness, code quality, UI/UX, visualization quality, responsiveness, first-screen usability, control density, nested scrolling, and maintainability.',
  ].join('\n');
}

function compactRoleLines(): string {
  if (isLegacyAgentPipeline()) {
    return [
      'Internal roles to run in one pass:',
      '- Orchestrator coordinates the internal pass.',
      '- Core Analysis Agent checks entities, inputs, outputs, state changes, constraints, and risks.',
      '- Architecture Agent checks shape, screen structure, primary flow, and support panels.',
      '- Logic Agent checks state model, algorithm flow, edge cases, and diagnostics.',
      '- Visualization / Interaction Agent checks controls, visible feedback, highlights, and error states.',
      '- UI Design Agent checks layout, responsiveness, hierarchy, controls, hit targets, and scroll discipline.',
      '- Content / Localization Agent checks language, terminology, labels, and concise educational wording.',
      '- Implementation Agent produces the final runnable artifact.',
      '- Reviewer / Critic Agent checks correctness, code quality, UI/UX, visualization quality, responsiveness, control density, scroll behavior, and maintainability.',
    ].join('\n');
  }
  return [
    'Internal roles to run in one pass (lightweight 5-agent):',
    '- Task Planner: task type, core goal, output form, specialist need.',
    '- Domain Modeler: variables, formulas, states, edge cases.',
    '- Visualization Mapper: visual objects, state-to-visual encodings, animation, metrics, interaction.',
    '- UI Builder: main stage >= 65%, side panel 25-35%, first-screen, no nested scroll, responsive.',
    '- Quality Reviewer: correctness, first-screen, interactivity, runtime safety.',
  ].join('\n');
}
