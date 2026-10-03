'use client';

import { useState, type FormEvent } from 'react';

export function LoginForm() {
  const [error, setError] = useState('');

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const formData = new FormData(event.currentTarget);
    const response = await fetch('/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: formData.get('password') }),
    });
    if (!response.ok) {
      setError('Sign-in failed. Check the workspace access password.');
      return;
    }
    window.location.assign('/repositories');
  }

  return (
    <form className="panel" onSubmit={signIn}>
      <label htmlFor="password">Workspace access password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required />
      <button type="submit">Sign in</button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}
