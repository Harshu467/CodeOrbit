import { NextResponse } from 'next/server';
import { callCodeOrbitApi } from '../../../../../lib/codeorbit-api';
import { isSameOriginRequest, validSessionRequest } from '../../../../../lib/session';

interface RouteContext {
  readonly params: Promise<{ repositoryId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  if (!validSessionRequest(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  try {
    const { repositoryId } = await context.params;
    const body: unknown = await request.json();
    const response = await callCodeOrbitApi(
      `/api/v1/repositories/${encodeURIComponent(repositoryId)}/analysis-runs`,
      { method: 'POST', body: JSON.stringify(body) },
    );
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return NextResponse.json({ error: 'invalid_response' }, { status: 502 });
    }
    const result = NextResponse.json(payload, { status: response.status });
    const location = response.headers.get('location');
    if (location) result.headers.set('location', location);
    return result;
  } catch {
    return NextResponse.json({ error: 'api_unavailable' }, { status: 503 });
  }
}
