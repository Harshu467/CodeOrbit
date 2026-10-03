'use client';

import { useEffect, useState, type FormEvent } from 'react';

interface GitHubRepositoryChoice {
  readonly providerRepositoryId: string;
  readonly fullName: string;
  readonly uri: string;
}

export function RepositoryConnectForm() {
  const [repositories, setRepositories] = useState<readonly GitHubRepositoryChoice[]>([]);
  const [selectedUri, setSelectedUri] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch('/api/github/repositories')
      .then(async (response) => {
        if (!response.ok) throw new Error('GitHub repositories are unavailable.');
        return (await response.json()) as { items: GitHubRepositoryChoice[] };
      })
      .then(({ items }) => {
        if (active) {
          setRepositories(items);
          setSelectedUri(items[0]?.uri ?? '');
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
          setMessage('Connect a GitHub App installation to load authorized repositories.');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(false);
    setMessage('');
    const response = await fetch('/api/repositories', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: { provider: 'github', uri: selectedUri } }),
    });
    if (!response.ok) {
      setError(true);
      setMessage('The repository could not be connected. Confirm it is authorized by this installation.');
      return;
    }
    setMessage('Repository connected.');
  }

  return (
    <section className="panel" aria-labelledby="installation-heading">
      <h2 id="installation-heading">GitHub App installation</h2>
      <p>Only repositories selected for the installation are available to CodeOrbit.</p>
      <a className="button" href="/api/github/install">Install or select repositories</a>
      <form onSubmit={connect}>
        <label htmlFor="repository">Authorized repository</label>
        <select
          id="repository"
          value={selectedUri}
          onChange={(event) => setSelectedUri(event.target.value)}
          disabled={repositories.length === 0}
          required
        >
          {repositories.map((repository) => (
            <option key={repository.providerRepositoryId} value={repository.uri}>
              {repository.fullName}
            </option>
          ))}
        </select>
        <button type="submit" disabled={!selectedUri}>Connect repository</button>
      </form>
      {message && <p className={error ? 'error' : 'notice'} role={error ? 'alert' : 'status'}>{message}</p>}
    </section>
  );
}
