import { NextResponse } from 'next/server';
import { callCodeOrbitApi } from '../../../../lib/codeorbit-api';
import { validSessionRequest } from '../../../../lib/session';

export async function GET(request: Request): Promise<NextResponse> {
  if (!validSessionRequest(request)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  try {
    const response = await callCodeOrbitApi('/api/v1/integrations/github/install', {
      redirect: 'manual',
    });
    const location = response.headers.get('location');
    if (response.status !== 302 || !location) {
      return NextResponse.redirect(new URL('/repositories/connect?status=unavailable', request.url));
    }
    return NextResponse.redirect(location, 302);
  } catch {
    return NextResponse.redirect(new URL('/repositories/connect?status=unavailable', request.url));
  }
}
