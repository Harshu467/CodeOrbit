'use client';

import { useEffect, useState } from 'react';

interface Repository {
  readonly id: string;
  readonly displayName: string;
  readonly state: 'active' | 'disconnected';
  readonly createdAt: string;
}

export function RepositoryList() {
  const [repositories, setRepositories] = useState<readonly Repository[]>([]);
  const [message, setMessage] = useState('Loading repositories…');
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch('/api/repositories')
      .then(async (response) => {
        if (!response.ok) throw new Error('Repository listing unavailable.');
        return (await response.json()) as { items: Repository[] };
      })
      .then(({ items }) => {
        if (!active) return;
        setRepositories(items);
        setMessage(items.length ? '' : 'No repositories connected yet.');
      })
      .catch(() => {
        if (active) setMessage('Repositories could not be loaded. Check the API configuration.');
      });
    return () => {
      active = false;
    };
  }, []);

  async function startAnalysis(repository: Repository) {
    setStarting(repository.id);
    setMessage('');
    try {
      const response = await fetch(
        `/api/repositories/${encodeURIComponent(repository.id)}/analysis-runs`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      if (!response.ok) throw new Error('Analysis could not be started.');
      const run = (await response.json()) as { id: string; reused?: boolean };
      window.location.assign(
        `/analysis-runs/${encodeURIComponent(run.id)}${run.reused ? '?reused=true' : ''}`,
      );
    } catch {
      setMessage('Analysis could not be started. Check repository access and try again.');
    } finally {
      setStarting(null);
    }
  }

  if (message) return <p role="status">{message}</p>;
  return (
    <ul className="repository-list">
      {repositories.map((repository) => (
        <li className="panel" key={repository.id}>
          <h2>{repository.displayName}</h2>
          <p>Status: {repository.state}</p>
          <time dateTime={repository.createdAt}>{new Date(repository.createdAt).toLocaleString()}</time>
          <p>
            <button
              type="button"
              onClick={() => void startAnalysis(repository)}
              disabled={starting !== null || repository.state !== 'active'}
            >
              {starting === repository.id ? 'Starting analysis…' : 'Analyze repository'}
            </button>
          </p>
        </li>
      ))}
    </ul>
  );
}
