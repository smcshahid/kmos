/**
 * Podcast Studio HTTP server (node:http, zero runtime deps).
 *
 * A thin transport over {@link PodcastStudioService}: it parses requests, calls the
 * application service, and serves the single-page UI. No business logic here.
 */

import http from 'node:http';
import type { CanonicalId } from '@kmos/canonical-kernel';
import type { PodcastStudioService, SubmitInput } from './studio.js';
import type { EpisodeKind } from './types.js';
import { parseRssFeed } from './acquisition.js';
import { STUDIO_HTML } from './web.js';
import { SAMPLE_TITLE, SAMPLE_TRANSCRIPT } from './sample.js';

export interface PodcastServerOptions {
  readonly studio: PodcastStudioService;
}

export function createPodcastServer(opts: PodcastServerOptions): http.Server {
  const studio = opts.studio;
  return http.createServer((req, res) => {
    void handle(req, res, studio).catch((err: unknown) => {
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    });
  });
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse, studio: PodcastStudioService): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;
  const method = req.method ?? 'GET';
  const seg = path.split('/').filter(Boolean);

  // --- UI + health ---
  if (method === 'GET' && path === '/') return sendHtml(res, 200, STUDIO_HTML);
  if (method === 'GET' && path === '/health') return sendJson(res, 200, { status: 'ok', episodes: studio.listEpisodes().length });
  if (method === 'GET' && path === '/api/sample') return sendJson(res, 200, { title: SAMPLE_TITLE, transcript: SAMPLE_TRANSCRIPT });

  // --- RSS feed preview (parse posted XML into selectable episodes) ---
  if (method === 'POST' && path === '/api/feed') {
    const body = await readJson(req);
    return sendJson(res, 200, parseRssFeed(String(body?.xml ?? '')));
  }

  // --- Episodes ---
  if (seg[0] === 'api' && seg[1] === 'episodes') {
    if (method === 'POST' && seg.length === 2) {
      const body = await readJson(req);
      const input: SubmitInput = {
        kind: (String(body?.kind ?? 'transcript') as EpisodeKind),
        reference: String(body?.reference ?? body?.title ?? 'Untitled'),
        ...(body?.title ? { title: String(body.title) } : {}),
        ...(body?.show ? { show: String(body.show) } : {}),
        ...(body?.transcript ? { transcript: String(body.transcript) } : {}),
        ...(body?.targetLanguage ? { targetLanguage: String(body.targetLanguage) } : {}),
      };
      const ep = await studio.submit(input);
      return sendJson(res, 202, { id: ep.id, status: ep.status });
    }
    if (method === 'GET' && seg.length === 2) {
      return sendJson(res, 200, studio.listEpisodes().map(summarizeEpisode));
    }
    const id = seg[2];
    if (method === 'GET' && id && seg.length === 3) {
      const ep = studio.getEpisode(id);
      return ep ? sendJson(res, 200, ep) : sendJson(res, 404, { error: 'Episode not found' });
    }
    if (method === 'POST' && id && seg[3] === 'retry') {
      const ep = await studio.retry(id);
      return ep ? sendJson(res, 202, { id: ep.id, status: ep.status }) : sendJson(res, 404, { error: 'Episode not found' });
    }
    if (method === 'POST' && id && seg[3] === 'favorite') {
      const ep = await studio.toggleFavorite(id);
      return ep ? sendJson(res, 200, { id: ep.id, favorite: ep.favorite }) : sendJson(res, 404, { error: 'Episode not found' });
    }
    if (method === 'GET' && id && seg[3] === 'concepts') {
      return sendJson(res, 200, studio.conceptSummaries(id));
    }
    if (method === 'GET' && id && seg[3] === 'downloads') {
      if (!studio.getEpisode(id)) return sendJson(res, 404, { error: 'Episode not found' });
      return sendJson(res, 200, studio.assemblePackage(id).map((f) => ({ name: f.name, mediaType: f.mediaType })));
    }
    if (method === 'GET' && id && seg[3] === 'download' && seg[4]) {
      if (!studio.getEpisode(id)) return sendJson(res, 404, { error: 'Episode not found' });
      const file = studio.assemblePackage(id).find((f) => f.name === seg[4]);
      if (!file) return sendJson(res, 404, { error: 'Not found' });
      res.writeHead(200, { 'Content-Type': `${file.mediaType}; charset=utf-8`, 'Content-Disposition': `attachment; filename="${id}-${file.name}"` });
      return void res.end(file.content);
    }
  }

  // --- Concepts ---
  if (seg[0] === 'api' && seg[1] === 'concepts' && seg[2] && method === 'GET') {
    const view = studio.conceptView(seg[2] as CanonicalId);
    return view ? sendJson(res, 200, view) : sendJson(res, 404, { error: 'Concept not found' });
  }

  // --- Search ---
  if (seg[0] === 'api' && seg[1] === 'search' && method === 'GET') {
    return sendJson(res, 200, studio.search(url.searchParams.get('q') ?? ''));
  }

  // --- Collections ---
  if (seg[0] === 'api' && seg[1] === 'collections' && method === 'POST') {
    const body = await readJson(req);
    const name = String(body?.name ?? 'Collection');
    const memberIds = (Array.isArray(body?.memberIds) ? body.memberIds : []).map((x: unknown) => String(x) as CanonicalId);
    return sendJson(res, 201, await studio.createCollection(name, memberIds));
  }

  sendJson(res, 404, { error: `No route for ${method} ${path}` });
}

function summarizeEpisode(e: ReturnType<PodcastStudioService['listEpisodes']>[number]): Record<string, unknown> {
  return {
    id: e.id, title: e.title, show: e.show ?? null, kind: e.kind, status: e.status, error: e.error ?? null,
    favorite: e.favorite, conceptCount: e.conceptIds.length, chapterCount: e.chapters.length,
    clipCount: (e.clips ?? []).length, durationSec: e.durationSec, createdAt: e.createdAt,
    stages: e.stages.map((st) => ({ id: st.id, label: st.label, status: st.status, mode: st.mode, detail: st.detail ?? null })),
  };
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
