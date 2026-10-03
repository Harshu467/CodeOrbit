export interface RepositoryDto {
  readonly id: string;
  readonly displayName: string;
  readonly state: 'active' | 'disconnected';
  readonly createdAt: string;
}
