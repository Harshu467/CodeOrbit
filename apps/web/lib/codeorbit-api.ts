export function codeOrbitApiConfig(): {
  readonly baseUrl: string;
  readonly token: string;
  readonly workspaceId: string;
} | null {
  const token = process.env.API_AUTH_TOKEN;
  const workspaceId = process.env.CODEORBIT_WORKSPACE_ID;
  if (!token || !workspaceId) return null;
  return {
    baseUrl: process.env.API_BASE_URL ?? 'http://localhost:4000',
    token,
    workspaceId,
  };
}

export async function callCodeOrbitApi(path: string, init?: RequestInit): Promise<Response> {
  const config = codeOrbitApiConfig();
  if (!config) throw new Error('The CodeOrbit API connection is not configured.');
  return fetch(new URL(path, config.baseUrl), {
    ...init,
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${config.token}`,
      'x-workspace-id': config.workspaceId,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
}
