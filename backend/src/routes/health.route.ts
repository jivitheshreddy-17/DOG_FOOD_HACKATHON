import { FastifyInstance } from 'fastify';
import { successResponse } from '../core/responses';

export async function healthRoute(app: FastifyInstance) {
  app.get('/health', async () => {
    return successResponse({
      status: 'ok',
    });
  });
}
