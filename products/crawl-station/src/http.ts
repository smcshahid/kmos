/**
 * CrawlStation HTTP server (node:http, zero runtime deps).
 *
 * A thin transport over {@link CrawlService}: it parses requests, calls the application
 * service, and serves the single-page UI. No business logic here (KMOS-9999 §9).
 */

import http from 'node:http';
import type { CrawlService, CrawlSubmitInput } from './crawl-service.js';
import type { CrawlConfig, CrawlJob, PageRecord } from './types.js';
import { CRAWL_STATION_HTML } from './web.js';
import { SAMPLE_SEED, SAMPLE_NOTE } from './sample.js';

export interface CrawlServerOptions {
  readonly service: CrawlService;
}

export function createCrawlServer(opts: CrawlServerOptions): http.Server {
  const service = opts.service;
  return http.createServer((req, res) => {
    void handle(req, res, service).catch((err: unknown) => {
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    });
  });
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse, service: CrawlService): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;
  const method = req.method ?? 'GET';
  const seg = path.split('/').filter(Boolean); // e.g. ['api','crawls',':id']

  // --- UI + health + sample ---
  if (method === 'GET' && path === '/') return sendHtml(res, 200, CRAWL_STATION_HTML);
  if (method === 'GET' && path === '/health') return sendJson(res, 200, { status: 'ok', crawls: service.listJobs().length });
  if (method === 'GET' && path === '/api/sample') return sendJson(res, 200, { seedUrl: SAMPLE_SEED, note: SAMPLE_NOTE });
  if (method === 'GET' && path === '/api/dashboard') return sendJson(res, 200, service.dashboard());

  // --- Search ---
  if (method === 'GET' && path === '/api/search') {
    return sendJson(res, 200, service.search(url.searchParams.get('q') ?? ''));
  }

  // --- Crawls ---
  if (seg[0] === 'api' && seg[1] === 'crawls') {
    if (method === 'POST' && seg.length === 2) {
      const body = await readJson(req);
      const input: CrawlSubmitInput = {
        seedUrl: String(body?.seedUrl ?? '').trim(),
        ...(body?.config && typeof body.config === 'object' ? { config: parseConfig(body.config as Record<string, unknown>) } : {}),
      };
      if (!input.seedUrl) return sendJson(res, 400, { error: 'A seed URL is required.' });
      const job = await service.submit(input);
      return sendJson(res, 202, { id: job.id, status: job.status });
    }
    if (method === 'GET' && seg.length === 2) {
      return sendJson(res, 200, service.summaries());
    }
    const id = seg[2];
    if (method === 'GET' && id && seg.length === 3) {
      const job = service.getJob(id);
      return job ? sendJson(res, 200, summarizeJob(job)) : sendJson(res, 404, { error: 'Crawl not found' });
    }
    if (method === 'POST' && id && seg[3] === 'retry') {
      const job = await service.retry(id);
      return job ? sendJson(res, 202, { id: job.id, status: job.status }) : sendJson(res, 404, { error: 'Crawl not found' });
    }
    if (method === 'POST' && id && seg[3] === 'cancel') {
      const ok = service.cancel(id);
      return sendJson(res, ok ? 200 : 409, { cancelled: ok });
    }
    if (method === 'POST' && id && seg[3] === 'favorite') {
      const job = await service.toggleFavorite(id);
      return job ? sendJson(res, 200, { id: job.id, favorite: job.favorite }) : sendJson(res, 404, { error: 'Crawl not found' });
    }
    if (method === 'GET' && id && seg[3] === 'pages' && seg[4]) {
      const view = service.pageView(id, seg[4]);
      return view ? sendJson(res, 200, view) : sendJson(res, 404, { error: 'Page not found' });
    }
    if (method === 'GET' && id && seg[3] === 'export.json') {
      const job = service.getJob(id);
      if (!job) return sendJson(res, 404, { error: 'Crawl not found' });
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${id}-knowledge.json"`,
      });
      return void res.end(JSON.stringify(exportPackage(service, job), null, 2));
    }
  }

  sendJson(res, 404, { error: `No route for ${method} ${path}` });
}

/** The polled job shape: full stats/activity, but per-page rows kept light (the drawer
 *  fetches the full page view on demand). */
function summarizeJob(job: CrawlJob): Record<string, unknown> {
  return {
    id: job.id, title: job.title, seedUrl: job.seedUrl, site: job.site,
    status: job.status, error: job.error ?? null, favorite: job.favorite,
    config: job.config, stats: job.stats, activity: job.activity,
    sitemaps: job.sitemaps ?? [],
    createdAt: job.createdAt, startedAt: job.startedAt ?? null, finishedAt: job.finishedAt ?? null,
    pages: job.pages.map(lightPage),
  };
}

function lightPage(p: PageRecord): Record<string, unknown> {
  return {
    id: p.id, url: p.url, canonicalUrl: p.canonicalUrl, depth: p.depth,
    discoveredFrom: p.discoveredFrom ?? null, status: p.status,
    httpStatus: p.httpStatus ?? null, title: p.title ?? null,
    wordCount: p.wordCount ?? null, linkCount: p.linkCount ?? null, imageCount: p.imageCount ?? null,
    trusted: p.trusted ?? null, trustScore: p.trustScore ?? null,
    extractionConfidence: p.extractionConfidence ?? null,
    redirectedTo: p.redirectedTo ?? null, error: p.error ?? null, skipReason: p.skipReason ?? null,
  };
}

/** A portable knowledge package: the crawl, its stats, and a full verifiable view per
 *  acquired page (with provenance, lineage, and trust). Everything cites its source. */
function exportPackage(service: CrawlService, job: CrawlJob): Record<string, unknown> {
  const pages = job.pages
    .filter((p) => p.status === 'stored')
    .map((p) => service.pageView(job.id, p.id))
    .filter(Boolean);
  return {
    crawlStation: '1.0',
    crawl: { id: job.id, seedUrl: job.seedUrl, site: job.site, config: job.config, stats: job.stats, createdAt: job.createdAt, finishedAt: job.finishedAt ?? null },
    pages,
  };
}

function parseConfig(raw: Record<string, unknown>): Partial<CrawlConfig> {
  const out: { -readonly [K in keyof CrawlConfig]?: CrawlConfig[K] } = {};
  if (raw.maxDepth !== undefined) out.maxDepth = Number(raw.maxDepth);
  if (raw.maxPages !== undefined) out.maxPages = Number(raw.maxPages);
  if (raw.sameSiteOnly !== undefined) out.sameSiteOnly = Boolean(raw.sameSiteOnly);
  if (raw.respectRobots !== undefined) out.respectRobots = Boolean(raw.respectRobots);
  if (raw.politenessMs !== undefined) out.politenessMs = Number(raw.politenessMs);
  if (raw.concurrency !== undefined) out.concurrency = Number(raw.concurrency);
  if (raw.timeoutMs !== undefined) out.timeoutMs = Number(raw.timeoutMs);
  if (raw.maxRetries !== undefined) out.maxRetries = Number(raw.maxRetries);
  return out;
}

async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

function sendHtml(res: http.ServerResponse, status: number, html: string): void {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}
