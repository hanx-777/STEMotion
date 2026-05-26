import type { ExperimentConfig } from '../schema/experiment';
import { assertSafeInteractiveHtml } from './htmlSafety';
import { parseJsonResponse } from './jsonParser';

export function parseExperimentJson(input: string): ExperimentConfig {
  const result = parseJsonResponse(input);
  if (!result || typeof result !== 'object') {
    throw new Error('Experiment JSON must be an object.');
  }
  return validateExperimentConfig(result);
}

export function validateExperimentConfig(value: unknown): ExperimentConfig {
  if (!value || typeof value !== 'object') {
    throw new Error('Experiment JSON must be an object.');
  }

  const config = value as Partial<ExperimentConfig>;

  assertString(config.id, 'id');
  assertString(config.title, 'title');
  assertString(config.subject, 'subject');
  assertString(config.gradeLevel, 'gradeLevel');
  assertString(config.description, 'description');
  assertArray(config.learningGoals, 'learningGoals');
  assertArray(config.objects, 'objects');
  assertArray(config.parameters, 'parameters');
  assertArray(config.actions, 'actions');
  assertArray(config.explanationSteps, 'explanationSteps');
  assertArray(config.quiz, 'quiz');

  if (!config.environment || typeof config.environment !== 'object') {
    throw new Error('environment must be an object.');
  }

  if (!config.simulation || typeof config.simulation !== 'object') {
    throw new Error('simulation must be an object.');
  }

  if (config.renderer !== 'inclined_plane' && config.renderer !== 'interactive_html') {
    throw new Error('The MVP currently supports inclined_plane and interactive_html renderers.');
  }

  if (config.renderer === 'interactive_html') {
    if (!config.interactiveWidget || typeof config.interactiveWidget !== 'object') {
      throw new Error('interactive_html experiments must include interactiveWidget.');
    }
    if (typeof config.interactiveWidget.html !== 'string' || !config.interactiveWidget.html.includes('<!DOCTYPE html>')) {
      throw new Error('interactiveWidget.html must be a complete HTML document.');
    }
    assertSafeInteractiveHtml(config.interactiveWidget.html);
    assertArray(config.interactiveWidget.allowedMessageTypes, 'interactiveWidget.allowedMessageTypes');
    if (!config.interactiveWidget.widgetConfig || typeof config.interactiveWidget.widgetConfig !== 'object') {
      throw new Error('interactiveWidget.widgetConfig must be an object.');
    }
  }

  return config as ExperimentConfig;
}

function assertString(value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
}

function assertArray(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array.`);
  }
}
