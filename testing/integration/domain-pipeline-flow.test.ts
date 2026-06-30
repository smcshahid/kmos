/**
 * M3 end-to-end domain pipeline (KMOS-0009 reference solution example).
 *
 * One institutional journey across the domain services, all on ONE shared
 * canonical event bus, proving the platform composes end to end:
 *
 *   Media (import + transcribe)  ->  Language (correct + extract concepts +
 *   vocabulary into Knowledge)  ->  Publishing (metadata + package + governed
 *   release)  ->  Preservation (integrity + evidence package + Preserved).
 *
 * Demonstrates: domains coordinate; capabilities compute; knowledge accumulates;
 * evidence is governed and preserved; the entire history lands in one replayable
 * log.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus, type StoredEvent } from '@kmos/canonical-kernel';
import { AssetRegistryService } from '@kmos/assets';
import { KnowledgeService } from '@kmos/knowledge';
import { GovernanceService } from '@kmos/governance';
import { CapabilityRegistryService } from '@kmos/capability-registry';
import { CapabilityRuntimeService } from '@kmos/capability-runtime';
import { createPlatformCatalog } from '@kmos/platform-catalog';
import { MediaDomainService } from '@kmos/media';
import { LanguageDomainService } from '@kmos/language';
import { PublishingDomainService } from '@kmos/publishing';
import { PreservationDomainService } from '@kmos/preservation';

const now = () => '2026-06-30T00:00:00.000Z';

test('end-to-end: lecture -> knowledge -> publication -> preservation on a shared bus', async () => {
  // Shared platform wiring.
  const bus = new EventBus({ catalog: createPlatformCatalog() });
  const assets = new AssetRegistryService({ bus, now });
  const knowledge = new KnowledgeService({ bus, now });
  const governance = new GovernanceService({ bus, now });
  const registry = new CapabilityRegistryService({ bus, now });
  const runtime = new CapabilityRuntimeService({ bus, now });

  const media = new MediaDomainService({ bus, assets, registry, runtime, now });
  const language = new LanguageDomainService({ bus, knowledge, registry, runtime, now });
  const publishing = new PublishingDomainService({ bus, assets, governance, registry, runtime, now });
  const preservation = new PreservationDomainService({ bus, assets, now });

  // 1) Media: import + transcribe a lecture.
  const lecture = await media.preserveLecture({ title: 'On Sincerity', audioRef: 'kmos:Asset:lecture-1', checksum: 'sha256:audio' });
  assert.equal(lecture.state, 'Completed');

  // 2) Language: correct + extract concepts + learn vocabulary into Knowledge.
  const lang = await language.processTranscript({ transcript: 'Sincerity leads to Purification and lasting Sincerity', targetLanguage: 'ar' });
  assert.ok(lang.conceptIds.length >= 1, 'concepts created in Knowledge');

  // 3) Publishing: metadata + package + governed release of the knowledge.
  const pub = await publishing.publish({
    title: 'On Sincerity (article)', knowledgeIds: lang.conceptIds, assetIds: [lecture.transcriptAssetId], approver: 'Editor',
  });
  assert.equal(pub.released, true, 'publication released after approval');

  // 4) Preservation: integrity + evidence + Preserved for the evidence trail.
  const pres = await preservation.preserve({ assetIds: [lecture.audioAssetId, lecture.transcriptAssetId] });
  assert.equal(pres.failedAssetIds.length, 0, 'all assets preserved');
  assert.ok(pres.preservedAssetIds.includes(lecture.audioAssetId));

  // --- One shared institutional history across every domain ---
  const types = new Set(bus.eventLog.read(1).map((s: StoredEvent) => s.event.identity.type));
  for (const expected of [
    'LectureImported', 'LectureProcessed',          // media
    'TranscriptCorrected', 'VocabularyLearned',     // language
    'ConceptCreated',                               // knowledge
    'CapabilityExecutionCompleted',                 // runtime executed capabilities
    'ApprovalGranted', 'PublicationReleased',       // publishing + governance
    'PreservationCompleted',                        // preservation
  ]) {
    assert.ok(types.has(expected), `shared log should contain ${expected}`);
  }
  assert.equal(bus.getDeadLetters().length, 0, 'no dead letters across the whole pipeline');
});
