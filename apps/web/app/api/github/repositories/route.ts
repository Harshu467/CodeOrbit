import { NextResponse } from 'next/server';
import { callCodeOrbitApi } from '../../../../lib/codeorbit-api';
import { validSessionRequest } from '../../../../lib/session';

export async function GET(request: Request): Promise<NextResponse> {
  if (!validSessionRequest(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const response = await callCodeOrbitApi('/api/v1/integrations/github/repositories');
    if (!response.ok) return NextResponse.json({ error: 'repositories_unavailable' }, { status: response.status });
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ error: 'api_unavailable' }, { status: 503 });
  }
}
