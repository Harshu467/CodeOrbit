import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  clearSessionCookie,
  createWebSession,
  isSameOriginRequest,
  sessionCookie,
} from '../../../lib/session';

function matchesPassword(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const expected = process.env.WEB_ACCESS_PASSWORD;
  if (!expected) return NextResponse.json({ error: 'authentication_unavailable' }, { status: 503 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  const password =
    typeof body === 'object' && body !== null && 'password' in body && typeof body.password === 'string'
      ? body.password
      : '';
  if (!matchesPassword(password, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const session = createWebSession();
    return NextResponse.json(
      { status: 'authenticated' },
      { headers: { 'set-cookie': sessionCookie(session.value, session.maxAge) } },
    );
  } catch {
    return NextResponse.json({ error: 'authentication_unavailable' }, { status: 503 });
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return NextResponse.json(
    { status: 'signed_out' },
    { headers: { 'set-cookie': clearSessionCookie() } },
  );
}
