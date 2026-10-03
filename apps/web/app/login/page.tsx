import { LoginForm } from '../../src/components/login-form';

export default function LoginPage() {
  return (
    <main className="page">
      <h1>Sign in to CodeOrbit</h1>
      <p>Use the workspace access password configured by your administrator.</p>
      <LoginForm />
    </main>
  );
}
