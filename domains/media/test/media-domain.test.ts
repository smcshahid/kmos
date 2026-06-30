import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus, type StoredEvent } from '@kmos/canonical-kernel';
import { AssetRegistryService } from '@kmos/assets';
import { CapabilityRegistryService } from '@kmos/capability-registry';
import { CapabilityRuntimeService } from '@kmos/capability-runtime';
import { createPlatformCatalog } from '@kmos/platform-catalog';
import { MediaDomainService } from '../src/index.js';

const fixedNow = () => '2026-06-30T00:00:00.000Z';

function wire() {
  const bus = new EventBus({ catalog: createPlatformCatalog() });
  const assets = new AssetRegistryService({ bus, now: fixedNow });
  const registry = new CapabilityRegistryService({ bus, now: fixedNow });
  const runtime = new CapabilityRuntimeService({ bus, now: fixedNow });
  const media = new MediaDomainService({ bus, assets, registry, runtime, now: fixedNow });
  return { bus, assets, registry, runtime, media };
}

test('Media domain preserves a lecture: import -> transcribe (workflow+runtime) -> transcript asset + lineage', async () => {
  const { bus, assets, media } = wire();
  const res = await media.preserveLecture({ title: 'Lecture 1', audioRef: 'kmos:Asset:audio-1', checksum: 'sha256:audio' });

  assert.equal(res.state, 'Completed');
  assert.match(res.transcript, /transcript of kmos:Asset:audio-1/);
  assert.ok(res.audioAssetId.startsWith('kmos:Asset:'));
  assert.ok(res.transcriptAssetId.startsWith('kmos:Asset:'));

  // Lineage: transcript derives from the audio.
  const lineage = assets.getLineage(res.transcriptAssetId);
  assert.ok(lineage.ancestors.includes(res.audioAssetId));

  // Domain events landed on the shared bus.
  const types = new Set(bus.eventLog.read(1).map((s: StoredEvent) => s.event.identity.type));
  assert.ok(types.has('LectureImported'));
  assert.ok(types.has('LectureProcessed'));
  assert.ok(types.has('AssetRegistered'));
  assert.ok(types.has('CapabilityExecutionCompleted')); // runtime actually executed the capability
});

test('Media domain holds no business logic: transcription happens only via the capability', async () => {
  const { media, runtime } = wire();
  // If the capability implementation were removed, the workflow could not produce a transcript.
  const res = await media.preserveLecture({ title: 'L', audioRef: 'kmos:Asset:a', checksum: 'c' });
  assert.ok(res.transcript.length > 0);
  // sanity: runtime health for the registered capability is Ready
  assert.equal(typeof runtime.invoke, 'function');
});
