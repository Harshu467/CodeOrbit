import { Service } from '../packages/service/src/service.js';

export function createService() {
  return new Service();
}

const healthHandler = () => 'ok';
app.get('/health', healthHandler);
