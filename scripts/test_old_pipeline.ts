import { planRagQuery } from '../src/lib/rag/query_planner';
import { retrieveHybridChunks } from '../src/lib/rag/retriever';
import { SubjectManager } from '../src/lib/subjects/subject_manager';

async function test() {
  const manager = new SubjectManager();
  const plan = planRagQuery('斜抛运动最大高度公式是什么', 'step_solution');
  console.log('Query plan:', plan);
  const result = await retrieveHybridChunks(plan, 'physics_mechanics', manager);
  console.log('\nOld pipeline results:', result.chunks.length);
  for (const c of result.chunks) {
    console.log(`  ${c.score} | ${c.metadata.source} | ${c.content.slice(0, 50)}`);
  }
}
test();
