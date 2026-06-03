/**
 * Lightweight debug logger — zero dependencies.
 *
 * Control output via the DEBUG environment variable:
 *   DEBUG=*            → all modules, all levels including debug
 *   DEBUG=llm,pipeline → only these modules at debug level
 *   (unset)            → info/warn/error only
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Parse DEBUG env once at module load, not on every log call.
const enabledModules: Set<string> | '*' = (() => {
  const raw = process.env.DEBUG ?? '';
  if (!raw || raw === '') return new Set();
  if (raw === '*') return '*';
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
})();

function isModuleEnabled(module: string): boolean {
  if (enabledModules === '*') return true;
  return enabledModules.has(module);
}

function timestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) + '...' : value;
}

function formatData(data: unknown): string {
  if (data === undefined) return '';
  try {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    return ' | ' + truncate(str, 500);
  } catch {
    return ' | [unserializable]';
  }
}

function shouldLog(level: LogLevel, module: string): boolean {
  // Only debug level is gated by the DEBUG env var; info/warn/error always log.
  if (level === 'debug') return isModuleEnabled(module);
  return true;
}

export function createLogger(module: string) {
  const log = (level: LogLevel, msg: string, data?: unknown) => {
    if (!shouldLog(level, module)) return;

    const prefix = `[${timestamp()}] [${module}:${level}]`;
    const line = `${prefix} ${msg}${formatData(data)}`;

    switch (level) {
      case 'error':
        console.error(line);
        break;
      case 'warn':
        console.warn(line);
        break;
      default:
        console.log(line);
        break;
    }
  };

  return {
    debug: (msg: string, data?: unknown) => log('debug', msg, data),
    info: (msg: string, data?: unknown) => log('info', msg, data),
    warn: (msg: string, data?: unknown) => log('warn', msg, data),
    error: (msg: string, data?: unknown) => log('error', msg, data),
  };
}
