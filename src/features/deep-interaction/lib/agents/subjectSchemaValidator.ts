import { createLogger } from '@/lib/logger';
import type { KnowledgeConstraint, LearningBlueprint, SchemaValidationSummary } from '../types';
import { findMatchingSubjectSchema } from '../subject-schemas';

const log = createLogger('subjectSchemaValidator');

export interface BlueprintValidationResult extends SchemaValidationSummary {
  mergedConstraints: KnowledgeConstraint[];
}

export function validateBlueprintAgainstSchema(blueprint: LearningBlueprint): BlueprintValidationResult {
  const lookupText = `${blueprint.topic} ${blueprint.originalPrompt}`;
  const match = findMatchingSubjectSchema(blueprint.subjectDomain, lookupText)
    ?? findMatchingSubjectSchema('other', lookupText);

  if (!match) {
    log.info('No matching subject schema found', {
      subjectDomain: blueprint.subjectDomain,
      topic: blueprint.topic,
    });

    return {
      passed: true,
      violations: [],
      warnings: ['未匹配到内置学科 Schema，仅使用 LearningBlueprint 自带知识约束。'],
      mergedConstraints: blueprint.knowledgeConstraints,
    };
  }

  const { schema } = match;
  const violations: string[] = [];
  const warnings: string[] = [];
  const existingSymbols = new Set(blueprint.coreVariables.map((variable) => normalizeSymbol(variable.symbol)));

  for (const required of schema.requiredVariables ?? []) {
    if (!existingSymbols.has(normalizeSymbol(required))) {
      violations.push(`缺少必要变量：${required}`);
    }
  }

  const joinedBlueprintText = [
    blueprint.expectedInsight,
    ...blueprint.learningObjectives,
    ...blueprint.knowledgeConstraints.map((constraint) => `${constraint.description} ${constraint.mustBeTrue}`),
  ].join(' ');

  for (const claim of schema.forbiddenClaims ?? []) {
    if (joinedBlueprintText.includes(claim)) {
      violations.push(`出现禁止性错误表述：${claim}`);
    }
  }

  const schemaConstraintIds = new Set(schema.constraints.map((constraint) => constraint.id));
  const mergedConstraints = [
    ...schema.constraints,
    ...blueprint.knowledgeConstraints.filter((constraint) => !schemaConstraintIds.has(constraint.id)),
  ];

  log.info('Blueprint schema validation completed', {
    blueprintId: blueprint.id,
    schemaKey: schema.key,
    passed: violations.length === 0,
    violationCount: violations.length,
  });

  return {
    passed: violations.length === 0,
    schemaKey: schema.key,
    violations,
    warnings,
    mergedConstraints,
  };
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toLowerCase();
}
