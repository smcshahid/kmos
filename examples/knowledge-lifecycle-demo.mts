/**
 * KMOS reference demo — end-to-end knowledge lifecycle on the live platform.
 *
 * Runs the whole institutional journey on ONE shared canonical event bus, using
 * the real services/domains/applications, and prints an evaluator-facing report:
 *   org + actor → media import → language/knowledge → governance approval →
 *   publication → preservation → search → lineage → trust → event audit/replay.
 *
 * Run:  npm run demo
 * (node --experimental-strip-types --import ./tools/dev/register.mjs examples/knowledge-lifecycle-demo.mts)
 */
import { EventBus, type Projection, type StoredEvent } from '@kmos/canonical-kernel';
import { createPlatformCatalog } from '@kmos/platform-catalog';
import { IdentityService } from '@kmos/identity';
import { AssetRegistryService } from '@kmos/assets';
import { KnowledgeService } from '@kmos/knowledge';
import { GovernanceService } from '@kmos/governance';
import { CapabilityRegistryService } from '@kmos/capability-registry';
import { CapabilityRuntimeService } from '@kmos/capability-runtime';
import { EventService } from '@kmos/events';
import { SearchService } from '@kmos/search';
import { MediaDomainService } from '@kmos/media';
import { LanguageDomainService } from '@kmos/language';
import { PublishingDomainService } from '@kmos/publishing';
import { PreservationDomainService } from '@kmos/preservation';
import { KnowledgeStudio } from '@kmos/knowledge-studio';
import { ArchiveExplorer } from '@kmos/archive-explorer';

const log = (...a: unknown[]) => console.log(...a);
const h = (t: string) => log('\n\x1b[1m== ' + t + ' ==\x1b[0m');

async function main(): Promise<void> {
  const bus = new EventBus({ catalog: createPlatformCatalog() });
  const identity = new IdentityService({ bus });
  const assets = new AssetRegistryService({ bus });
  const knowledge = new KnowledgeService({ bus });
  const governance = new GovernanceService({ bus });
  const registry = new CapabilityRegistryService({ bus });
  const runtime = new CapabilityRuntimeService({ bus });
  const events = new EventService({ bus });
  const search = new SearchService({ bus });
  const media = new MediaDomainService({ bus, assets, registry, runtime });
  const language = new LanguageDomainService({ bus, knowledge, registry, runtime });
  const publishing = new PublishingDomainService({ bus, assets, governance, registry, runtime });
  const preservation = new PreservationDomainService({ bus, assets });
  const studio = new KnowledgeStudio({ search, knowledge });
  const explorer = new ArchiveExplorer({ assets });

  h('1. Organization & actor (Identity)');
  const org = await identity.createOrganization('Institute of Knowledge');
  const editor = await identity.createIdentity({ kind: 'Human', displayName: 'Aisha (Editor)', organizationId: org.id });
  log(`org=${org.id}\neditor=${editor.id}`);

  h('2. Media import + transcription (Media domain → Asset Registry + Workflow + Runtime)');
  const lecture = await media.preserveLecture({ title: 'On Sincerity', audioRef: 'kmos:Asset:lecture-001', checksum: 'sha256:seed', organizationId: org.id });
  log(`audioAsset=${lecture.audioAssetId}\ntranscriptAsset=${lecture.transcriptAssetId}\nworkflow=${lecture.state}`);

  h('3. Language → Knowledge (correction, extraction, vocabulary)');
  const lang = await language.processTranscript({ transcript: 'Sincerity leads to Purification and lasting Sincerity', targetLanguage: 'ar', organizationId: org.id });
  log(`concepts created: ${lang.conceptIds.length}`);
  for (const id of lang.conceptIds) {
    const d = studio.conceptDetail(id);
    if (d) log(`  • ${d.knowledge.body.canonicalName} — "${d.knowledge.body.definition}" [vocab: ${d.vocabulary.map((v) => v.body.language + ':' + v.body.preferredTerm).join(', ') || 'none'}]`);
  }

  h('4. Publication with governance approval (Publishing + Governance)');
  const pub = await publishing.publish({ title: 'On Sincerity (article)', knowledgeIds: lang.conceptIds, assetIds: [lecture.transcriptAssetId], approver: 'Aisha (Editor)', organizationId: org.id });
  log(`released=${pub.released}`);

  h('5. Preservation (integrity + evidence package)');
  const pres = await preservation.preserve({ assetIds: [lecture.audioAssetId, lecture.transcriptAssetId], organizationId: org.id });
  log(`preserved=${pres.preservedAssetIds.length} failed=${pres.failedAssetIds.length}`);

  h('6. Search & discovery (Knowledge Studio over Search)');
  const hits = studio.find('Sincerity');
  log(`query "Sincerity" → ${hits.length} hit(s): ${hits.map((x) => x.subjectId.slice(0, 24) + '…').join(', ')}`);

  h('7. Lineage / chain of custody (Archive Explorer)');
  const lineage = explorer.lineageView(lecture.transcriptAssetId);
  log(`transcript ancestors: ${lineage.ancestors.length} (reaches source audio: ${lineage.ancestors.includes(lecture.audioAssetId)})`);

  h('8. Trust assessment (Governance — explainable)');
  const trust = governance.assessTrust({ subjectId: lang.conceptIds[0]!, evidence: { knowledgeProvenance: true, assetIntegrity: true, reviewerApproval: true, identityVerification: true, policyCompliance: true } });
  log(`trusted=${trust.trusted} score=${trust.score.toFixed(2)}\nreasons: ${trust.reasons.join('; ')}`);

  h('9. Institutional audit + replay (Event Service)');
  const metrics = await events.getEventMetrics();
  log(`total canonical events: ${metrics.totalEvents}; dead letters: ${bus.getDeadLetters().length}`);
  const byProducer: Projection<Record<string, number>> = {
    name: 'by-producer', initial: () => ({}),
    apply: (s, e: StoredEvent) => ({ ...s, [e.event.identity.producer]: (s[e.event.identity.producer] ?? 0) + 1 }),
  };
  const { state } = await events.replayEvents(byProducer);
  log('events by producer (rebuilt by replay):');
  for (const [p, n] of Object.entries(state).sort((a, b) => b[1] - a[1])) log(`  ${String(n).padStart(3)}  ${p}`);

  h('Result');
  log('✅ End-to-end knowledge lifecycle completed on the live KMOS platform.');
}

main().catch((e) => { console.error('DEMO FAILED:', e); process.exit(1); });
