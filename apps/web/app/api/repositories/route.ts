import { NextResponse } from 'next/server';
import { callCodeOrbitApi } from '../../../lib/codeorbit-api';
import { isSameOriginRequest, validSessionRequest } from '../../../lib/session';

export async function POST(request: Request): Promise<NextResponse> {
  if (!validSessionRequest(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  try {
    const body: unknown = await request.json();
    const response = await callCodeOrbitApi('/api/v1/repositories', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return NextResponse.json({ error: 'invalid_response' }, { status: 502 });
    }
    return NextResponse.json(payload, { status: response.status });
  } catch {
    return NextResponse.json({ error: 'api_unavailable' }, { status: 503 });
  }
}
