import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isValidWebSession } from '../../../lib/session';
import { AnalysisProgress } from '../../../src/components/analysis-progress';

interface AnalysisRunPageProps {
  readonly params: Promise<{ runId: string }>;
  readonly searchParams: Promise<{ reused?: string }>;
}

export default async function AnalysisRunPage({ params, searchParams }: AnalysisRunPageProps) {
  const session = (await cookies()).get('codeorbit_session')?.value;
  if (!isValidWebSession(session)) redirect('/login');
  const [{ runId }, { reused }] = await Promise.all([params, searchParams]);
  return (
    <main className="page">
      <p><Link href="/repositories">← Repositories</Link></p>
      <h1>Repository analysis</h1>
      <AnalysisProgress runId={runId} reused={reused === 'true'} />
    </main>
  );
}
