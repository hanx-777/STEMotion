import type { InteractionAction } from './actions/actionTypes';
import type {
  RagVisualizationBrief,
  RagVisualizationGenerationPlan,
  VisualizationSpec,
} from '@/features/rag/lib/visualization/types';

export type DeepInteractionType = '3d_visualization' | 'simulation' | 'game' | 'mind_map' | 'rag_visualization';

export type InteractionSubject = 'math' | 'physics' | 'chemistry' | 'biology' | 'general';

export type InteractionGradeLevel = 'primary' | 'middle_school' | 'high_school';

export type SubjectDomain =
  | 'math'
  | 'physics'
  | 'chemistry'
  | 'biology'
  | 'earth_science'
  | 'computer_science'
  | 'engineering'
  | 'other';

export type BloomLevel = 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';

export type ScaffoldingLevel = 'guided' | 'open' | 'inquiry';

export type VariableRole = 'independent' | 'dependent' | 'controlled';

export interface LearningVariable {
  name: string;
  symbol: string;
  unit?: string;
  role: VariableRole;
  range?: [number, number];
  defaultValue?: number | string;
  description?: string;
}

export interface KnowledgeConstraint {
  id: string;
  description: string;
  formula?: string;
  mustBeTrue: string;
  severity: 'must' | 'should';
  checkType: 'conceptual' | 'formula' | 'unit' | 'sequence' | 'variable' | 'visual';
}

export interface LearningBlueprint {
  id: string;
  topic: string;
  originalPrompt: string;
  subjectDomain: SubjectDomain;
  interactionType: DeepInteractionType;
  gradeRange: [number, number];
  bloomLevel: BloomLevel;
  scaffoldingLevel: ScaffoldingLevel;
  coreVariables: LearningVariable[];
  expectedInsight: string;
  learningObjectives: string[];
  prerequisites: string[];
  knowledgeConstraints: KnowledgeConstraint[];
  suggestedVisualStructure?: string;
  estimatedDurationMinutes: number;
  createdAt: string;
}

export interface SchemaValidationSummary {
  passed: boolean;
  schemaKey?: string;
  violations: string[];
  warnings: string[];
}

export type InteractionSessionStatus =
  | 'idle'
  | 'planning'
  | 'selecting_type'
  | 'generating_outline'
  | 'generating_schema'
  | 'building_interaction'
  | 'validating'
  | 'ready'
  | 'failed';

export interface SessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  relatedArtifactId?: string;
}

export interface InteractionSession {
  id: string;
  title: string;
  topic: string;
  subject: InteractionSubject;
  gradeLevel: InteractionGradeLevel;
  mode: 'standard' | 'deep_interaction';
  interactionType: DeepInteractionType;
  status: InteractionSessionStatus;
  progress: number;
  messages: SessionMessage[];
  artifacts: InteractionArtifact[];
  currentArtifactId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InteractionArtifact {
  id: string;
  sessionId: string;
  type: DeepInteractionType;
  title: string;
  description: string;
  schema: InteractionSchema;
  status: 'draft' | 'validating' | 'ready' | 'error';
  version: number;
  createdAt: string;
  updatedAt: string;
  feedbackLoop?: FeedbackLoopResult;
  qualityReport?: QualityReport;
  finalScore?: number;
  generationIterations?: number;
  changeLog?: string[];
  blueprint?: LearningBlueprint;
  templateMetadata?: TemplateMetadata;
  planningMetadata?: PlanningMetadata;
}

export type ArtifactGenerationMode = 'template_customized' | 'template_fallback_original' | 'free_generation';

export interface AppliedTemplateSlot {
  key: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason: string;
}

export interface TemplateMetadata {
  templateId?: string;
  templateTitle?: string;
  matchScore?: number;
  reason?: string;
  generationMode: ArtifactGenerationMode;
  appliedSlots?: AppliedTemplateSlot[];
  warnings?: string[];
}

export interface GuidedClarificationQuestion {
  id: string;
  question: string;
  options?: string[];
  reason?: string;
}

export interface GuidedClarificationAnswer {
  questionId: string;
  answer: string;
}

export interface GuidedGenerationPlan {
  planningSessionId: string;
  topic: string;
  subjectDomain: string;
  gradeRange?: [number, number];
  interactionType?: string;
  expectedInsight: string;
  learningObjectives: string[];
  coreVariables: string[];
  knowledgeConstraints: string[];
  possibleTemplate?: {
    templateId?: string;
    title?: string;
    confidence?: number;
  };
  interactionStructure: string[];
  qualityFocus: string[];
  assumptions: string[];
  approvedAt?: string;
}

export type GuidedPlanningResult =
  | {
      status: 'clarification_required';
      planningSessionId: string;
      clarificationRound: number;
      questions: GuidedClarificationQuestion[];
      assumptions?: string[];
    }
  | {
      status: 'plan_ready';
      planningSessionId: string;
      clarificationRound: number;
      plan: GuidedGenerationPlan;
      fallbackUsed?: boolean;
    };

export interface PlanningMetadata {
  planningSessionId: string;
  approvedAt?: string;
  summary: string;
  clarificationCount: number;
}

export interface ExplanationStep {
  id: string;
  title: string;
  narration: string;
  focusObjects?: string[];
  actions?: InteractionAction[];
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

export interface BaseInteractionSchema {
  type: DeepInteractionType;
  title: string;
  description: string;
  learningGoals: string[];
  explanationSteps: ExplanationStep[];
  quiz?: QuizQuestion[];
  htmlWidget?: HtmlInteractionWidget;
}

export interface HtmlInteractionWidget {
  html: string;
  widgetType: DeepInteractionType;
  widgetConfig: {
    concept: string;
    variables: Array<Record<string, unknown>>;
    defaultState: Record<string, unknown>;
    messageTargets: Array<{ id: string; purpose: string }>;
  };
  allowedMessageTypes: Array<
    'SET_WIDGET_STATE' | 'HIGHLIGHT_ELEMENT' | 'ANNOTATE_ELEMENT' | 'REVEAL_ELEMENT'
  >;
}

export interface SimulationParameter {
  id: string;
  label: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  explanation?: string;
}

export interface SimulationObject {
  id: string;
  label: string;
  objectType: 'cart' | 'ramp' | 'force_arrow' | 'battery' | 'resistor' | 'liquid' | 'generic';
  properties?: Record<string, string | number | boolean>;
}

export interface Formula {
  id: string;
  title: string;
  latex: string;
  explanation: string;
}

export interface MetricConfig {
  id: string;
  label: string;
  unit?: string;
}

export interface ChartConfig {
  id: string;
  title: string;
  xMetric: string;
  yMetric: string;
}

export interface SimulationSchema extends BaseInteractionSchema {
  type: 'simulation';
  subject: InteractionSubject;
  simulationType:
    | 'inclined_plane'
    | 'free_fall'
    | 'ohms_law'
    | 'lever_balance'
    | 'acid_base_neutralization'
    | 'co2_generation'
    | 'generic_simulation';
  parameters: SimulationParameter[];
  objects: SimulationObject[];
  formulas: Formula[];
  actions: InteractionAction[];
  metrics: MetricConfig[];
  charts?: ChartConfig[];
}

export interface ThreeDObject {
  id: string;
  label: string;
  shape: 'sphere' | 'cube' | 'cylinder' | 'molecule' | 'surface' | 'custom';
  position: { x: number; y: number; z: number };
  color?: string;
  description?: string;
}

export interface CameraConfig {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
}

export interface Label3D {
  id: string;
  targetId: string;
  text: string;
}

export interface ThreeDVisualizationSchema extends BaseInteractionSchema {
  type: '3d_visualization';
  subject: InteractionSubject;
  objects: ThreeDObject[];
  camera?: CameraConfig;
  labels?: Label3D[];
  animations?: InteractionAction[];
}

export interface GameLevel {
  id: string;
  title: string;
  challenge: string;
  quizQuestionIds: string[];
}

export interface ScoringRule {
  correctPoints: number;
  bonusRule?: string;
}

export interface GameSchema extends BaseInteractionSchema {
  type: 'game';
  gameType: 'quiz_challenge' | 'drag_match' | 'connect_circuit' | 'balance_equation' | 'generic_game';
  rules: string[];
  levels: GameLevel[];
  scoring?: ScoringRule;
}

export interface MindMapNode {
  id: string;
  label: string;
  description?: string;
  level: number;
  collapsed?: boolean;
}

export interface MindMapEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface MindMapSchema extends BaseInteractionSchema {
  type: 'mind_map';
  rootId: string;
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  layout: 'tree' | 'radial' | 'force';
}

export interface RagVisualizationSchema extends BaseInteractionSchema {
  type: 'rag_visualization';
  brief?: RagVisualizationBrief;
  visualizationPlan?: RagVisualizationGenerationPlan;
  auditTrail?: FeedbackIteration[];
  repairTrace?: string[];
  visualizationSpec: VisualizationSpec;
  ragMetadata: {
    source: 'student' | 'teacher';
    subject: string;
    originalQuestion: string;
    taskType: string;
  };
}

export type InteractionSchema =
  | SimulationSchema
  | ThreeDVisualizationSchema
  | GameSchema
  | MindMapSchema
  | RagVisualizationSchema;

// --- Multi-Agent Feedback Loop Types ---

export interface AgentIssue {
  id: string;
  severity: 'warning' | 'low' | 'medium' | 'high' | 'critical';
  category: 'pedagogy' | 'ux' | 'safety' | 'runtime' | 'curriculum' | 'accessibility' | 'schema';
  message: string;
  evidence?: string;
  suggestion: string;
  target?: 'lessonPlan' | 'html' | 'teacherActions' | 'schema' | 'all';
}

export interface AgentEvaluation {
  agentName: string;
  score: number;
  passed: boolean;
  summary: string;
  issues: AgentIssue[];
  durationMs?: number;
  blueprintAlignment?: number;
  learningObjectiveCoverage?: number;
  variableCoverage?: number;
  knowledgeConstraintSatisfaction?: number;
  gradeAppropriateness?: number;
  bloomAppropriateness?: number;
}

export interface JudgeDecision {
  type: 'accept' | 'repair' | 'regenerate' | 'reject';
  finalScore: number;
  blockingIssues: AgentIssue[];
  repairInstruction?: string;
  target?: 'lessonPlan' | 'html' | 'teacherActions' | 'schema' | 'all';
  reason: string;
}

export interface FeedbackIteration {
  iteration: number;
  evaluations: AgentEvaluation[];
  judgeDecision: JudgeDecision;
  repairInstruction?: string;
  changeLog?: string[];
  scoreBefore?: number;
  scoreAfter?: number;
  createdAt: string;
}

export interface FeedbackLoopResult {
  passed: boolean;
  finalScore: number;
  iterations: FeedbackIteration[];
  finalIssues: AgentIssue[];
  bestVersionReason?: string;
}

export interface QualityReport {
  status?: 'pending' | 'deterministic_ready' | 'reviewing' | 'reviewed' | 'review_failed';
  finalScore: number;
  level: 'excellent' | 'good' | 'usable' | 'needs_improvement' | 'failed';
  summary: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  evaluatorScores: Record<string, number>;
  passed: boolean;
  blueprintAlignment?: number;
  subjectCorrectness?: number;
  variableCoverage?: number;
  learningObjectiveCoverage?: number;
  knowledgeConstraintSatisfaction?: number;
  blueprintSummary?: {
    topic: string;
    subjectDomain: SubjectDomain;
    gradeRange: [number, number];
    bloomLevel: BloomLevel;
    expectedInsight: string;
  };
  schemaValidation?: SchemaValidationSummary;
  qualityExplanation?: QualityExplanation;
  repairTrace?: RepairTraceItem[];
}

export interface QualityExplanation {
  expectedInsightCheck?: {
    status: 'satisfied' | 'partially_satisfied' | 'not_satisfied' | 'unknown';
    evidence: string[];
    issue?: string;
  };
  variableChecks?: {
    symbol: string;
    role: string;
    status: 'covered' | 'partially_covered' | 'missing' | 'unknown';
    evidence: string[];
  }[];
  constraintChecks?: {
    id: string;
    description: string;
    severity: 'must' | 'should';
    status: 'satisfied' | 'violated' | 'unknown';
    evidence: string[];
    repairSuggestion?: string;
  }[];
  teacherControlNotes?: string[];
  templatePreservationNotes?: string[];
}

export interface RepairTraceItem {
  iteration: number;
  trigger: 'safety' | 'runtime' | 'pedagogy' | 'ux' | 'schema' | 'template';
  issue: string;
  actionTaken: string;
  affectedArea?: string;
}

export interface ResearchEvent {
  id: string;
  timestamp: string;
  sessionId?: string;
  artifactId?: string;
  type:
    | 'planning_started'
    | 'clarification_answered'
    | 'plan_approved'
    | 'prompt_submitted'
    | 'blueprint_generated'
    | 'template_matched'
    | 'template_customized'
    | 'artifact_generated'
    | 'quality_report_viewed'
    | 'follow_up_submitted'
    | 'artifact_saved';
  payload?: Record<string, unknown>;
}

export interface ResearchExportBundle {
  exportedAt: string;
  appVersion?: string;
  sessions: unknown[];
  artifacts: unknown[];
  events: ResearchEvent[];
}
