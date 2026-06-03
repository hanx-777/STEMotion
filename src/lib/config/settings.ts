import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

export const DEFAULT_SUBJECT = 'physics_mechanics';

const LOCAL_STATE_DIR = join(process.cwd(), '.stemotion');
const SETTINGS_PATH = join(LOCAL_STATE_DIR, 'settings.json');

interface RuntimeSettings {
  defaultSubject?: string;
}

export function getLocalStateDir(): string {
  return LOCAL_STATE_DIR;
}

export function getVectorStoreDir(): string {
  return join(LOCAL_STATE_DIR, 'vector-store');
}

export async function getDefaultSubjectSetting(): Promise<string> {
  const envDefault = process.env.STEMOTION_DEFAULT_SUBJECT?.trim();
  if (envDefault) return envDefault;

  const runtimeSettings = await readRuntimeSettings();
  return runtimeSettings.defaultSubject || DEFAULT_SUBJECT;
}

export async function setDefaultSubjectSetting(subject: string): Promise<void> {
  const current = await readRuntimeSettings();
  await mkdir(LOCAL_STATE_DIR, { recursive: true });
  await writeFile(
    SETTINGS_PATH,
    JSON.stringify({ ...current, defaultSubject: subject }, null, 2),
    'utf-8',
  );
}

export async function getDefaultSubjectSource(): Promise<'env' | 'local' | 'built-in'> {
  if (process.env.STEMOTION_DEFAULT_SUBJECT?.trim()) return 'env';
  const runtimeSettings = await readRuntimeSettings();
  return runtimeSettings.defaultSubject ? 'local' : 'built-in';
}

async function readRuntimeSettings(): Promise<RuntimeSettings> {
  try {
    return JSON.parse(await readFile(SETTINGS_PATH, 'utf-8')) as RuntimeSettings;
  } catch {
    return {};
  }
}
