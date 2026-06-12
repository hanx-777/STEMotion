import { askRag } from '../src/features/rag/lib/rag_pipeline';

async function main() {
  const subject = getArg('--subject') ?? 'physics_mechanics';
  const question = getArg('--question') ?? '一个小球以20m/s初速度、30度角斜抛，求最大高度和射程';
  const taskType = getArg('--task') as 'knowledge_qa' | 'step_solution' | 'misconception_diagnosis' | 'teacher_prep' | undefined;
  const useWebSearch = process.argv.includes('--web');
  const result = await askRag({ question, subject, task_type: taskType, use_web_search: useWebSearch });

  console.log(JSON.stringify(result, null, 2));
}

function getArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
