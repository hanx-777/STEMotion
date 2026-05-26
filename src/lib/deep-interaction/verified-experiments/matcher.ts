import type { LearningBlueprint } from '../types';
import { VERIFIED_EXPERIMENT_TEMPLATES } from './templates/index';
import type { TemplateMatchResult } from './types';

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。！？、,.!?'"’]/g, '');
}

function computeAliasScore(text: string, alias: string): number {
  const normalizedText = normalizeText(text);
  const normalizedAlias = normalizeText(alias);

  if (!normalizedAlias) return 0;

  if (normalizedText.includes(normalizedAlias)) {
    if (normalizedAlias.length >= 4) return 1;
    return 0.8;
  }

  return 0;
}

export function findMatchingVerifiedTemplate(
  userPrompt: string,
  blueprint?: LearningBlueprint,
): TemplateMatchResult | null {
  const searchText = [
    userPrompt,
    blueprint?.topic,
    blueprint?.subjectDomain,
    blueprint?.expectedInsight,
    ...(blueprint?.learningObjectives ?? []),
  ]
    .filter(Boolean)
    .join(' ');

  let best: TemplateMatchResult | null = null;

  for (const template of VERIFIED_EXPERIMENT_TEMPLATES) {
    let bestAlias = '';
    let bestScore = 0;

    for (const alias of template.aliases) {
      const score = computeAliasScore(searchText, alias);
      if (score > bestScore) {
        bestScore = score;
        bestAlias = alias;
      }
    }

    if (
      blueprint?.subjectDomain &&
      template.subjectDomain === blueprint.subjectDomain &&
      bestScore > 0
    ) {
      bestScore = Math.min(1, bestScore + 0.1);
    }

    if (bestScore > 0 && (!best || bestScore > best.score)) {
      best = {
        template,
        score: bestScore,
        matchedAlias: bestAlias,
        reason: `Matched alias "${bestAlias}" with score ${bestScore.toFixed(2)}`,
      };
    }
  }

  return best;
}

export function shouldAutoUseTemplate(match: TemplateMatchResult | null): boolean {
  return Boolean(match && match.score >= 0.75);
}

export function isMediumConfidenceTemplateMatch(match: TemplateMatchResult | null): boolean {
  return Boolean(match && match.score >= 0.5 && match.score < 0.75);
}
