import RagSurfacePage from '@/features/rag/ui/RagSurfacePage';

type LearnRunPageProps = { params: Promise<{ runId: string }> };

export default async function LearnRunPage({ params }: LearnRunPageProps) {
  const { runId } = await params;
  return <RagSurfacePage mode="student" initialRunId={runId} />;
}
