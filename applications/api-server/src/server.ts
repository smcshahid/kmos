/**
 * KMOS HTTP API server — node:http only (zero runtime dependencies).
 *
 * Exposes canonical business operations over REST (KMOS-0180) and serves the
 * reference web UI. It composes the platform through the same business APIs the
 * applications use; it contains no business logic. Actor/organization are read
 * from request headers (x-kmos-actor, x-kmos-organization) and echoed for
 * attribution; production wires these into an enforcing CallContext.
 */
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { isKmosError, KmosError } from '@kmos/canonical-kernel';
import { createPlatform, type KmosPlatform } from './platform.js';
import { REFERENCE_UI_HTML } from './ui.js';

type Handler = (ctx: ReqCtx) => Promise<unknown> | unknown;
interface ReqCtx {
  readonly platform: KmosPlatform;
  readonly params: Record<string, string>;
  readonly query: URLSearchParams;
  readonly body: any;
  readonly actorId?: string;
  readonly organizationId?: string;
}
interface Route { method: string; pattern: RegExp; keys: string[]; handler: Handler; }

function route(method: string, path: string, handler: Handler): Route {
  const keys: string[] = [];
  const pattern = new RegExp('^' + path.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) + '$');
  return { method, pattern, keys, handler };
}

function statusFor(err: unknown): number {
  if (isKmosError(err)) {
    switch (err.category) {
      case 'Validation': case 'BusinessRule': return 400;
      case 'Authentication': return 401;
      case 'Authorization': return 403;
      case 'NotFound': return 404;
      case 'Conflict': return 409;
      default: return 500;
    }
  }
  return 500;
}

export function buildRoutes(): Route[] {
  return [
    route('GET', '/health', async ({ platform }) => ({ status: 'ok', events: await platform.bus.eventLog.size(), deadLetters: platform.bus.getDeadLetters().length })),

    route('POST', '/organizations', async ({ platform, body }) => platform.identity.createOrganization(String(body?.name ?? 'Organization'))),
    route('POST', '/identities', async ({ platform, body }) => platform.identity.createIdentity({ kind: body?.kind ?? 'Human', displayName: String(body?.displayName ?? 'User'), organizationId: body?.organizationId })),

    route('POST', '/knowledge', ({ platform, body, organizationId }) => platform.knowledge.createKnowledge({
      category: body?.category ?? 'Concept', canonicalName: String(body?.canonicalName), definition: String(body?.definition ?? ''),
      primaryLanguage: String(body?.primaryLanguage ?? 'en'), organizationId: body?.organizationId ?? organizationId,
    })),
    route('GET', '/knowledge', ({ platform, query }) => platform.studio.find(String(query.get('q') ?? ''))),
    route('GET', '/knowledge/:id', ({ platform, params }) => {
      const d = platform.studio.conceptDetail(params.id!);
      if (!d) throw notFound('KnowledgeObject', params.id!);
      return d;
    }),

    route('POST', '/lectures', ({ platform, body, organizationId }) => platform.media.preserveLecture({
      title: String(body?.title ?? 'Lecture'), audioRef: String(body?.audioRef ?? `kmos:Asset:audio-${Date.now()}`),
      checksum: 'sha256:seed', organizationId: body?.organizationId ?? organizationId,
    })),
    route('POST', '/transcripts', ({ platform, body, organizationId }) => platform.language.processTranscript({
      transcript: String(body?.transcript ?? ''), targetLanguage: body?.targetLanguage, organizationId: body?.organizationId ?? organizationId,
    })),

    route('GET', '/assets/:id', ({ platform, params }) => platform.explorer.getAssetView(params.id!)),
    route('GET', '/assets/:id/lineage', ({ platform, params }) => platform.explorer.lineageView(params.id!)),

    route('POST', '/publications', ({ platform, body, organizationId }) => platform.publishing.publish({
      title: String(body?.title ?? 'Publication'), knowledgeIds: body?.knowledgeIds ?? [], assetIds: body?.assetIds ?? [],
      approver: String(body?.approver ?? 'Editor'), organizationId: body?.organizationId ?? organizationId,
    })),
    route('POST', '/preservations', ({ platform, body, organizationId }) => platform.preservation.preserve({
      assetIds: body?.assetIds ?? [], organizationId: body?.organizationId ?? organizationId,
    })),

    route('GET', '/governance/trust/:subjectId', ({ platform, params, query }) => platform.governance.assessTrust({
      subjectId: params.subjectId!,
      evidence: {
        knowledgeProvenance: query.get('knowledgeProvenance') !== 'false',
        assetIntegrity: query.get('assetIntegrity') !== 'false',
        reviewerApproval: query.get('reviewerApproval') !== 'false',
        identityVerification: query.get('identityVerification') !== 'false',
        policyCompliance: query.get('policyCompliance') !== 'false',
      },
    })),

    route('GET', '/events/metrics', async ({ platform }) => platform.events.getEventMetrics()),
    route('GET', '/events/correlation/:id', async ({ platform, params }) =>
      (await platform.events.getCorrelationChain(params.id!)).map((s) => ({ type: s.event.identity.type, producer: s.event.identity.producer, time: s.event.identity.time }))),
  ];
}

function notFound(type: string, id: string): KmosError {
  return new KmosError(`${type} not found: ${id}`, { category: 'NotFound', code: `${type.toLowerCase()}.not_found`, subject: id });
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(undefined);
      try { resolve(JSON.parse(raw)); } catch { reject(new KmosError('Invalid JSON body', { category: 'Validation', code: 'request.body.invalid_json' })); }
    });
    req.on('error', reject);
  });
}

export interface ApiServerOptions { readonly platform?: KmosPlatform; }

export function createApiServer(options: ApiServerOptions = {}): Server {
  const platform = options.platform ?? createPlatform();
  const routes = buildRoutes();

  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const send = (status: number, obj: unknown) => {
      const payload = JSON.stringify(obj, null, 2);
      res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' });
      res.end(payload);
    };
    try {
      if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }); return res.end(); }
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/ui')) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(REFERENCE_UI_HTML);
      }
      if (req.method === 'GET' && url.pathname === '/metrics') {
        const m = await platform.events.getEventMetrics();
        const lines = [
          '# KMOS platform metrics (Prometheus text exposition)',
          '# HELP kmos_events_total Total canonical events published.',
          '# TYPE kmos_events_total counter',
          `kmos_events_total ${m.totalEvents}`,
          '# HELP kmos_dead_letters Total dead-lettered deliveries.',
          '# TYPE kmos_dead_letters gauge',
          `kmos_dead_letters ${platform.bus.getDeadLetters().length}`,
          '# HELP kmos_subscriptions Active subscriptions.',
          '# TYPE kmos_subscriptions gauge',
          `kmos_subscriptions ${m.subscriptions}`,
          '# HELP kmos_events_by_type Canonical events by type.',
          '# TYPE kmos_events_by_type counter',
          ...Object.entries(m.byType).map(([t, n]) => `kmos_events_by_type{type="${t}"} ${n}`),
        ];
        res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' }); return res.end(lines.join('\n') + '\n');
      }
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = r.pattern.exec(url.pathname);
        if (!m) continue;
        const params: Record<string, string> = {};
        r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1]!)));
        const body = (req.method === 'POST' || req.method === 'PUT') ? await readBody(req) : undefined;
        const ctx: ReqCtx = {
          platform, params, query: url.searchParams, body,
          actorId: (req.headers['x-kmos-actor'] as string) || undefined,
          organizationId: (req.headers['x-kmos-organization'] as string) || undefined,
        };
        const result = await r.handler(ctx);
        return send(200, result);
      }
      send(404, { error: 'Not found', path: url.pathname });
    } catch (err) {
      send(statusFor(err), { error: err instanceof Error ? err.message : String(err), category: isKmosError(err) ? err.category : 'Internal' });
    }
  });
}
