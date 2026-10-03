import type { WorkspaceId } from './ids.js';

export interface Principal {
  readonly userId: string;
  readonly workspaceId: WorkspaceId;
  readonly roles: readonly string[];
}

export function hasWorkspaceRole(principal: Principal, role: string): boolean {
  return principal.roles.includes(role);
}
