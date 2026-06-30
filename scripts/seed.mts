/**
 * Seed a sample organization with starter knowledge + evidence on a fresh KMOS
 * platform, and print a summary an evaluator can use. Run: npm run seed
 */
import { EventBus } from '@kmos/canonical-kernel';
import { createPlatformCatalog } from '@kmos/platform-catalog';
import { IdentityService } from '@kmos/identity';
import { AssetRegistryService } from '@kmos/assets';
import { KnowledgeService } from '@kmos/knowledge';
import { createHash } from 'node:crypto';

const sha = (t: string) => createHash('sha256').update(t).digest('hex');

async function main(): Promise<void> {
  const bus = new EventBus({ catalog: createPlatformCatalog() });
  const identity = new IdentityService({ bus });
  const assets = new AssetRegistryService({ bus });
  const knowledge = new KnowledgeService({ bus });

  const org = await identity.createOrganization('Sample Institute');
  const editor = await identity.createIdentity({ kind: 'Human', displayName: 'Sample Editor', organizationId: org.id });

  const concepts = ['Sincerity', 'Patience', 'Mercy'].map((name) =>
    knowledge.createKnowledge({ category: 'Concept', canonicalName: name, definition: `The concept of ${name}.`, primaryLanguage: 'en', organizationId: org.id }),
  );
  for (const c of concepts) knowledge.addVocabulary(c.id, { language: 'ar', preferredTerm: c.body.canonicalName });

  const doc = await assets.registerAsset({
    assetType: 'Document', mediaType: 'text/plain', displayName: 'Seed source document', organizationId: org.id,
    storageRef: { storageId: 'seed-doc', backend: 'object' }, checksum: sha('seed'), content: new TextEncoder().encode('seed'),
    provenance: { origin: 'Ingested' },
  });

  console.log(JSON.stringify({
    organization: org.id,
    editor: editor.id,
    concepts: concepts.map((c) => ({ id: c.id, name: c.body.canonicalName })),
    asset: doc.id,
    events: bus.eventLog.size(),
  }, null, 2));
  console.log('\n✅ Seed complete. Use these ids with the reference applications / demo.');
}
main().catch((e) => { console.error('SEED FAILED:', e); process.exit(1); });
