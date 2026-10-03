import { afterEach, describe, expect, it } from 'vitest';
import { createWebSession, isValidWebSession, sessionCookie, validSessionRequest } from '../../apps/web/lib/session';

const originalSecret = process.env.SESSION_SECRET;
const originalPassword = process.env.WEB_ACCESS_PASSWORD;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSecret;
  if (originalPassword === undefined) delete process.env.WEB_ACCESS_PASSWORD;
  else process.env.WEB_ACCESS_PASSWORD = originalPassword;
});

describe('web session', () => {
  it('creates an HttpOnly session and rejects tampered or absent values', () => {
    process.env.SESSION_SECRET = 'session-signing-secret-long-enough';
    process.env.WEB_ACCESS_PASSWORD = 'workspace-password';
    const session = createWebSession();

    expect(isValidWebSession(session.value)).toBe(true);
    expect(sessionCookie(session.value, session.maxAge)).toContain('HttpOnly');
    expect(isValidWebSession(`${session.value}x`)).toBe(false);
    expect(isValidWebSession(undefined)).toBe(false);
    expect(
      validSessionRequest(
        new Request('https://codeorbit.example/repositories', {
          headers: { cookie: `codeorbit_session=${session.value}` },
        }),
      ),
    ).toBe(true);
  });
});
