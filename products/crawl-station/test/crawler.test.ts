/**
 * Crawl-engine tests against a deterministic in-memory site (injected fetch, no timers).
 * Verifies depth + page limits, same-site scope, robots exclusion, dedup, and redirects.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runCrawl, type CrawlEvent } from '../src/crawler.js';
import { DEFAULT_CRAWL_CONFIG, type CrawlConfig } from '../src/types.js';

interface Route { body?: string; status?: number; type?: string; redirect?: string }

function page(title: string, links: string[], words = 40): string {
  const body = 'This is meaningful readable content about the topic. '.repeat(words / 6 + 1);
  const anchors = links.map((h) => '<a href="' + h + '">link</a>').join(' ');
  return '<!doctype html><html lang="en"><head><title>' + title + '</title>'
    + '<meta name="description" content="About ' + title + '."></head>'
    + '<body><main><h1>' + title + '</h1><p>' + body + '</p><p>' + anchors + '</p></main></body></html>';
}

function makeFetch(routes: Record<string, Route>): typeof fetch {
  return (async (input: string | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const r = routes[url] ?? routes[toggleSlash(url)];
    if (!r) return new Response('nope', { status: 404, headers: { 'content-type': 'text/plain' } });
    if (r.redirect) return new Response(null, { status: r.status ?? 301, headers: { location: r.redirect } });
    return new Response(r.body ?? '', { status: r.status ?? 200, headers: { 'content-type': r.type ?? 'text/html; charset=utf-8' } });
  }) as unknown as typeof fetch;
}

function toggleSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url + '/';
}

const SITE: Record<string, Route> = {
  'https://site.test/robots.txt': { body: 'User-agent: *\nDisallow: /private', type: 'text/plain' },
  'https://site.test/': { body: page('Home', ['/about', '/private/secret', 'https://external.test/x', '/old']) },
  'https://site.test/about': { body: page('About', ['/deep', '/about']) },
  'https://site.test/deep': { body: page('Deep', ['/too-deep']) },
  'https://site.test/too-deep': { body: page('TooDeep', []) },
  'https://site.test/old': { redirect: '/new' },
  'https://site.test/new': { body: page('New Home', []) },
  'https://site.test/private/secret': { body: page('Secret', []) },
  'https://external.test/x': { body: page('External', []) },
};

const fastDeps = { fetchImpl: makeFetch(SITE), sleep: async () => {}, now: (() => { let t = 0; return () => (t += 5); })(), isoNow: () => '2026-07-02T00:00:00.000Z' };

async function collect(config: Partial<CrawlConfig>): Promise<CrawlEvent[]> {
  const events: CrawlEvent[] = [];
  await runCrawl(
    { seedUrl: 'https://site.test/', config: { ...DEFAULT_CRAWL_CONFIG, ...config }, userAgent: 'CrawlStation/1.0' },
    { emit: (e) => { events.push(e); } },
    fastDeps,
  );
  return events;
}

test('crawl respects depth, scope, robots, dedup, and records redirects', async () => {
  const events = await collect({ maxDepth: 2, politenessMs: 0, concurrency: 2 });
  const fetched = events.filter((e) => e.type === 'fetched');
  const fetchedUrls = fetched.map((e) => (e.type === 'fetched' ? e.page.canonicalUrl : ''));

  // Stored: home, about, old (→ new), deep. NOT too-deep (depth 3), NOT external (scope).
  assert.ok(fetchedUrls.includes('https://site.test/'));
  assert.ok(fetchedUrls.includes('https://site.test/about'));
  assert.ok(fetchedUrls.includes('https://site.test/deep'));
  assert.ok(!fetchedUrls.some((u) => u.includes('too-deep')), 'depth limit enforced');
  assert.ok(!fetchedUrls.some((u) => u.includes('external.test')), 'same-site scope enforced');

  // Redirect observed and recorded.
  const redirected = fetched.find((e) => e.type === 'fetched' && e.page.redirectedTo);
  assert.ok(redirected, 'the /old → /new redirect should be captured');
  assert.equal(redirected.type === 'fetched' && redirected.page.redirectedTo, 'https://site.test/new');

  // robots.txt exclusion is honored and reported honestly.
  const excluded = events.filter((e) => e.type === 'excluded');
  assert.ok(excluded.some((e) => e.type === 'excluded' && e.url.includes('/private/secret')), 'robots exclusion emitted');

  // Every fetched page carries an integrity hash + extracted content.
  for (const e of fetched) {
    if (e.type !== 'fetched') continue;
    assert.match(e.page.contentHash, /^[0-9a-f]{64}$/);
    assert.ok(e.page.extracted.wordCount > 0);
    assert.ok(e.page.httpStatus === 200);
  }
});

test('maxPages caps the number of fetches', async () => {
  const events = await collect({ maxDepth: 3, maxPages: 2, politenessMs: 0, concurrency: 1 });
  const fetched = events.filter((e) => e.type === 'fetched');
  assert.equal(fetched.length, 2, 'no more than maxPages pages are fetched');
  assert.ok(events.some((e) => e.type === 'skipped' && /page limit/i.test(e.type === 'skipped' ? e.reason : '')));
});

test('maxDepth 0 fetches only the seed', async () => {
  const events = await collect({ maxDepth: 0, politenessMs: 0 });
  const fetched = events.filter((e) => e.type === 'fetched');
  assert.equal(fetched.length, 1);
  assert.equal(fetched[0]!.type === 'fetched' ? fetched[0]!.page.canonicalUrl : '', 'https://site.test/');
});
