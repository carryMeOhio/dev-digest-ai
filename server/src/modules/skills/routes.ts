import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillSource, SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { SkillsService } from './service.js';
import { MAX_ARCHIVE_BYTES } from './constants.js';

/**
 * Skills module.
 *   GET    /skills                 → list (workspace-scoped)
 *   GET    /skills/:id             → one skill
 *   POST   /skills                 → create
 *   PUT    /skills/:id             → update (any content edit bumps version)
 *   DELETE /skills/:id             → delete (agent links cascade)
 *   GET    /skills/:id/versions    → content history (newest first)
 *   POST   /skills/:id/versions/:version/restore → restore as a NEW version
 *   GET    /skills/:id/stats       → usage rollup + linked agents
 *   POST   /skills/import/preview  → parse an upload; PERSISTS NOTHING
 */

const CreateSkillBody = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  type: SkillType,
  body: z.string().min(1),
  source: SkillSource.optional(),
  enabled: z.boolean().optional(),
});

const UpdateSkillBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  type: SkillType.optional(),
  body: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
});

/**
 * Upload transport. The file travels base64-encoded inside a normal JSON body
 * rather than as multipart: it keeps the one typed fetch client on the web side
 * and keeps Zod validating the body, for a route that runs a handful of times a
 * day. The decoded bytes are size-checked below and inside the parser.
 */
const ImportPreviewBody = z.object({
  filename: z.string().min(1).max(512),
  // Validated as base64 HERE, because `Buffer.from(s, 'base64')` never throws —
  // it silently drops characters it does not recognise, so malformed input would
  // otherwise reach the parser as plausible-looking garbage.
  content_b64: z.string().min(1).base64(),
});

/** `/skills/:id/versions/:version` — id is a uuid, version a positive integer. */
const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

/**
 * Body cap for the import route only. The app-wide limit is 1 MB (app.ts); an
 * archive plus base64's ~33% overhead needs more headroom than that.
 */
const IMPORT_BODY_LIMIT = 8 * 1024 * 1024;

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.post('/skills', { schema: { body: CreateSkillBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const b = req.body;
    const skill = await service.create(workspaceId, {
      name: b.name,
      description: b.description,
      type: b.type,
      body: b.body,
      ...(b.source !== undefined ? { source: b.source } : {}),
      ...(b.enabled !== undefined ? { enabled: b.enabled } : {}),
    });
    reply.status(201);
    return skill;
  });

  app.put('/skills/:id', { schema: { params: IdParams, body: UpdateSkillBody } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.update(workspaceId, req.params.id, req.body);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const versions = await service.listVersions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Skill not found');
    return versions;
  });

  app.post(
    '/skills/:id/versions/:version/restore',
    { schema: { params: VersionParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.restoreVersion(workspaceId, req.params.id, req.params.version);
      if (!skill) throw new NotFoundError('Skill version not found');
      return skill;
    },
  );

  app.get('/skills/:id/stats', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const stats = await service.stats(workspaceId, req.params.id);
    if (!stats) throw new NotFoundError('Skill not found');
    return stats;
  });

  app.post(
    '/skills/import/preview',
    {
      schema: { body: ImportPreviewBody },
      bodyLimit: IMPORT_BODY_LIMIT,
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (req) => {
      // Auth gate: an import must still be a request from a real workspace.
      await getContext(app.container, req);

      const bytes = Buffer.from(req.body.content_b64, 'base64');
      if (bytes.length === 0) throw new ValidationError('The uploaded file is empty.');
      if (bytes.length > MAX_ARCHIVE_BYTES) {
        throw new ValidationError(
          `That file is larger than the ${Math.round(MAX_ARCHIVE_BYTES / 1024)} KB import limit.`,
        );
      }

      return service.previewImport(req.body.filename, new Uint8Array(bytes));
    },
  );
}
