/**
 * Pure engine unit tests — URL rules, robots.txt, and HTML extraction. Fully offline
 * and deterministic (no network, no timers).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { canonicalizeUrl, sameSite, looksLikePage, pathExtension, shortLabel } from '../src/urls.js';
import { parseRobots, allowAll } from '../src/robots.js';
import { extractHtml } from '../src/extract.js';

test('canonicalizeUrl: drops fragment, default port, tracking params; sorts query; strips trailing slash', () => {
  assert.equal(canonicalizeUrl('https://Example.com:443/path/#section'), 'https://example.com/path');
  assert.equal(canonicalizeUrl('http://example.com:80/a/'), 'http://example.com/a');
  assert.equal(canonicalizeUrl('https://x.io/?utm_source=t&b=2&a=1'), 'https://x.io/?a=1&b=2');
  // Root path is preserved.
  assert.equal(canonicalizeUrl('https://x.io'), 'https://x.io/');
  // Same page via two paths canonicalizes identically.
  assert.equal(
    canonicalizeUrl('https://x.io/p?utm_campaign=z'),
    canonicalizeUrl('https://x.io/p/#top'),
  );
});

test('sameSite: www-insensitive host match', () => {
  assert.ok(sameSite('https://example.com', 'https://www.example.com/x'));
  assert.ok(sameSite('https://www.example.com/a', 'https://example.com/b'));
  assert.ok(!sameSite('https://example.com', 'https://other.com'));
  assert.ok(!sameSite('https://example.com', 'https://sub.example.com')); // subdomains differ
});

test('looksLikePage + pathExtension: assets are not pages', () => {
  assert.ok(looksLikePage('https://x.io/about'));
  assert.ok(looksLikePage('https://x.io/'));
  assert.ok(!looksLikePage('https://x.io/logo.png'));
  assert.ok(!looksLikePage('https://x.io/data.json'));
  assert.ok(!looksLikePage('mailto:a@b.com'));
  assert.equal(pathExtension('https://x.io/a/b.PDF'), 'pdf');
  assert.equal(pathExtension('https://x.io/a/b'), '');
});

test('shortLabel: path or host', () => {
  assert.equal(shortLabel('https://x.io/'), 'x.io');
  assert.equal(shortLabel('https://x.io/a/b?c=1'), '/a/b?c=1');
});

test('robots: disallow with allow override, wildcards, and end-anchor', () => {
  const body = [
    'User-agent: *',
    'Disallow: /private',
    'Allow: /private/public',
    'Disallow: /*.pdf$',
    'Crawl-delay: 2',
    'Sitemap: https://x.io/sitemap.xml',
  ].join('\n');
  const r = parseRobots(body, 'CrawlStation/1.0');
  assert.ok(!r.isAllowed('/private/secret'));
  assert.ok(r.isAllowed('/private/public/page'), 'longer Allow should win over Disallow');
  assert.ok(r.isAllowed('/open'));
  assert.ok(!r.isAllowed('/docs/manual.pdf'), 'wildcard + $ should match');
  assert.ok(r.isAllowed('/docs/manual.pdf.html'), '$ anchors the end');
  assert.equal(r.crawlDelaySec, 2);
  assert.deepEqual(r.sitemaps, ['https://x.io/sitemap.xml']);
});

test('robots: specific user-agent group beats the wildcard group', () => {
  const body = [
    'User-agent: *',
    'Disallow: /',
    '',
    'User-agent: CrawlStation',
    'Disallow: /admin',
  ].join('\n');
  const r = parseRobots(body, 'CrawlStation/1.0 (+kmos)');
  assert.ok(r.isAllowed('/anything'), 'our specific group allows all but /admin');
  assert.ok(!r.isAllowed('/admin/x'));
});

test('robots: empty Disallow means allow-all; allowAll permits everything', () => {
  const r = parseRobots('User-agent: *\nDisallow:', 'x');
  assert.ok(r.isAllowed('/anything'));
  assert.ok(allowAll().isAllowed('/whatever'));
});

test('extractHtml: title, description, canonical, lang, links, images, words, confidence', () => {
  const html = [
    '<!doctype html><html lang="en-US"><head>',
    '<title>Widget Handbook</title>',
    '<meta name="description" content="Everything about widgets.">',
    '<link rel="canonical" href="https://site.test/handbook">',
    '<meta property="og:site_name" content="WidgetCo">',
    '<script>var x = 1; // should be dropped</script>',
    '<style>.a{color:red}</style>',
    '</head><body>',
    '<nav><a href="/home">Home</a></nav>',
    '<main><h1>Widget Handbook</h1>',
    '<p>' + 'Widgets are wonderful. '.repeat(30) + '</p>',
    '<p>Learn more in <a href="/chapter-2">chapter two</a> and see <a href="https://external.test/ref">a reference</a>.</p>',
    '<img src="/img/diagram.png" alt="d"><img src="data:image/png;base64,AAAA">',
    '</main>',
    '<footer><a href="/legal">Legal</a></footer>',
    '</body></html>',
  ].join('\n');

  const ex = extractHtml(html, 'https://site.test/handbook?utm_source=x');
  assert.equal(ex.title, 'Widget Handbook');
  assert.equal(ex.description, 'Everything about widgets.');
  assert.equal(ex.canonicalUrl, 'https://site.test/handbook');
  assert.equal(ex.siteName, 'WidgetCo');
  assert.equal(ex.lang, 'en-us');
  assert.ok(ex.wordCount >= 60, 'main content words counted, script/style excluded');
  assert.ok(!ex.text.includes('color:red'), 'style content dropped');
  assert.ok(!ex.text.includes('var x'), 'script content dropped');
  // Links resolved to absolute, deduped, http(s) only, non-page assets excluded.
  assert.ok(ex.links.includes('https://site.test/chapter-2'));
  assert.ok(ex.links.includes('https://external.test/ref'));
  assert.ok(ex.links.includes('https://site.test/home'));
  // Images: relative resolved, data: excluded.
  assert.deepEqual(ex.images, ['https://site.test/img/diagram.png']);
  assert.ok(ex.confidence >= 0.5, 'good title + description + content → confident');
});

test('extractHtml: degrades gracefully on thin/empty documents', () => {
  const ex = extractHtml('<html><body><p>hi</p></body></html>', 'https://x.io/');
  assert.ok(ex.title.length > 0);
  assert.equal(ex.wordCount, 1);
  assert.ok(ex.confidence < 0.5, 'thin content → low confidence');
  const empty = extractHtml('', 'https://x.io/');
  assert.equal(empty.title, '(untitled)');
  assert.equal(empty.wordCount, 0);
});
