import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isValidWebSession } from '../../../lib/session';
import { RepositoryConnectForm } from '../../../src/components/repository-connect-form';

interface ConnectPageProps {
  readonly searchParams: Promise<{ status?: string }>;
}

export default async function ConnectRepositoryPage({ searchParams }: ConnectPageProps) {
  const { status } = await searchParams;
  const session = (await cookies()).get('codeorbit_session')?.value;
  if (!isValidWebSession(session)) redirect('/login');
  return (
    <main className="page">
      <p><Link href="/repositories">← Repositories</Link></p>
      <h1>Connect a GitHub repository</h1>
      {status === 'connected' && (
        <p className="notice" role="status">GitHub installation connected. Choose an authorized repository below.</p>
      )}
      {status === 'unavailable' && (
        <p className="error" role="alert">GitHub setup is unavailable. Check the API and workspace configuration.</p>
      )}
      <RepositoryConnectForm />
    </main>
  );
}
