import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const SESSION_COOKIE = 'codeorbit_session';
const SESSION_SECONDS = 8 * 60 * 60;

function sessionSignature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(`codeorbit-web-session:${payload}`).digest('base64url');
}

export function createWebSession(): { readonly value: string; readonly maxAge: number } {
  const secret = process.env.SESSION_SECRET;
  if (!secret || !process.env.WEB_ACCESS_PASSWORD) {
    throw new Error('Web authentication is not configured.');
  }
  const payload = Buffer.from(
    JSON.stringify({ expiresAt: Math.floor(Date.now() / 1000) + SESSION_SECONDS, nonce: randomUUID() }),
  ).toString('base64url');
  return { value: `${payload}.${sessionSignature(payload, secret)}`, maxAge: SESSION_SECONDS };
}

export function isValidWebSession(value: string | undefined): boolean {
  const secret = process.env.SESSION_SECRET;
  if (!value || !secret || !process.env.WEB_ACCESS_PASSWORD) return false;
  const [payload, signature, extra] = value.split('.');
  if (!payload || !signature || extra) return false;
  const expected = Buffer.from(sessionSignature(payload, secret));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { expiresAt?: unknown };
    return typeof claims.expiresAt === 'number' && claims.expiresAt > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function sessionCookie(value: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookie(): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function validSessionRequest(request: Request): boolean {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const sessionValue = cookieHeader
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  return isValidWebSession(sessionValue);
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  return Boolean(origin && origin === new URL(request.url).origin);
}
