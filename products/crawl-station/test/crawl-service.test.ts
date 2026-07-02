/**
 * End-to-end application tests: a crawl driven through the real KMOS platform substrate
 * (in-memory) produces canonical Assets (evidence + lineage), KnowledgeObjects (with a
 * discovery-path relationship), explainable trust, and a working search index — plus the
 * durable job-state store recovers a restart honestly. Fully offline (injected fetch).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createCrawlPlatform } from '../src/platform.js';
import { CrawlService } from '../src/crawl-service.js';
import type { CrawlStore } from '../src/crawl-store.js';
import type { CrawlJob } from '../src/types.js';

function page(title: string, links: string[]): string {
  const body = ('This page explains the topic in clear, substantial prose so that readable '
    + 'content is recovered and the page earns trust through real evidence. ').repeat(4);
  const anchors = links.map((h) => '<a href="' + h + '">go</a>').join(' ');
  return '<!doctype html><html lang="en"><head><title>' + title + '</title>'
    + '<meta name="description" content="Summary of ' + title + '."></head>'
    + '<body><main><h1>' + title + '</h1><p>' + body + '</p><p>' + anchors + '</p></main></body></html>';
}

const SITE: Record<string, string> = {
  'https://acme.test/': page('Alpha Home', ['/beta']),
  'https://acme.test/beta': page('Beta Handbook', []),
};

function makeFetch(): typeof fetch {
  return (async (input: string | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const key = url.endsWith('/') || SITE[url] ? url : url; // exact
    const body = SITE[key] ?? SITE[url.endsWith('/') ? url.slice(0, -1) : url + '/'];
    if (body === undefined) return new Response('nf', { status: 404, headers: { 'content-type': 'text/plain' } });
    return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }) as unknown as typeof fetch;
}

function makeService(store?: CrawlStore): { service: CrawlService; platform: ReturnType<typeof createCrawlPlatform> } {
  const platform = createCrawlPlatform();
  let i = 0;
  const service = new CrawlService(platform, {
    ...(store ? { store } : {}),
    now: () => new Date(Date.UTC(2026, 6, 2, 0, 0, i++)).toISOString(),
    crawlDeps: { fetchImpl: makeFetch(), sleep: async () => {}, now: (() => { let t = 0; return () => (t += 5); })(), isoNow: () => '2026-07-02T00:00:00.000Z' },
  });
  return { service, platform };
}

test('a crawl produces evidence, lineage, knowledge, a relationship, trust, and search', async () => {
  const { service, platform } = makeService();
  const job = await service.submitAndCrawl({ seedUrl: 'https://acme.test/', config: { maxDepth: 1, maxPages: 10, politenessMs: 0 } });

  assert.equal(job.status, 'completed');
  assert.equal(job.stats.stored, 2, 'both pages acquired');
  assert.ok(job.stats.totalWords > 0);

  const home = job.pages.find((p) => p.canonicalUrl === 'https://acme.test/');
  assert.ok(home, 'home page recorded');
  assert.equal(home.status, 'stored');
  assert.ok(home.rawAssetId && home.contentAssetId && home.knowledgeId, 'KMOS ids attached');
  assert.equal(typeof home.trustScore, 'number');

  // Lineage: the readable content asset derives from the raw HTML asset (chain of custody).
  const lineage = platform.assets.getLineage(home.contentAssetId!);
  assert.ok(lineage.ancestors.includes(home.rawAssetId!), 'content derived from raw evidence');

  // Knowledge graph: the discovery path is recorded as a relationship (home → beta).
  const graph = platform.knowledge.buildGraphProjection();
  assert.ok(graph.edges.length >= 1, 'a discovery-path relationship was created');

  // The page view assembles lineage + explainable trust + a readable excerpt.
  const view = service.pageView(job.id, home.id)!;
  assert.ok(view.lineage.length >= 2, 'lineage nodes surfaced (content ← raw)');
  assert.ok(view.trust.reasons.length > 0, 'trust is explained, not a bare score');
  assert.ok(view.excerpt.length > 0);
  assert.match(view.contentHash!, /^[0-9a-f]{64}$/);

  // Search finds acquired knowledge, tied back to its source URL.
  const hits = service.search('beta');
  assert.ok(hits.length >= 1, 'search returns the Beta page');
  assert.ok(hits.some((h) => h.url === 'https://acme.test/beta'));

  // Dashboard aggregates are consistent.
  const dash = service.dashboard();
  assert.equal(dash.pagesAcquired, 2);
  assert.equal(dash.sites, 1);
  assert.ok(dash.trustedPages >= 1, 'substantial pages are trusted');
});

test('durable store: crawls persist and an interrupted crawl recovers as failed-retryable', async () => {
  const saved = new Map<string, CrawlJob>();
  const store: CrawlStore = {
    init: async () => {},
    load: async () => [...saved.values()],
    save: async (job) => { saved.set(job.id, structuredClone(job)); },
  };

  const { service } = makeService(store);
  const job = await service.submitAndCrawl({ seedUrl: 'https://acme.test/', config: { maxDepth: 0, maxPages: 5, politenessMs: 0 } });
  assert.ok(saved.has(job.id), 'completed crawl was persisted');
  assert.equal(saved.get(job.id)!.status, 'completed');

  // Simulate a crawl that was cut off mid-run by a restart.
  saved.set('crawl-stuck', { ...structuredClone(job), id: 'crawl-stuck', status: 'crawling', finishedAt: undefined });

  const platform2 = createCrawlPlatform();
  const recovered = new CrawlService(platform2, { store });
  await recovered.init();
  const stuck = recovered.getJob('crawl-stuck')!;
  assert.equal(stuck.status, 'failed', 'interrupted crawl is honestly marked failed');
  assert.match(stuck.error ?? '', /interrupted/i);
  assert.equal(recovered.listJobs().length, 2, 'all crawls recovered');
});
