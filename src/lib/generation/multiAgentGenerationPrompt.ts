export const MULTI_AGENT_GENERATION_PROMPT_MARKER = 'STEMOTION_INTERNAL_MULTI_AGENT_GENERATION_FLOW';


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
  return [
    'Internal roles to run in one pass (lightweight 5-agent, Round 002B):',
    '- Task Planner: identify task type, core goal, target user, output form (answer/artifact/answer_with_artifact), and whether a Specialist is needed.',
    '- Domain Modeler: extract variables, formulas/rules, key states, and edge cases for the domain (physics/math/algorithm/network/ML/chemistry/generic).',
    '- Visualization Mapper: map domain model to visual objects, state-to-visual encodings, animation steps, metrics/labels, and interaction model.',
    '- UI Builder: enforce layout contract — main stage >= 65%, side panel 25-35%, explanations collapsed, first-screen shows core visualization, no nested scroll, responsive fallback.',
    '- Quality Reviewer: check functional correctness, first-screen usability, main-stage visibility, control interactivity, runtime safety, and problem-specific accuracy. Do NOT simulate additional citation/evidence/safety/pedagogy/numerical serial reviewers.',
  ].join('\n');
}

function compactRoleLines(): string {
  return [
    'Internal roles to run in one pass:',
    '- Task Planner checks task type and outputs.',
    '- Domain Modeler checks variables and edge cases.',
    '- Visualization Mapper checks encodings and interaction model.',
    '- UI Builder checks main stage ratio and responsive behavior.',
    '- Quality Reviewer checks correctness and usability.',
  ].join('\n');
}
