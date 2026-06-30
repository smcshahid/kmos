# KMOS Conformance Program

The **KMOS Conformance Kit** (`@kmos/conformance`) defines what it means to be
*KMOS-compliant* and is the long-term mechanism that protects the constitutional
architecture as KMOS evolves across products, implementations, SDKs, and teams.
It is a strategic platform capability — not merely a test collection.

## Why it exists
KMOS keeps every replaceable technology behind a port (storage, authorization,
capability execution, …). The Conformance Kit turns those ports into **published,
versioned contracts** that any implementation must satisfy to claim compliance.
This lets the ecosystem (Media Pipeline, MuhammadanWay, Preservation, Research,
Publishing, third parties) grow without forking or eroding the core.

## Profiles (v1)
| Profile | What it certifies | Spec |
|---|---|---|
| `eventlog` | A storage/EventLog adapter (sync or async) | KMOS-0203 |
| `authorizer` | An authorization Policy Decision Point | KMOS-0190 |
| `capability-handler` | A capability implementation (`invoke`/`health`) | KMOS-0120/0160/0210 |
| `canonical-object` | An object carrying the canonical common structure | KMOS-0100/0130/10030 |
| `canonical-event` | A registered, past-tense canonical event | KMOS-0110/10040 |

## Compliance levels
- **Core** — mandatory semantics; minimum bar to interoperate.
- **Certified** — Core plus stricter guarantees (append-only, explainable denials, naming).
- **Reference** — Certified plus reference-grade expectations (reserved for first-party).

## Using it
```bash
npm run conformance     # certify the reference adapters; exit 1 if any non-compliant
```
Programmatically (only `@kmos/canonical-kernel` is required):
```ts
import { runConformance, eventLogContract, formatReport } from '@kmos/conformance';
const report = await runConformance('eventlog', eventLogContract(() => myAdapter), 'Certified');
console.log(formatReport(report));      // ship the report as evidence
if (!report.compliant) process.exit(1);
```

## Guarantees
- **Framework-agnostic & serializable**: a report is data; embed in CI, an SDK, or a marketplace gate.
- **Sync/async agnostic**: contracts await results, so one EventLog contract validates both the in-memory and PostgreSQL adapters — the mechanism that keeps storage replaceable.
- **Negative-tested**: the kit detects non-compliant adapters (it does not merely pass happy paths).

## Roadmap
Add profiles for Search index, Configuration/SecretResolver, Connector, and the
HTTP API (OpenAPI conformance); publish a `kmos certify` CLI and a compliance
badge; gate the extension marketplace on Certified-level conformance.
