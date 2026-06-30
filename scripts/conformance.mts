/** KMOS Conformance CLI. Certifies the reference adapters; exit 1 if any non-compliant. Run: npm run conformance */
import { InMemoryEventLog, ALLOW_ALL, createCanonicalObject, createEvent, newCanonicalId } from '@kmos/canonical-kernel';
import { transcription } from '@kmos/reference-capabilities';
import { runConformance, formatReport, eventLogContract, authorizerContract, capabilityHandlerContract, canonicalObjectContract, canonicalEventContract } from '@kmos/conformance';

async function main(): Promise<void> {
  const reports = [
    await runConformance('eventlog', eventLogContract(() => new InMemoryEventLog()), 'Certified'),
    await runConformance('authorizer', authorizerContract(() => ALLOW_ALL), 'Certified'),
    await runConformance('capability-handler', capabilityHandlerContract(() => transcription.create(), { audioRef: 'kmos:Asset:x' }), 'Certified'),
    await runConformance('canonical-object', canonicalObjectContract(() => createCanonicalObject({ id: newCanonicalId('Asset'), type: 'Asset', schemaVersion: '1.0', owner: 'AssetRegistry', body: {} }))),
    await runConformance('canonical-event', canonicalEventContract(() => createEvent({ type: 'AssetRegistered', schemaVersion: '1.0', producer: 'AssetRegistry', payload: {} })), 'Certified'),
  ];
  let ok = true;
  for (const r of reports) { console.log(formatReport(r)); console.log(''); ok = ok && r.compliant; }
  console.log(ok ? 'KMOS CONFORMANCE: ALL PROFILES COMPLIANT ✅' : 'KMOS CONFORMANCE: NON-COMPLIANT ❌');
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
