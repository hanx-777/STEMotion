import type { Citation } from './types';

export type CitationMarker = 'L' | 'W';

export interface ParsedCitationRef {
  raw: string;
  marker: CitationMarker;
  sourceType: Citation['source_type'];
  index: number;
}

export interface ResolvedCitationRef extends ParsedCitationRef {
  resolved: boolean;
  citation?: Citation;
  key?: string;
  description: string;
}

export function parseCitationRef(value: string): ParsedCitationRef | undefined {
  const matched = /^\[(L|W)(\d+)\]$/.exec(value.trim());
  if (!matched) return undefined;
  const index = Number(matched[2]);
  if (!Number.isInteger(index) || index < 1) return undefined;
  const marker = matched[1] as CitationMarker;
  return {
    raw: `[${marker}${index}]`,
    marker,
    sourceType: marker === 'L' ? 'local' : 'web',
    index,
  };
}

export function resolveCitationRef(value: string, citations: Citation[]): ResolvedCitationRef | undefined {
  const parsed = parseCitationRef(value);
  if (!parsed) return undefined;

  const scoped = citations.filter((citation) => citation.source_type === parsed.sourceType);
  const citation = scoped[parsed.index - 1];
  if (!citation) {
    return {
      ...parsed,
      resolved: false,
      description: `未找到对应${parsed.sourceType === 'local' ? '本地课程资料' : '网络补充资料'} ${parsed.raw}`,
    };
  }

  return {
    ...parsed,
    resolved: true,
    citation,
    key: citationSourceKey(citation),
    description: `查看${parsed.sourceType === 'local' ? '本地课程资料' : '网络补充资料'} ${parsed.raw}：${citationTitle(citation)}`,
  };
}

export function citationSourceKey(citation: Citation): string {
  return citation.source_type === 'local' ? citation.chunk_id : citation.url;
}

export function citationRefForCitation(citation: Citation, citations: Citation[]): string {
  const marker: CitationMarker = citation.source_type === 'local' ? 'L' : 'W';
  const key = citationSourceKey(citation);
  const scoped = citations.filter((item) => item.source_type === citation.source_type);
  const index = scoped.findIndex((item) => citationSourceKey(item) === key);
  return `[${marker}${Math.max(1, index + 1)}]`;
}

function citationTitle(citation: Citation): string {
  return citation.source_type === 'local' ? citation.file_name : citation.title;
}
