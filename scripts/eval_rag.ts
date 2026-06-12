import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { HybridRetriever } from '../src/features/rag/lib/hybrid_retriever';

interface EvalCase {
  query: string;
  subject: string;
  expectedTopics: string[];
  expectedContentTypes: string[];
  mustContain: string[];
  shouldRetrieve: string[];
}

interface SubjectReport {
  subject: string;
  queries: number;
  subjectAccuracy: number;
  topicHitAt5: number;
  emptyResultRate: number;
  avgRetrievalTimeMs: number;
  avgChunkCount: number;
  mustContainHitRate: number;
}

const EVAL_DIR = join(process.cwd(), 'rag_eval');
const SKILLS_ROOT = join(process.cwd(), 'skills');

async function loadEvalCases(subject: string): Promise<EvalCase[]> {
  const filePath = join(EVAL_DIR, `${subject}.eval.json`);
  try {
    return JSON.parse(await readFile(filePath, 'utf-8')) as EvalCase[];
  } catch {
    return [];
  }
}

async function evaluateSubject(subject: string): Promise<SubjectReport> {
  const cases = await loadEvalCases(subject);
  if (cases.length === 0) {
    return { subject, queries: 0, subjectAccuracy: 0, topicHitAt5: 0, emptyResultRate: 0, avgRetrievalTimeMs: 0, avgChunkCount: 0, mustContainHitRate: 0 };
  }

  const kbPath = join(SKILLS_ROOT, subject, 'knowledge_base');
  const retriever = new HybridRetriever(kbPath, subject);

  let subjectCorrect = 0;
  let topicHits = 0;
  let emptyResults = 0;
  let totalTime = 0;
  let totalChunks = 0;
  let mustContainHits = 0;

  for (const testCase of cases) {
    const start = performance.now();
    const results = await retriever.retrieve(testCase.query, { topK: 5 });
    const elapsed = performance.now() - start;
    totalTime += elapsed;
    totalChunks += results.length;

    // Subject accuracy: all results should be from the expected subject
    const allCorrectSubject = results.every((r) => r.chunk.subject === testCase.subject);
    if (allCorrectSubject || results.length === 0) subjectCorrect++;

    // Topic hit@5: at least one result from expected topics
    if (testCase.expectedTopics.length > 0) {
      const hasTopic = results.some((r) => testCase.expectedTopics.includes(r.chunk.topic));
      if (hasTopic) topicHits++;
    } else {
      topicHits++; // no expectation, counts as hit
    }

    // Empty result rate
    if (results.length === 0) emptyResults++;

    // Must-contain: at least one mustContain term appears in results
    if (testCase.mustContain.length > 0) {
      const resultText = results.map((r) => r.chunk.text).join(' ');
      const allPresent = testCase.mustContain.every((term) => resultText.includes(term));
      if (allPresent) mustContainHits++;
    } else {
      mustContainHits++;
    }
  }

  return {
    subject,
    queries: cases.length,
    subjectAccuracy: Number((subjectCorrect / cases.length * 100).toFixed(1)),
    topicHitAt5: Number((topicHits / cases.length * 100).toFixed(1)),
    emptyResultRate: Number((emptyResults / cases.length * 100).toFixed(1)),
    avgRetrievalTimeMs: Number((totalTime / cases.length).toFixed(1)),
    avgChunkCount: Number((totalChunks / cases.length).toFixed(1)),
    mustContainHitRate: Number((mustContainHits / cases.length * 100).toFixed(1)),
  };
}

async function main() {
  const evalFiles = await readdir(EVAL_DIR);
  const subjects = evalFiles
    .filter((f) => f.endsWith('.eval.json'))
    .map((f) => f.replace('.eval.json', ''));

  if (subjects.length === 0) {
    console.error('No evaluation files found in rag_eval/');
    process.exitCode = 1;
    return;
  }

  console.log('RAG Evaluation Report');
  console.log('='.repeat(50));

  for (const subject of subjects) {
    const report = await evaluateSubject(subject);
    console.log(`\n${report.subject}:`);
    console.log(`  queries: ${report.queries}`);
    console.log(`  subject accuracy: ${report.subjectAccuracy}%`);
    console.log(`  topic hit@5: ${report.topicHitAt5}%`);
    console.log(`  must-contain hit: ${report.mustContainHitRate}%`);
    console.log(`  empty result rate: ${report.emptyResultRate}%`);
    console.log(`  avg retrieval time: ${report.avgRetrievalTimeMs}ms`);
    console.log(`  avg chunk count: ${report.avgChunkCount}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
