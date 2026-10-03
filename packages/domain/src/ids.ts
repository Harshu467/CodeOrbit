import { randomUUID } from 'node:crypto';

export type EntityId = string & { readonly __brand: 'EntityId' };
export type WorkspaceId = string & { readonly __brand: 'WorkspaceId' };

export function createId(): EntityId {
  return randomUUID() as EntityId;
}

export function parseId(value: string): EntityId {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)) {
    throw new TypeError('Invalid entity identifier.');
  }
  return value as EntityId;
}

export function parseWorkspaceId(value: string): WorkspaceId {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value)) {
    throw new TypeError('Invalid workspace identifier.');
  }
  return value as WorkspaceId;
}
