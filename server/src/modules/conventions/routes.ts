import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';
import { EXTRACT_RATE_LIMIT } from './constants.js';

/**
 * Conventions module — extract a repo's house-rules and turn the accepted
 * ones into a `repo-conventions` skill.
 *
 *   GET    /repos/:id/conventions          → list (accepted first, then confidence desc)
 *   POST   /repos/:id/conventions/extract  → run extraction, persist, return the new list
 *   PATCH  /repos/:id/conventions/:cid     → edit the rule text and/or accept
 *   DELETE /repos/:id/conventions/:cid     → reject (always deletes the row)
 *   POST   /repos/:id/conventions/skill    → create a skill from the accepted rows
 */

const ConventionParams = z.object({ id: z.string().uuid(), cid: z.string().uuid() });

const UpdateConventionBody = z.object({
  rule: z.string().min(1).optional(),
  accepted: z.boolean().optional(),
});

const CreateSkillBody = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  body: z.string().min(1),
});

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/conventions/extract',
    {
      schema: { params: IdParams },
      config: { rateLimit: EXTRACT_RATE_LIMIT },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.extract(workspaceId, req.params.id);
    },
  );

  app.patch(
    '/repos/:id/conventions/:cid',
    { schema: { params: ConventionParams, body: UpdateConventionBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const row = await service.update(workspaceId, req.params.id, req.params.cid, req.body);
      if (!row) throw new NotFoundError('Convention not found');
      return row;
    },
  );

  app.delete(
    '/repos/:id/conventions/:cid',
    { schema: { params: ConventionParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const ok = await service.reject(workspaceId, req.params.id, req.params.cid);
      if (!ok) throw new NotFoundError('Convention not found');
      return { ok: true };
    },
  );

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: CreateSkillBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.createSkill(workspaceId, req.params.id, req.body);
      reply.status(201);
      return skill;
    },
  );
}
