# Ecosystem Capability White Paper

_KEAI-01 · 2026-07-01 · the architectural foundation for the next decade of KMOS
applications._

## 1. Vision

KMOS is not an application and not a media tool. It is an **operating system for an
institution's permanent knowledge and media**, on top of which many applications are
built and above which they are all replaceable. The ecosystem's purpose is that a
developer, ten years from now, can build a new application — Podcast Studio, Meeting
Studio, Research Studio, a Media Pipeline, MuhammadanWay — by **composing capabilities**
whose providers they never have to know, over a **knowledge core** whose meaning never
changes when the database, the model, the media engine, or the cloud does.

The measure of success is subtractive: **each new application should be mostly
composition, not construction.** When that is true, the founder can shift focus almost
entirely to applications, confident the platform and capability layers are mature and
unlikely to require redesign.

## 2. Goals

1. **Codify the convergent architecture** the founder's systems already discovered, so
   it is inherited by default, not rediscovered per project.
2. **Make capabilities the unit of reuse** — provider-independent, contract-stable,
   evidence-extracted.
3. **Keep applications thin** — orchestration and product semantics only.
4. **Preserve knowledge, evidence, provenance, and trust** as permanent assets
   independent of any technology.
5. **Grow only on evidence** — no speculative frameworks; every abstraction cites a real
   application need.
6. **Deploy anywhere, verify on the real target** — Olares-first, portable, immutable,
   resilient.

## 3. What the evidence shows — the convergence

Four systems, built independently, arrived at the same shape. This is the central
finding of KEAI-01 and the reason the architecture is trustworthy.

| Concern | AIMPOS (AI Production Media) | Media Pipeline / MPP | olares-one | KMOS |
|---|---|---|---|---|
| System of record | PostgreSQL; Neo4j/Redis are projections | PostgreSQL catalog; filesystem/IPFS content | per-app Postgres; catalog | canonical **event log**; graph/search are projections |
| Provenance/lineage | outbox → Neo4j lineage; immutable `audit_event` | immutable `Provenance`, `LifecycleEvent` | provenance in catalog | Assets lineage + immutable events |
| Provider abstraction | **capability + quality-tier → router**; fail-closed | thin adapters per external system | shared tool plane + thin adapters | **capability contract + `withFallback`** (KCSI-01) |
| Orchestration | Temporal, durable + deterministic + HITL | job queue + lifecycle state machine | n8n baby-step validation | **Workflow Service**, deterministic, no hidden I/O |
| Governance | acceptance packages, PASS/FAIL, propose-never-publish | ADRs, freeze gates, UAT, exceptions | failure catalog, golden path | constitution, ADRs, conformance, governance service |
| Deployment | Olares-authoritative; immutable images | Olares + portable K8s values | paved-road tiers; FQDN discovery | Olares reference chart (ADR-0010), portable |
| Storage | content-hash blobs; hot→warm→cold | hot/warm/cold + **IPFS A1 text-permanence** | PVC tiers; MinIO/IPFS | Assets with storage locators |

The columns differ in maturity and domain, but the **rows are the same architecture**.
KMOS is the distilled, constitutionalized version of what the media systems learned by
building. KEAI-01's job is to finish that distillation for the capability layer.

## 4. Lessons learned (worth making permanent)

Extracted from the reference systems; each is now an ecosystem principle
(Constitution article in parentheses).

1. **Capability-first beats plugins.** AIMPOS explicitly rejected a generic tool
   registry; callers express intent + quality tier and a router picks the engine. This
   independently confirms KCSI-01. (Art. V)
2. **Fallback within a capability, never across.** Same-capability degradation is safe;
   silently substituting a different capability is a defect. Fail closed and loud. (Art. V)
3. **Catalog/log as source of truth; everything else is a projection.** Reconciliation
   and audit require it; POSIX metadata and JSON flatfiles do not survive. (Art. VI)
4. **Immutable provenance is a business rule.** Source/who/when/how are locked after
   registration — audit certainty depends on it. (Art. VI)
5. **Business lifecycle ≠ job state.** Operators care about
   Registered/Enriched/Published, not pending/running. Model them separately. (Art. VII)
6. **AI proposes; humans/governance dispose.** Nothing AI-generated reaches
   distribution unapproved; disclosure/consent recorded before generation. (Art. VII)
7. **Durable + deterministic workflows.** Side effects in activities only; state by
   replay, not hidden memory. (Art. VII)
8. **Tiered storage + content-addressed permanence.** Assume no single tier holds
   everything; preserve durable text/knowledge even when heavy media is not. (Art. VI/VIII)
9. **Resilience by default.** Retry + backoff + timeout + idempotency + health probes on
   every cross-service call; isolation is designed around, not fought. (Art. V/VIII)
10. **Olares-authoritative, immutable, portable.** Verify on the real estate; bake
    images; inject secrets; no hardcoded IPs. (Art. VIII)
11. **Frozen architecture before code, governance with code.** DDD contexts and
    contracts settled before implementation; ADRs, evidence, conformance travel with
    every change. (Art. IX)
12. **Durable operational memory.** Every failure becomes one guardrail; the rebuild
    runbook is executable from the doc alone. (Art. VIII)

## 5. Mistakes (worth never repeating)

Honestly recorded from the reference systems — the anti-hype evidence that makes the
lessons credible:

1. **Generic plugin/registry systems for multi-agent work** — fragile; agents hardcode
   tool names; swaps break callers. Use capability routing instead.
2. **Dual-writing to cache and primary store without an outbox** — split-brain. Write
   the fact, then project.
3. **Promising visual continuity (serial characters) with prompt-only generation** —
   AIMPOS measured pairwise byte-mismatch; it requires reference-image architecture.
   Don't promise what the technique can't deliver.
4. **Over-investing in immature models** — AIMPOS i2v was 14× slower than slideshow and
   uncertified. Benchmark wall-clock end-to-end before shipping.
5. **Hardcoded cluster IPs / entrance-name ≠ service-name / secrets in git/images /
   Studio-DevBox-as-production** — the olares-one failure catalog. Each is now a
   guardrail.
6. **Conflating version semantics** — application code vs. config/profile vs.
   output/contract are three versions; track them independently.
7. **Duplicating shared capability logic per app** — inconsistency and GPU waste.
   Centralize the capability once; apps call it.
8. **Speculative abstraction ahead of demand** — the failure mode this whole initiative
   exists to prevent.

## 6. Architectural principles (the distilled set)

1. Knowledge before applications; evidence before files; capabilities before services;
   events before integration; governance before publication; trust before optimization;
   business meaning before technology. (KMOS constitution — unchanged.)
2. Applications orchestrate; capabilities perform; providers are replaceable and
   invisible.
3. The log is the system of record; read models are projections.
4. Extraction is evidence-first; abstraction is never built ahead of a real application.
5. Capability-first provider routing; fallback within a capability; fail closed.
6. Durable, deterministic, human-gated work; immutable provenance; honest trust.
7. Olares-first, portable, immutable, resilient; operational memory is durable.
8. Governance travels with code; independent review challenges every extraction.

## 7. Evolution strategy

- **Application-pulled.** The next capabilities are pulled into existence by the next
  real application. The highest-value forcing function is **building Media Pipeline on
  KMOS** — it is the concrete second consumer that legitimately promotes acquisition,
  media-processing, subtitles, translation, and publishing from *candidate* to
  *extracted* (see the [Capability Inventory](KEAI-01-CAPABILITY-INVENTORY.md) and
  [Roadmap](../CAPABILITY-EVOLUTION-ROADMAP.md)).
- **KCSI-cadence.** Each capability initiative is small, evidence-cited, independently
  reviewed, and closes with a proven/deferred assessment — exactly as KCSI-01 did.
- **Refine, don't rebuild.** KCSI-01 was validated by this research; its next refinement
  (quality tiers + resilience on adapters) is evidenced, not speculative.
- **Kernel stays frozen.** All growth is at the capability/SDK/application layers.

## 8. Long-term philosophy

Build like the architects of operating systems, not of applications. Applications,
providers, models, and clouds come and go on their own schedules; the knowledge core
and the capability contracts are the stable substrate they move across. Prefer the
smallest durable abstraction that a real application demands, written so clearly that
the next engineer extends it rather than replaces it. Be honest about what does not yet
work. Let evidence, not enthusiasm, decide what becomes permanent. If in ten years a
developer can build a new KMOS application without knowing which provider transcribes,
translates, renders, or reasons — and without rewriting when those providers change —
this foundation will have succeeded.
