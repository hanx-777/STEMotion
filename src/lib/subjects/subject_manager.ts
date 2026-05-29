import { readdir, readFile, stat } from 'fs/promises';
import { isAbsolute, join } from 'path';
import { DEFAULT_SUBJECT, getDefaultSubjectSetting, setDefaultSubjectSetting } from '@/lib/config/settings';
import { SUBJECT_ORDER } from './default_subjects';
import type { SubjectDefinition, SubjectInfo, SubjectSkillConfig } from './subject_schema';

type ParsedYamlValue = string | number | boolean | string[] | Record<string, string | number | boolean>;

const DEFAULT_RETRIEVAL = {
  top_k: 4,
  score_threshold: 0.18,
  enable_web_search: false,
  web_top_k: 3,
  lexical_top_k: 8,
  embedding_top_k: 8,
  rerank_top_k: 4,
  evidence_threshold: 0.18,
  enable_embedding: false,
};

export class SubjectManager {
  constructor(private readonly skillsRoot = join(process.cwd(), 'skills')) {}

  async listSubjects(): Promise<SubjectInfo[]> {
    const entries = await this.listSubjectNames();
    const subjects = await Promise.all(entries.map((name) => this.getSubject(name)));
    return subjects
      .map((subject) => ({
        name: subject.name,
        display_name: subject.display_name,
        description: subject.description,
        default_language: subject.default_language,
        retrieval: subject.retrieval,
        tools: subject.tools,
        answer_requirements: subject.answer_requirements,
      }))
      .sort((a, b) => sortSubjectNames(a.name, b.name));
  }

  async getDefaultSubject(): Promise<SubjectDefinition> {
    return this.getSubject(await this.validateSubject(await getDefaultSubjectSetting()));
  }

  async getDefaultSubjectName(): Promise<string> {
    return (await this.getDefaultSubject()).name;
  }

  async setDefaultSubject(subjectName: string): Promise<SubjectDefinition> {
    const subject = await this.getSubject(await this.validateSubject(subjectName));
    await setDefaultSubjectSetting(subject.name);
    return subject;
  }

  async getSubject(subjectName: string): Promise<SubjectDefinition> {
    const safeName = sanitizeSubjectName(subjectName);
    const skillDir = join(this.skillsRoot, safeName);
    const configPath = join(skillDir, 'skill.yaml');
    const config = normalizeSkillConfig(parseSimpleYaml(await readFile(configPath, 'utf-8')));

    const knowledgeBasePath = resolveSkillPath(skillDir, config.knowledge_base_path);
    const systemPromptPath = resolveSkillPath(skillDir, config.system_prompt_path);
    const answerTemplatePath = resolveSkillPath(skillDir, config.answer_template_path);

    const [systemPrompt, answerTemplate] = await Promise.all([
      readFile(systemPromptPath, 'utf-8'),
      readFile(answerTemplatePath, 'utf-8'),
    ]);

    return {
      name: config.name,
      display_name: config.display_name,
      description: config.description,
      default_language: config.default_language,
      retrieval: config.retrieval,
      tools: config.tools,
      answer_requirements: config.answer_requirements,
      skill_dir: skillDir,
      knowledge_base_path: knowledgeBasePath,
      system_prompt_path: systemPromptPath,
      answer_template_path: answerTemplatePath,
      system_prompt: systemPrompt,
      answer_template: answerTemplate,
    };
  }

  async validateSubject(subjectName?: string | null): Promise<string> {
    const fallback = await this.resolveExistingDefaultSubjectName();
    if (!subjectName) return fallback;

    const safeName = sanitizeSubjectName(subjectName);
    try {
      const subjectPath = join(this.skillsRoot, safeName, 'skill.yaml');
      if ((await stat(subjectPath)).isFile()) return safeName;
    } catch {
      return fallback;
    }

    return fallback;
  }

  async getSubjectPrompt(subjectName: string): Promise<string> {
    return (await this.getSubject(await this.validateSubject(subjectName))).system_prompt;
  }

  async getKnowledgeBasePath(subjectName: string): Promise<string> {
    return (await this.getSubject(await this.validateSubject(subjectName))).knowledge_base_path;
  }

  /**
   * Resolve knowledge base sources directory.
   * Returns sources/ if it exists (new layout), otherwise knowledge_base/ root (old layout).
   */
  async getKnowledgeBaseSourcesPath(subjectName: string): Promise<string> {
    const basePath = await this.getKnowledgeBasePath(subjectName);
    const sourcesDir = join(basePath, 'sources');
    try {
      const s = await stat(sourcesDir);
      if (s.isDirectory()) return sourcesDir;
    } catch { /* fall through */ }
    return basePath;
  }

  async getKnowledgeBaseProcessedPath(subjectName: string): Promise<string> {
    return join(await this.getKnowledgeBasePath(subjectName), 'processed');
  }

  async getKnowledgeBaseIndexPath(subjectName: string): Promise<string> {
    return join(await this.getKnowledgeBasePath(subjectName), 'index');
  }

  async getKnowledgeBaseConfigPath(subjectName: string): Promise<string> {
    return join(await this.getKnowledgeBasePath(subjectName), 'config');
  }

  private async resolveExistingDefaultSubjectName(): Promise<string> {
    const configured = sanitizeSubjectName(await getDefaultSubjectSetting());
    if (await this.hasSubject(configured)) return configured;
    return DEFAULT_SUBJECT;
  }

  private async hasSubject(subjectName: string): Promise<boolean> {
    try {
      return (await stat(join(this.skillsRoot, subjectName, 'skill.yaml'))).isFile();
    } catch {
      return false;
    }
  }

  private async listSubjectNames(): Promise<string[]> {
    const entries = await readdir(this.skillsRoot, { withFileTypes: true });
    const subjectNames: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (await this.hasSubject(entry.name)) subjectNames.push(entry.name);
    }

    return subjectNames;
  }
}

function sanitizeSubjectName(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, '');
}

function resolveSkillPath(skillDir: string, value: string): string {
  return isAbsolute(value) ? value : join(skillDir, value);
}

function sortSubjectNames(a: string, b: string): number {
  const ai = SUBJECT_ORDER.indexOf(a);
  const bi = SUBJECT_ORDER.indexOf(b);
  if (ai !== -1 || bi !== -1) return (ai === -1 ? Number.MAX_SAFE_INTEGER : ai) - (bi === -1 ? Number.MAX_SAFE_INTEGER : bi);
  return a.localeCompare(b);
}

function parseSimpleYaml(raw: string): Record<string, ParsedYamlValue> {
  const result: Record<string, ParsedYamlValue> = {};
  const lines = raw.split(/\r?\n/);
  let currentKey: string | null = null;

  for (const line of lines) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;

    const rootMatch = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
    if (rootMatch) {
      const [, key, value] = rootMatch;
      currentKey = key;
      result[key] = value === '' ? {} : parseScalar(value);
      continue;
    }

    const nestedMatch = /^\s{2}([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
    if (nestedMatch && currentKey) {
      const [, nestedKey, nestedValue] = nestedMatch;
      const current = result[currentKey];
      if (Array.isArray(current) || typeof current !== 'object' || current === null) {
        result[currentKey] = {};
      }
      (result[currentKey] as Record<string, string | number | boolean>)[nestedKey] = parseScalar(nestedValue);
      continue;
    }

    const listMatch = /^\s{2}-\s*(.*)$/.exec(line);
    if (listMatch && currentKey) {
      if (!Array.isArray(result[currentKey])) result[currentKey] = [];
      (result[currentKey] as string[]).push(String(parseScalar(listMatch[1])));
    }
  }

  return result;
}

function parseScalar(value: string): string | number | boolean {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed.replace(/^['"]|['"]$/g, '');
}

function normalizeSkillConfig(raw: Record<string, ParsedYamlValue>): SubjectSkillConfig {
  const retrieval = typeof raw.retrieval === 'object' && !Array.isArray(raw.retrieval)
    ? raw.retrieval
    : {};

  return {
    name: requiredString(raw.name, 'name'),
    display_name: requiredString(raw.display_name, 'display_name'),
    description: requiredString(raw.description, 'description'),
    default_language: requiredString(raw.default_language, 'default_language'),
    knowledge_base_path: requiredString(raw.knowledge_base_path, 'knowledge_base_path'),
    system_prompt_path: requiredString(raw.system_prompt_path, 'system_prompt_path'),
    answer_template_path: requiredString(raw.answer_template_path, 'answer_template_path'),
    retrieval: {
      top_k: numberOrDefault(retrieval.top_k, DEFAULT_RETRIEVAL.top_k),
      score_threshold: numberOrDefault(retrieval.score_threshold, DEFAULT_RETRIEVAL.score_threshold),
      enable_web_search: booleanOrDefault(retrieval.enable_web_search, DEFAULT_RETRIEVAL.enable_web_search),
      web_top_k: numberOrDefault(retrieval.web_top_k, DEFAULT_RETRIEVAL.web_top_k),
      lexical_top_k: numberOrDefault(retrieval.lexical_top_k, DEFAULT_RETRIEVAL.lexical_top_k),
      embedding_top_k: numberOrDefault(retrieval.embedding_top_k, DEFAULT_RETRIEVAL.embedding_top_k),
      rerank_top_k: numberOrDefault(retrieval.rerank_top_k, DEFAULT_RETRIEVAL.rerank_top_k),
      evidence_threshold: numberOrDefault(retrieval.evidence_threshold, DEFAULT_RETRIEVAL.evidence_threshold),
      enable_embedding: booleanOrDefault(retrieval.enable_embedding, DEFAULT_RETRIEVAL.enable_embedding),
    },
    tools: Array.isArray(raw.tools) ? raw.tools : [],
    answer_requirements: Array.isArray(raw.answer_requirements) ? raw.answer_requirements : [],
  };
}

function requiredString(value: ParsedYamlValue | undefined, key: string): string {
  if (typeof value === 'string' && value.trim()) return value;
  throw new Error(`Invalid subject skill config: "${key}" is required`);
}

function numberOrDefault(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function booleanOrDefault(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
