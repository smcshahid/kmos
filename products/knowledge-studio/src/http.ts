/**
 * Knowledge Studio HTTP server (node:http, zero runtime deps).
 *
 * A thin transport over {@link StudioService}: it parses requests, calls the
 * application service, and serves the single-page UI. No business logic here.
 */

import http from 'node:http';
import type { CanonicalId } from '@kmos/canonical-kernel';
import type { StudioService, SubmitInput } from './studio.js';
import type { SourceKind } from './types.js';
import {
  renderConceptsJson, renderPackage, renderStudyNotes, renderTranscriptMarkdown, renderTranscriptText,
} from './downloads.js';
import { STUDIO_HTML } from './web.js';
import { SAMPLE_TITLE, SAMPLE_TRANSCRIPT } from './sample.js';

export interface StudioServerOptions {
  readonly studio: StudioService;
}

const DOWNLOADS: Record<string, { type: string; file: (id: string, s: StudioService) => string }> = {
  'transcript.txt': { type: 'text/plain; charset=utf-8', file: (id, s) => renderTranscriptText(s.getSource(id)!) },
  'transcript.md': { type: 'text/markdown; charset=utf-8', file: (id, s) => renderTranscriptMarkdown(s.getSource(id)!) },
  'study-notes.md': { type: 'text/markdown; charset=utf-8', file: (id, s) => renderStudyNotes(s.getSource(id)!, s.assembleConceptViews(id)) },
  'concepts.json': { type: 'application/json; charset=utf-8', file: (id, s) => renderConceptsJson(s.getSource(id)!, s.assembleConceptViews(id)) },
  'package.json': { type: 'application/json; charset=utf-8', file: (id, s) => renderPackage(s.getSource(id)!, s.assembleConceptViews(id)) },
};

export function createStudioServer(opts: StudioServerOptions): http.Server {
  const studio = opts.studio;

  return http.createServer((req, res) => {
    void handle(req, res, studio).catch((err: unknown) => {
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    });
  });
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse, studio: StudioService): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;
  const method = req.method ?? 'GET';
  const seg = path.split('/').filter(Boolean); // e.g. ['api','sources',':id']

  // --- UI + health ---
  if (method === 'GET' && path === '/') return sendHtml(res, 200, STUDIO_HTML);
  if (method === 'GET' && path === '/health') return sendJson(res, 200, { status: 'ok', sources: studio.listSources().length });
  if (method === 'GET' && path === '/api/sample') return sendJson(res, 200, { title: SAMPLE_TITLE, transcript: SAMPLE_TRANSCRIPT });

  // --- Sources ---
  if (seg[0] === 'api' && seg[1] === 'sources') {
    if (method === 'POST' && seg.length === 2) {
      const body = await readJson(req);
      const input: SubmitInput = {
        kind: (String(body?.kind ?? 'transcript') as SourceKind),
        reference: String(body?.reference ?? body?.title ?? 'Untitled'),
        ...(body?.title ? { title: String(body.title) } : {}),
        ...(body?.transcript ? { transcript: String(body.transcript) } : {}),
        ...(body?.targetLanguage ? { targetLanguage: String(body.targetLanguage) } : {}),
      };
      const source = await studio.submit(input);
      return sendJson(res, 202, { id: source.id, status: source.status });
    }
    if (method === 'GET' && seg.length === 2) {
      return sendJson(res, 200, studio.listSources().map(summarizeSource));
    }
    const id = seg[2];
    if (method === 'GET' && id && seg.length === 3) {
      const source = studio.getSource(id);
      return source ? sendJson(res, 200, source) : sendJson(res, 404, { error: 'Source not found' });
    }
    if (method === 'POST' && id && seg[3] === 'retry') {
      const source = await studio.retry(id);
      return source ? sendJson(res, 202, { id: source.id, status: source.status }) : sendJson(res, 404, { error: 'Source not found' });
    }
    if (method === 'POST' && id && seg[3] === 'favorite') {
      const source = await studio.toggleFavorite(id);
      return source ? sendJson(res, 200, { id: source.id, favorite: source.favorite }) : sendJson(res, 404, { error: 'Source not found' });
    }
    if (method === 'GET' && id && seg[3] === 'concepts') {
      return sendJson(res, 200, studio.conceptSummaries(id));
    }
    if (method === 'GET' && id && seg[3] === 'download' && seg[4]) {
      const spec = DOWNLOADS[seg[4]];
      if (!spec || !studio.getSource(id)) return sendJson(res, 404, { error: 'Not found' });
      res.writeHead(200, { 'Content-Type': spec.type, 'Content-Disposition': `attachment; filename="${id}-${seg[4]}"` });
      return void res.end(spec.file(id, studio));
    }
  }

  // --- Concepts ---
  if (seg[0] === 'api' && seg[1] === 'concepts' && seg[2] && method === 'GET') {
    const view = studio.conceptView(seg[2] as CanonicalId);
    return view ? sendJson(res, 200, view) : sendJson(res, 404, { error: 'Concept not found' });
  }

  // --- Search ---
  if (seg[0] === 'api' && seg[1] === 'search' && method === 'GET') {
    const q = url.searchParams.get('q') ?? '';
    return sendJson(res, 200, studio.search(q));
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

function summarizeSource(s: ReturnType<StudioService['listSources']>[number]): Record<string, unknown> {
  return {
    id: s.id, title: s.title, kind: s.kind, status: s.status, error: s.error ?? null,
    favorite: s.favorite, conceptCount: s.conceptIds.length, chapterCount: s.chapters.length,
    durationSec: s.durationSec, createdAt: s.createdAt,
    stages: s.stages.map((st) => ({ id: st.id, status: st.status })),
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
