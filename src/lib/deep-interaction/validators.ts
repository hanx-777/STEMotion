import type {
  DeepInteractionType,
  InteractionArtifact,
  InteractionSchema,
  InteractionSession,
  MindMapSchema,
  SimulationSchema,
} from './types';
import { assertSafeInteractiveHtml } from '@/lib/generation/htmlSafety';

const allowedTypes: DeepInteractionType[] = ['3d_visualization', 'simulation', 'game', 'mind_map'];

export function validateInteractionSession(session: InteractionSession): void {
  assertText(session.id, 'session.id');
  assertText(session.title, 'session.title');
  assertAllowedType(session.interactionType);
  if (session.mode !== 'deep_interaction') {
    throw new Error('Deep interaction sessions must use mode deep_interaction.');
  }
}

export function validateInteractionArtifact(artifact: InteractionArtifact): void {
  assertText(artifact.id, 'artifact.id');
  assertText(artifact.sessionId, 'artifact.sessionId');
  assertAllowedType(artifact.type);
  validateInteractionSchema(artifact.schema);
}

export function validateInteractionSchema(schema: InteractionSchema): void {
  assertAllowedType(schema.type);
  assertText(schema.title, 'schema.title');
  assertText(schema.description, 'schema.description');
  if (!Array.isArray(schema.learningGoals) || schema.learningGoals.length === 0) {
    throw new Error('schema.learningGoals must not be empty.');
  }
  if (schema.htmlWidget) {
    assertSafeInteractiveHtml(schema.htmlWidget.html);
    if (schema.htmlWidget.widgetType !== schema.type) {
      throw new Error('htmlWidget.widgetType must match schema.type.');
    }
  }
  if (schema.type === 'simulation') validateSimulationSchema(schema);
  if (schema.type === 'mind_map') validateMindMapSchema(schema);
}

export function validateSimulationSchema(schema: SimulationSchema): void {
  const allowedSimulationTypes = [
    'inclined_plane',
    'free_fall',
    'ohms_law',
    'lever_balance',
    'acid_base_neutralization',
    'co2_generation',
    'generic_simulation',
  ];

  if (!allowedSimulationTypes.includes(schema.simulationType)) {
    throw new Error(`Unsupported simulation type: ${schema.simulationType}`);
  }

  if (!Array.isArray(schema.parameters) || schema.parameters.length === 0) {
    throw new Error('Simulation schema requires parameters.');
  }
}

export function validateMindMapSchema(schema: MindMapSchema): void {
  assertText(schema.rootId, 'schema.rootId');
  if (!Array.isArray(schema.nodes) || schema.nodes.length === 0) {
    throw new Error('Mind map schema requires nodes.');
  }
  if (!schema.nodes.some((node) => node.id === schema.rootId)) {
    throw new Error('Mind map rootId must point to an existing node.');
  }
}

export function repairUnsupportedInteractionType(value: string): DeepInteractionType {
  if (allowedTypes.includes(value as DeepInteractionType)) {
    return value as DeepInteractionType;
  }
  return 'mind_map';
}

function assertAllowedType(type: unknown): asserts type is DeepInteractionType {
  if (!allowedTypes.includes(type as DeepInteractionType)) {
    throw new Error('Unsupported deep interaction type. Only 3D visualization, simulation, game, and mind map are allowed.');
  }
}

function assertText(value: unknown, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
}
