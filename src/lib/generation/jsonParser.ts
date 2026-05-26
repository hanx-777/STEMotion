import { jsonrepair } from 'jsonrepair';
import { createLogger } from '@/lib/logger';

const log = createLogger('json');

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) + '...' : value;
}

/**
 * Robust JSON parser with 4 fallback strategies (inspired by OpenMAIC):
 * 1. Strip artifacts + code fences, try bracket-matching JSON.parse
 * 2. Truncation repair (close unclosed strings/brackets)
 * 3. LaTeX escape fix (double-backslash non-JSON escapes)
 * 4. jsonrepair + control char cleanup
 */
export function parseJsonResponse(raw: string): unknown {
  // Step 0: Strip Claude Code artifacts and control characters
  const cleaned = raw
    .replace(/<file_write[^>]*>[\s\S]*?<\/file_write>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<\/?[a-z_-]+[^>]*>/gi, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  // Step 1: Extract from markdown code fences
  const defenced = cleaned.trim().match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim() ?? cleaned.trim();

  // Step 2: Try bracket-matching to find balanced JSON structure
  const balanced = extractBalancedJson(defenced);

  // Build candidate list: balanced first, then full text
  const candidates = [balanced, defenced].filter((c): c is string => !!c);

  // Strategy 1: Raw parse
  for (const candidate of candidates) {
    try {
      const result = JSON.parse(candidate);
      log.debug('parseJson success', { strategy: 'raw', inputLen: raw.length });
      return result;
    } catch (e) { log.debug('Strategy raw failed', { error: truncate(String(e instanceof Error ? e.message : e), 200) }); }
  }

  // Strategy 2: Truncation repair — close unclosed strings and brackets
  for (const candidate of candidates) {
    const repaired = repairTruncatedJson(candidate);
    try {
      const result = JSON.parse(repaired);
      log.debug('parseJson success', { strategy: 'truncation_repair', inputLen: raw.length });
      return result;
    } catch (e) { log.debug('Strategy truncation_repair failed', { error: truncate(String(e instanceof Error ? e.message : e), 200) }); }
  }

  // Strategy 3: Fix LaTeX escapes
  for (const candidate of candidates) {
    const fixed = fixLatexEscapes(candidate);
    try {
      const result = JSON.parse(fixed);
      log.debug('parseJson success', { strategy: 'latex_fix', inputLen: raw.length });
      return result;
    } catch (e) { log.debug('Strategy latex_fix failed', { error: truncate(String(e instanceof Error ? e.message : e), 200) }); }
  }

  // Strategy 4: jsonrepair
  for (const candidate of candidates) {
    try {
      const result = JSON.parse(jsonrepair(candidate));
      log.debug('parseJson success', { strategy: 'jsonrepair', inputLen: raw.length });
      return result;
    } catch (e) { log.debug('Strategy jsonrepair failed', { error: truncate(String(e instanceof Error ? e.message : e), 200) }); }
  }

  // Strategy 5: Control character removal + jsonrepair (nuclear option)
  const sanitized = defenced.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  try {
    const result = JSON.parse(jsonrepair(sanitized));
    log.debug('parseJson success', { strategy: 'sanitized_jsonrepair', inputLen: raw.length });
    return result;
  } catch (e) {
    log.debug('Strategy sanitized_jsonrepair failed', { error: truncate(String(e instanceof Error ? e.message : e), 200) });
    log.error('parseJson exhausted all strategies', { inputLen: raw.length, preview: raw.slice(0, 300) });
    throw new Error('无法解析模型返回的 JSON 内容。');
  }
}

// --- Helpers ---

/**
 * Extract a balanced JSON object or array using depth-counting bracket matching.
 * Respects string boundaries (quotes) to avoid matching braces inside strings.
 */
function extractBalancedJson(text: string): string | null {
  // Find the first { or [ that starts the JSON
  const start = text.search(/[\[{]/);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === '\\') {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  // Unclosed — return what we have (truncation repair will handle it)
  return text.slice(start);
}

/**
 * Attempt to repair truncated JSON by closing unclosed strings and brackets.
 */
function repairTruncatedJson(json: string): string {
  let repaired = json.trim();

  // Close unclosed string
  let inString = false;
  let escape = false;

  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') {
      if (!inString) {
        inString = true;
      } else {
        inString = false;
      }
    }
  }

  if (inString) {
    // Unclosed string — close it
    repaired += '"';
  }

  // Close unclosed brackets (outermost last)
  const stack: string[] = [];
  inString = false;
  escape = false;
  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    if (ch === '[') stack.push(']');
    if ((ch === '}' || ch === ']') && stack.length > 0) stack.pop();
  }

  while (stack.length > 0) {
    repaired += stack.pop();
  }

  return repaired;
}

/**
 * Fix LaTeX escape sequences that are not valid JSON escapes.
 * E.g., \frac, \alpha, \left, \right -> \\frac, \\alpha, etc.
 * Preserves valid JSON escapes: \", \\, \/, \b, \f, \n, \r, \t, \uXXXX
 */
function fixLatexEscapes(text: string): string {
  return text.replace(/\\(?!["\\\/bfnrtu0-9])/g, '\\\\');
}
