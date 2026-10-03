import { redactLogFields } from '@codeorbit/domain/observability';

export const safeLogger = {
  info(fields: Record<string, unknown>, message: string): void {
    console.info(JSON.stringify({ level: 'info', ...redactLogFields(fields), message }));
  },
  error(fields: Record<string, unknown>, message: string): void {
    console.error(JSON.stringify({ level: 'error', ...redactLogFields(fields), message }));
  },
};
