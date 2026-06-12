import { biologyMitosisBasicTemplate } from './biology-mitosis-basic';
import { chemistryAcidBaseTitrationBasicTemplate } from './chemistry-acid-base-titration-basic';
import { mathQuadraticFunctionBasicTemplate } from './math-quadratic-function-basic';
import { physicsOhmsLawBasicTemplate } from './physics-ohms-law-basic';

export const VERIFIED_EXPERIMENT_TEMPLATES = [
  physicsOhmsLawBasicTemplate,
  mathQuadraticFunctionBasicTemplate,
  biologyMitosisBasicTemplate,
  chemistryAcidBaseTitrationBasicTemplate,
] as const;

export type VerifiedExperimentTemplateId = (typeof VERIFIED_EXPERIMENT_TEMPLATES)[number]['id'];

