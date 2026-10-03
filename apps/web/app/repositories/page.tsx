import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isValidWebSession } from '../../lib/session';
import { RepositoryList } from '../../src/components/repository-list';

export default async function RepositoriesPage() {
  const session = (await cookies()).get('codeorbit_session')?.value;
  if (!isValidWebSession(session)) redirect('/login');
  return (
    <main className="page">
      <header className="page-header">
        <div>
          <h1>Repositories</h1>
          <p>Connected source repositories in this workspace.</p>
        </div>
        <Link className="button" href="/repositories/connect">
          Connect repository
        </Link>
      </header>
      <RepositoryList />
    </main>
  );
}
