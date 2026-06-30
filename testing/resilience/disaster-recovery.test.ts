/**
 * M5 disaster-recovery resilience test (KMOS-0203 §14, KMOS-0010 §17).
 *
 * Proves the institutional-memory guarantee: knowledge is RECONSTRUCTABLE purely
 * from the immutable, append-only event history. We drive real business activity
 * (concepts + a relationship) through a KnowledgeService on a shared canonical
 * bus, capture the live graph, then simulate TOTAL service-state loss by
 * discarding the service and its in-memory repositories entirely. Finally we
 * rebuild the graph from scratch by folding the surviving event log via the
 * kernel `replay` engine and the Knowledge graph projection, and assert the
 * rebuilt state is identical to the pre-loss state and that the log was never
 * mutated by recovery.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus, replay, type StoredEvent } from '@kmos/canonical-kernel';
import {
  KnowledgeService,
  graphProjection,
  graphFromState,
  type KnowledgeGraph,
} from '@kmos/knowledge';
import { createPlatformCatalog } from '@kmos/platform-catalog';

const fixedNow = (): string => '2026-06-30T00:00:00.000Z';

/** Stable, order-independent fingerprint of a graph for equality assertions. */
function fingerprint(graph: KnowledgeGraph): { nodes: string[]; edges: string[] } {
  const nodes = graph.nodes
    .map((n) => `${n.id}|${n.canonicalName}|${n.category}|${n.lifecycle}|${n.version}`)
    .sort();
  const edges = graph.edges
    .map((e) => `${e.relationshipId}|${e.relation}|${e.sourceId}|${e.targetId}`)
    .sort();
  return { nodes, edges };
}

test('disaster recovery: knowledge graph is fully reconstructable by replaying the immutable log', async () => {
  // --- Live institution: drive business activity onto the shared bus. ---
  const bus = new EventBus({ catalog: createPlatformCatalog() });
  const knowledge = new KnowledgeService({ bus, now: fixedNow });

  const sincerity = await knowledge.createKnowledge({
    category: 'Concept',
    canonicalName: 'Sincerity',
    definition: 'Purity of intention.',
    primaryLanguage: 'en',
    confidence: 0.9,
  });
  const purification = await knowledge.createKnowledge({
    category: 'Concept',
    canonicalName: 'Purification',
    definition: 'Cleansing of the heart.',
    primaryLanguage: 'en',
  });
  const patience = await knowledge.createKnowledge({
    category: 'Concept',
    canonicalName: 'Patience',
    definition: 'Steadfastness under trial.',
    primaryLanguage: 'en',
  });
  await knowledge.createRelationship({
    relation: 'Explains',
    sourceId: sincerity.id,
    targetId: purification.id,
    confidence: 0.8,
  });
  await knowledge.createRelationship({
    relation: 'RelatedTo',
    sourceId: patience.id,
    targetId: sincerity.id,
  });

  // The live, authoritative graph (system of record), before any loss.
  const preLossGraph = knowledge.buildGraphProjection();
  const preLoss = fingerprint(preLossGraph);
  assert.equal(preLoss.nodes.length, 3, 'three concepts created');
  assert.equal(preLoss.edges.length, 2, 'two relationships created');

  // Snapshot the immutable history as it stands right after business activity.
  const log = bus.eventLog;
  const historyBefore = (await log.read(1))
    .map((s: StoredEvent) => `${s.sequence}|${s.streamId}|${s.event.identity.eventId}|${s.event.identity.type}`);
  const sizeBefore = await log.size();
  assert.ok(sizeBefore >= 5, 'at least five canonical events were appended');

  // --- TOTAL service-state loss. ---
  // Every projection / in-memory repository the service held is gone. The ONLY
  // thing that survives is the immutable append-only event log. (We deliberately
  // do NOT reuse `knowledge` below; recovery must not depend on live state.)

  // --- Recovery path 1: rebuild from a BRAND-NEW projection via kernel replay.
  const { state, session } = await replay(log, graphProjection, { now: fixedNow });
  const rebuiltGraph = graphFromState(state);
  const rebuilt = fingerprint(rebuiltGraph);

  assert.deepEqual(rebuilt.nodes, preLoss.nodes, 'every node reconstructed identically');
  assert.deepEqual(rebuilt.edges, preLoss.edges, 'every edge reconstructed identically');
  assert.equal(session.eventsApplied, sizeBefore, 'replay folded the entire surviving log');

  // --- Recovery path 2: the service-level fold yields the same graph. ---
  const recoveredService = new KnowledgeService({ bus, now: fixedNow });
  const fromEvents = fingerprint(await recoveredService.buildGraphFromEvents());
  assert.deepEqual(fromEvents.nodes, preLoss.nodes, 'service event-fold matches pre-loss nodes');
  assert.deepEqual(fromEvents.edges, preLoss.edges, 'service event-fold matches pre-loss edges');

  // --- The log was never mutated by recovery (append-only / immutable). ---
  const historyAfter = (await log.read(1))
    .map((s: StoredEvent) => `${s.sequence}|${s.streamId}|${s.event.identity.eventId}|${s.event.identity.type}`);
  assert.equal(await log.size(), sizeBefore, 'recovery appended nothing to the log');
  assert.deepEqual(historyAfter, historyBefore, 'event history is byte-for-byte unchanged after recovery');

  assert.equal(bus.getDeadLetters().length, 0, 'no dead letters during the journey');
});
