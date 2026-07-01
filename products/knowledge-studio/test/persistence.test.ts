import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SqlClient, SqlResult } from '@kmos/events';
import { createStudioPlatform, type StudioPlatform } from '../src/platform.ts';
import { StudioService } from '../src/studio.ts';
import { PostgresSourceStore } from '../src/source-store.ts';
import { SAMPLE_TRANSCRIPT, SAMPLE_TITLE } from '../src/sample.ts';

/** In-memory SqlClient that emulates exactly the three queries the store issues. */
class FakeSql implements SqlClient {
  private readonly rows = new Map<string, { data: unknown; seq: number }>();
  private seq = 0;
  async query<R = Record<string, unknown>>(text: string, params: readonly unknown[] = []): Promise<SqlResult<R>> {
    if (text.startsWith('CREATE TABLE')) return { rows: [] };
    if (text.startsWith('INSERT')) {
      this.rows.set(String(params[0]), { data: JSON.parse(String(params[1])), seq: ++this.seq });
      return { rows: [] };
    }
    if (text.startsWith('SELECT')) {
      const sorted = [...this.rows.values()].sort((a, b) => a.seq - b.seq);
      return { rows: sorted.map((r) => ({ data: r.data })) as readonly R[] };
    }
    return { rows: [] };
  }
}

function sample(studio: StudioService) {
  return studio.submitAndProcess({ kind: 'transcript', reference: SAMPLE_TITLE, title: SAMPLE_TITLE, transcript: SAMPLE_TRANSCRIPT });
}

test('the store round-trips a processed source through save/load', async () => {
  const sql = new FakeSql();
  const store = new PostgresSourceStore(sql);
  await store.init();
  const studio = new StudioService(createStudioPlatform(), { store });
  const src = await sample(studio);

  const loaded = await store.load();
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0]!.source.id, src.id);
  assert.equal(loaded[0]!.source.status, 'ready');
  assert.ok(loaded[0]!.source.segments.length > 5);
  assert.ok(Object.keys(loaded[0]!.trust).length > 0, 'trust persisted');
});

test('a restarted StudioService recovers the full source experience', async () => {
  // Same KMOS platform (its durability is proven separately, ADR-0011); a FRESH
  // StudioService models the app process restarting and recovering its view layer.
  const platform: StudioPlatform = createStudioPlatform();
  const sql = new FakeSql();

  const before = new StudioService(platform, { store: new PostgresSourceStore(sql) });
  await before.init();
  const src = await sample(before);
  const groundedId = before.conceptSummaries(src.id).find((c) => c.evidenceCount > 0)!.id;

  const after = new StudioService(platform, { store: new PostgresSourceStore(sql) });
  await after.init();

  const recovered = after.getSource(src.id);
  assert.ok(recovered, 'source recovered');
  assert.equal(recovered!.status, 'ready');
  assert.ok(recovered!.segments.length > 5, 'transcript segments recovered');
  assert.ok(recovered!.chapters.length >= 1, 'chapters recovered');

  // The verifiable concept view still works after recovery (evidence + trust).
  const view = after.conceptView(groundedId)!;
  assert.ok(view.evidence.length >= 1, 'evidence projection recovered');
  assert.equal(view.trust.trusted, true, 'trust recovered');
  assert.equal(after.listSources().length, 1);
});

test('favorites persist across a restart', async () => {
  const platform = createStudioPlatform();
  const sql = new FakeSql();
  const a = new StudioService(platform, { store: new PostgresSourceStore(sql) });
  await a.init();
  const src = await sample(a);
  await a.toggleFavorite(src.id);
  assert.equal(a.getSource(src.id)!.favorite, true);

  const b = new StudioService(platform, { store: new PostgresSourceStore(sql) });
  await b.init();
  assert.equal(b.getSource(src.id)!.favorite, true, 'favorite survived restart');
});

test('a source interrupted mid-processing recovers as failed-and-retryable', async () => {
  const platform = createStudioPlatform();
  const sql = new FakeSql();
  const store = new PostgresSourceStore(sql);
  await store.init();
  // Simulate a crash: persist a source stuck in "processing".
  const studio = new StudioService(platform, { store });
  await studio.init();
  const src = await sample(studio);
  // Force a persisted "processing" snapshot as if the crash happened mid-run.
  const stuck = { ...structuredClone(studio.getSource(src.id)!), status: 'processing' as const };
  await store.save({ source: stuck, trust: {} });

  const recovered = new StudioService(platform, { store: new PostgresSourceStore(sql) });
  await recovered.init();
  const s = recovered.getSource(src.id)!;
  assert.equal(s.status, 'failed');
  assert.match(s.error ?? '', /interrupted/i);

  // Retry reconstructs the transcript from recovered segments and completes.
  const retried = await recovered.retry(src.id);
  assert.ok(retried);
  // give the background retry a tick to finish
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(recovered.getSource(src.id)!.status, 'ready');
});
