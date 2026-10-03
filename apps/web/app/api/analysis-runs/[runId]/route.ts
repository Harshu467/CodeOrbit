import { NextResponse } from 'next/server';
import { callCodeOrbitApi } from '../../../../lib/codeorbit-api';
import { validSessionRequest } from '../../../../lib/session';

interface RouteContext {
  readonly params: Promise<{ runId: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  if (!validSessionRequest(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const { runId } = await context.params;
    const response = await callCodeOrbitApi(
      `/api/v1/analysis-runs/${encodeURIComponent(runId)}`,
    );
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
