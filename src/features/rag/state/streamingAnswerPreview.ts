interface RagAnswerSectionPreview {
  title?: unknown;
  content?: unknown;
}

export function buildStreamingAnswerPreview(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const parsed = parseJson(trimmed);
  const parsedPreview = previewFromParsedJson(parsed);
  if (parsedPreview) return parsedPreview;

  const contentFields = extractJsonStringFields(trimmed, 'content');
  if (contentFields.length > 0) {
    return contentFields.join('\n\n').trim();
  }

  const answerFields = extractJsonStringFields(trimmed, 'answer');
  if (answerFields.length > 0) {
    return answerFields.join('\n\n').trim();
  }

  if (/^[\[{]/.test(trimmed)) return '';
  return trimmed;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function previewFromParsedJson(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;

  if (Array.isArray(record.sections)) {
    return record.sections
      .map(formatSection)
      .filter(Boolean)
      .join('\n\n')
      .trim();
  }

  if (typeof record.answer === 'string') return record.answer.trim();
  return '';
}

function formatSection(section: unknown): string {
  if (!section || typeof section !== 'object') return '';
  const item = section as RagAnswerSectionPreview;
  const content = typeof item.content === 'string' ? item.content.trim() : '';
  if (!content) return '';
  const title = typeof item.title === 'string' ? item.title.trim() : '';
  return title ? `### ${title}\n${content}` : content;
}

function extractJsonStringFields(value: string, fieldName: string): string[] {
  const escapedField = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`"${escapedField}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'g');
  const matches: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    const decoded = decodeJsonString(match[1]);
    if (decoded.trim()) matches.push(decoded.trim());
  }

  return matches;
}

function decodeJsonString(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
}
