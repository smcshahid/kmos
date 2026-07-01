import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { makeHttpCaptionFetcher } from '../src/index.js';

/** Stand up a throwaway HTTP server for the duration of a test. */
async function withServer(handler: http.RequestListener, fn: (base: string) => Promise<void>): Promise<void> {
  const server = http.createServer(handler);
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

test('returns transcript from a JSON { transcript } body', async () => {
  await withServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ transcript: 'hello world' }));
  }, async (base) => {
    assert.equal(await makeHttpCaptionFetcher(`${base}/c`)('vid'), 'hello world');
  });
});

test('accepts the { captions } and { text } aliases', async () => {
  await withServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ captions: 'via captions' }));
  }, async (base) => {
    assert.equal(await makeHttpCaptionFetcher(`${base}/c`)('vid'), 'via captions');
  });
});

test('accepts a plain-text body', async () => {
  await withServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('raw transcript text');
  }, async (base) => {
    assert.equal(await makeHttpCaptionFetcher(`${base}/c`)('vid'), 'raw transcript text');
  });
});

test('degrades to undefined on non-2xx (honest "needs infra")', async () => {
  await withServer((req, res) => { res.writeHead(404); res.end('no captions'); }, async (base) => {
    assert.equal(await makeHttpCaptionFetcher(`${base}/c`)('vid'), undefined);
  });
});

test('degrades to undefined on an empty body', async () => {
  await withServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ transcript: '   ' }));
  }, async (base) => {
    assert.equal(await makeHttpCaptionFetcher(`${base}/c`)('vid'), undefined);
  });
});

test('never throws on a network error — returns undefined', async () => {
  // Nothing is listening on this port.
  const fetcher = makeHttpCaptionFetcher('http://127.0.0.1:1/c', { timeoutMs: 200 });
  assert.equal(await fetcher('vid'), undefined);
});
