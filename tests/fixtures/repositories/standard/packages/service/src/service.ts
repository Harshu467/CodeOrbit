export interface Base {
  id: string;
}

export class Service extends Base {
  getName(): string {
    return helper();
  }
}

export type ServiceName = string;

export function helper(): string {
  return 'service';
}

export const serviceVersion = '1';
