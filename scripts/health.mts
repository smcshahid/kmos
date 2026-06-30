/**
 * KMOS health check (CLI dashboard). Instantiates the platform, runs a canonical
 * event round-trip + replay smoke, and reports component + bus health.
 * Run: npm run health
 */
import { EventBus, createEvent, newCanonicalId, type Projection } from '@kmos/canonical-kernel';
import { createPlatformCatalog } from '@kmos/platform-catalog';
import { IdentityService } from '@kmos/identity';
import { AssetRegistryService } from '@kmos/assets';
import { KnowledgeService } from '@kmos/knowledge';
import { GovernanceService } from '@kmos/governance';
import { EventService } from '@kmos/events';
import { CapabilityRegistryService } from '@kmos/capability-registry';
import { CapabilityRuntimeService } from '@kmos/capability-runtime';
import { ConfigurationService } from '@kmos/configuration';
import { SearchService } from '@kmos/search';

async function main(): Promise<void> {
  const bus = new EventBus({ catalog: createPlatformCatalog() });
  const components: Record<string, boolean> = {};
  const up = (name: string, fn: () => unknown) => { try { fn(); components[name] = true; } catch { components[name] = false; } };

  up('identity', () => new IdentityService({ bus }));
  up('assets', () => new AssetRegistryService({ bus }));
  up('knowledge', () => new KnowledgeService({ bus }));
  up('governance', () => new GovernanceService({ bus }));
  up('events', () => new EventService({ bus }));
  up('capability-registry', () => new CapabilityRegistryService({ bus }));
  up('capability-runtime', () => new CapabilityRuntimeService({ bus }));
  up('configuration', () => new ConfigurationService({ bus }));
  up('search', () => new SearchService({ bus }));

  // Round-trip + replay smoke.
  const id = newCanonicalId('Asset');
  await bus.publish(createEvent({ type: 'AssetRegistered', schemaVersion: '1.0', producer: 'AssetRegistry', subjectId: id, payload: {} }), { streamId: id });
  const count: Projection<number> = { name: 'n', initial: () => 0, apply: (s) => s + 1 };
  const events = new EventService({ bus });
  const { state } = await events.replayEvents(count);

  const allUp = Object.values(components).every(Boolean) && bus.getDeadLetters().length === 0;
  console.log('KMOS health');
  console.log('-----------');
  for (const [k, v] of Object.entries(components)) console.log(`  ${v ? 'UP  ' : 'DOWN'}  ${k}`);
  console.log(`  bus events (replayed): ${state}`);
  console.log(`  dead letters: ${bus.getDeadLetters().length}`);
  console.log(`\nOVERALL: ${allUp ? 'HEALTHY ✅' : 'DEGRADED ❌'}`);
  process.exit(allUp ? 0 : 1);
}
main().catch((e) => { console.error('HEALTH FAILED:', e); process.exit(1); });
