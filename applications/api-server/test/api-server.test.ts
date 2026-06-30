/**
 * Live HTTP tests for the KMOS API server (node:http). Starts a real server on
 * an ephemeral port and exercises the full lifecycle over the wire — evidence
 * that KMOS runs as a server, not just a library.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApiServer } from '../src/index.js';

let server: Server;
let base: string;

before(async () => {
  server = createApiServer();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address() as AddressInfo;
  base = `http://127.0.0.1:${addr.port}`;
});
after(async () => { await new Promise<void>((r) => server.close(() => r())); });

const api = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json() as any };
};

test('GET /health reports a healthy platform', async () => {
  const r = await api('GET', '/health');
  assert.equal(r.status, 200);
  assert.equal(r.json.status, 'ok');
});

test('GET / serves the reference UI', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/html/);
  const html = await res.text();
  assert.match(html, /KMOS .* Reference Console/);
});

test('full lifecycle over HTTP: org → lecture → knowledge → publish → trust → audit', async () => {
  const org = await api('POST', '/organizations', { name: 'HTTP Institute' });
  assert.equal(org.status, 200);
  assert.ok(org.json.id.startsWith('kmos:Organization:'));

  const editor = await api('POST', '/identities', { kind: 'Human', displayName: 'Net Editor', organizationId: org.json.id });
  assert.ok(editor.json.id.startsWith('kmos:Identity:'));

  const lecture = await api('POST', '/lectures', { title: 'On Patience', organizationId: org.json.id });
  assert.equal(lecture.json.state, 'Completed');
  const transcriptAsset = lecture.json.transcriptAssetId as string;

  const lang = await api('POST', '/transcripts', { transcript: 'Patience and Gratitude strengthen Patience', targetLanguage: 'ar', organizationId: org.json.id });
  assert.ok(Array.isArray(lang.json.conceptIds) && lang.json.conceptIds.length >= 1);

  const search = await api('GET', '/knowledge?q=Patience');
  assert.ok(Array.isArray(search.json) && search.json.length >= 1);

  const lineage = await api('GET', `/assets/${encodeURIComponent(transcriptAsset)}/lineage`);
  assert.ok(lineage.json.ancestors.includes(lecture.json.audioAssetId));

  const pub = await api('POST', '/publications', { title: 'On Patience (article)', knowledgeIds: lang.json.conceptIds, assetIds: [transcriptAsset], approver: 'Net Editor', organizationId: org.json.id });
  assert.equal(pub.json.released, true);

  const trust = await api('GET', `/governance/trust/${encodeURIComponent(lang.json.conceptIds[0])}`);
  assert.equal(typeof trust.json.trusted, 'boolean');
  assert.ok(Array.isArray(trust.json.reasons) && trust.json.reasons.length > 0);

  const metrics = await api('GET', '/events/metrics');
  assert.ok(metrics.json.totalEvents > 0);
});

test('errors map to HTTP status codes (404 for missing knowledge)', async () => {
  const r = await api('GET', '/knowledge/kmos:KnowledgeObject:00000000-0000-4000-8000-000000000000');
  assert.equal(r.status, 404);
});

test('GET /metrics exposes Prometheus-style platform metrics', async () => {
  await api('POST', '/organizations', { name: 'Metrics Org' });
  const res = await fetch(base + '/metrics');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/plain/);
  const body = await res.text();
  assert.match(body, /kmos_events_total \d+/);
  assert.match(body, /kmos_dead_letters 0/);
});
