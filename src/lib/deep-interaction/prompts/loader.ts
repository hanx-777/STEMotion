import { readFileSync } from 'fs';
import { join } from 'path';
import type { DeepInteractionType } from '../types';

const PROMPTS_DIR = join(process.cwd(), 'src/lib/deep-interaction/prompts');

const cache = new Map<string, string>();

function loadFile(relativePath: string): string {
  const cached = cache.get(relativePath);
  if (cached) return cached;

  const filePath = join(PROMPTS_DIR, relativePath);
  const content = readFileSync(filePath, 'utf-8');
  cache.set(relativePath, content);
  return content;
}

const TYPE_TO_DIR: Record<DeepInteractionType, string> = {
  simulation: 'simulation-content',
  game: 'game-content',
  mind_map: 'diagram-content',
  '3d_visualization': 'visualization3d-content',
  rag_visualization: 'rag-visualization-content',
};

export function loadWidgetSystemPrompt(type: DeepInteractionType): string {
  return loadFile(`${TYPE_TO_DIR[type]}/system.md`);
}

export function loadWidgetUserPrompt(type: DeepInteractionType): string {
  return loadFile(`${TYPE_TO_DIR[type]}/user.md`);
}

export function loadPromptTemplate(filename: string): string {
  return loadFile(filename);
}

export function clearPromptCache(): void {
  cache.clear();
}
