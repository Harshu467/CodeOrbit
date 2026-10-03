import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isValidWebSession } from '../../../../lib/session';
import { AnalysisSummary } from '../../../../src/components/analysis-summary';

export default async function AnalysisSummaryPage({
  params,
}: {
  readonly params: Promise<{ runId: string }>;
}) {
  const session = (await cookies()).get('codeorbit_session')?.value;
  if (!isValidWebSession(session)) redirect('/login');
  const { runId } = await params;
  return (
    <main className="page">
      <p>
        <Link href={`/analysis-runs/${encodeURIComponent(runId)}`}>← Analysis progress</Link>
      </p>
      <h1>Analysis results</h1>
      <AnalysisSummary runId={runId} />
    </main>
  );
}
