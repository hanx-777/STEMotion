import MiniSearch from 'minisearch';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import type { KnowledgeChunk } from './knowledge_chunk_types';

interface KeywordIndexRecord {
  id: string;
  chunkId: string;
  subject: string;
  topic: string;
  title: string;
  sectionPath: string;
  contentType: string;
  keywords: string;
  text: string;
}

export interface KeywordSearchResult {
  chunkId: string;
  score: number;
}

export class KeywordIndex {
  private miniSearch: MiniSearch<KeywordIndexRecord> | null = null;
  private records: Map<string, KeywordIndexRecord> = new Map();

  constructor(private readonly indexPath: string) {}

  /**
   * Build index from KnowledgeChunk array.
   */
  async build(chunks: KnowledgeChunk[]): Promise<void> {
    this.records.clear();
    const records: KeywordIndexRecord[] = [];

    for (const chunk of chunks) {
      const record: KeywordIndexRecord = {
        id: chunk.id,
        chunkId: chunk.id,
        subject: chunk.subject,
        topic: chunk.topic,
        title: chunk.title,
        sectionPath: chunk.sectionPath.join(' '),
        contentType: chunk.contentType,
        keywords: chunk.keywords.join(' '),
        text: chunk.text,
      };
      this.records.set(chunk.id, record);
      records.push(record);
    }

    this.miniSearch = new MiniSearch<KeywordIndexRecord>({
      fields: ['title', 'sectionPath', 'keywords', 'text', 'contentType'],
      storeFields: ['chunkId', 'subject', 'topic'],
      searchOptions: {
        boost: { title: 3, keywords: 2, sectionPath: 1.5, text: 1 },
        fuzzy: 0.2,
        prefix: true,
      },
    });

    await this.miniSearch.addAllAsync(records);
  }

  /**
   * Search the keyword index.
   */
  search(query: string, topK: number = 10): KeywordSearchResult[] {
    if (!this.miniSearch) return [];

    // Use OR logic for better recall with CJK queries
    const results = this.miniSearch.search(query, {
      combineWith: 'OR',
    });

    return results.slice(0, topK).map((r) => ({
      chunkId: r.id,
      score: r.score,
    }));
  }

  /**
   * Save index to disk as JSON.
   */
  async save(): Promise<void> {
    if (!this.miniSearch) return;
    await mkdir(dirname(this.indexPath), { recursive: true });
    const data = {
      index: this.miniSearch.toJSON(),
      records: Object.fromEntries(this.records),
    };
    await writeFile(this.indexPath, JSON.stringify(data), 'utf-8');
  }

  /**
   * Load index from disk.
   */
  async load(): Promise<boolean> {
    try {
      const raw = await readFile(this.indexPath, 'utf-8');
      const data = JSON.parse(raw) as { index: unknown; records: Record<string, KeywordIndexRecord> };
      this.records = new Map(Object.entries(data.records));
      this.miniSearch = MiniSearch.loadJSON(JSON.stringify(data.index), {
        fields: ['title', 'sectionPath', 'keywords', 'text', 'contentType'],
        storeFields: ['chunkId', 'subject', 'topic'],
        searchOptions: {
          boost: { title: 3, keywords: 2, sectionPath: 1.5, text: 1 },
          fuzzy: 0.2,
          prefix: true,
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get a record by chunk ID.
   */
  getRecord(chunkId: string): KeywordIndexRecord | undefined {
    return this.records.get(chunkId);
  }
}
