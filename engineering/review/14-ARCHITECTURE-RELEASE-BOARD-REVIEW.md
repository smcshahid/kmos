# KMOS v1.0 — Architecture & Release Board Review

_Independent strategic review prior to the final engineering push toward General Availability._
_Date: 2026-06-30 · Review id: review/14 · Status: ADVISORY (no source code changed)_

**Review panel (roles assumed for this mission):** Independent Architecture Review Board ·
External Enterprise Architecture Consultancy · Office of the CTO · Platform Strategy ·
Open-Source Foundation Technical Steering Committee · Long-term Platform Steward.

**Posture.** This is a challenge review, not a validation exercise. Prior decisions are
treated as hypotheses to be tested against the repository as it exists today, not as settled
truth because they were implemented. Every material claim below is grounded in an artifact in
the repository or a command that was run against it. Where the evidence is an assertion rather
than something executable in this environment, that is stated explicitly.

**Evidence base (verified this session).**
- `npm test` → **217 tests, 217 pass, 0 fail**.
- `node tools/fitness-checks/run.mjs` → **0 violations** (142 source files, 28 workspace packages mapped).
- **29** `package.json` files, all at `1.0.0-rc.1`; **142** non-test source `.ts` files; **43** test files.
- Constitution corpus present (`constitution/` + `reference/` + `specifications/` 000/0100/020 families).
- Documentation body: 12 guides + `adr/` (7 ADRs) + `api/openapi.json` (~3,085 doc lines).
- Engineering record: readiness report, certification report, decisions log, known-issues, and 14 review reports (00–14).

---

## 1. Executive Summary

KMOS has reached a level of architectural and engineering maturity that is uncommon for a
pre-GA platform. The constitutional architecture is coherent and is genuinely enforced — not
merely described — by automated architecture-fitness checks that pass with zero violations
across 28 packages. The platform has a single source of truth for its canonical model, a
disciplined ports-and-adapters boundary, an event-sourced spine with replay, and, as of the
last release, a **Conformance Kit** that turns "what it means to be KMOS-compliant" into an
executable, self-certifying contract. The engineering record is exemplary: decisions are
logged, debt is named rather than hidden, and on at least two occasions the implementation
team chose to revert risky work rather than ship something it could not verify. That judgment
is itself a strategic asset and is the strongest single signal that the platform's direction
is sound.

The platform is **not yet General Availability**, and the team's own assessment of that is
correct and honest. The remaining gap is real but it is, in the panel's judgment,
**predominantly execution rather than unresolved strategic design**: the async-kernel
migration (KEP-001/CRIT-1) is fully planned and the ports it must satisfy already exist;
PostgreSQL persistence sits behind ports with a contract test already written; OIDC/secrets
are interface-shaped and awaiting real backends; the HTTP server and reference UI already run.
What stands between today and GA is a networked, type-checked, database-backed environment in
which that planned work can be **executed and verified**, plus a small number of strategic and
stewardship decisions that only the owner can make (chiefly the LICENSE).

The panel also identifies a short list of genuine — but bounded — concerns that should be
resolved before or during the next release: a **governance inconsistency** (the Coding
Constitution directs reverse-dependency ADRs to `architecture/adr/`, which is empty; all ADRs
actually live in `documentation/adr/`), the **absence of a few platform-level canonical
documents** that a multi-organization ecosystem will need (a Versioning & Compatibility
Policy, a Release Lifecycle, and a single Governance Model document), and the **public-release
blockers** (LICENSE = UNLICENSED, empty scaffolding directories, no SDK yet).

**Final recommendation (detailed in §15): READY FOR KMOS v1.0 PRODUCTION SUBSTRATE**, subject
to a small set of named prerequisites that are stewardship decisions, not engineering unknowns.
The panel is convinced the architecture is stable enough to freeze and that the path to GA is
now an execution path.

**Readiness at a glance:**

| Dimension | Rating | One-line basis |
|---|---|---|
| Constitutional architecture | 🟢 Strong | Coherent, enforced (0 fitness violations), internally consistent |
| Platform identity | 🟡 Good, sharpen | Clear vision; needs a crisper "who/what/why-different" front door |
| Platform boundaries | 🟢 Strong | Kernel/services/capabilities/adapters/apps cleanly separated and enforced |
| Long-term evolution | 🟡 Sound, gated | Excellent foundations; freeze + versioning policy still pending |
| Engineering quality | 🟢 Strong | Tests, fitness, conformance, honest debt ledger, revert discipline |
| Ecosystem readiness | 🟡 Foundational | Conformance Kit is the keystone; SDK/templates not yet shipped |
| Documentation | 🟢 Good | Broad and coherent; a few platform-level docs missing |
| Governance | 🟡 Good, reconcile | Strong ADR/conformance practice; ADR-home + change-process gaps |
| Public-release readiness | 🔴 Blocked | LICENSE unset; empty dirs; no SDK; needs presentation pass |
| Strategic roadmap | 🟢 Correct | Substrate-then-GA sequencing is the right order |

---

## 2. Architecture Assessment

**Verdict: architecturally sound and suitable for long-term evolution. No genuine
constitutional defect was found that would require redesign before GA.**

The architecture rests on a small number of load-bearing ideas, and the panel tested each one
against the code rather than the prose.

**Knowledge as the permanent asset.** The organizing principle — knowledge is permanent;
media, applications, and AI are replaceable representations and tools — is more than a slogan;
it shows up structurally. The canonical model lives in one kernel package, the event log is
append-only and replayable, and "institutional memory rebuilt purely by replaying the
immutable event log" is an actual passing test (`testing/resilience/disaster-recovery.test.ts`).
A platform whose memory can be reconstructed from its event history has chosen the right
center of gravity for a decade-scale system.

**Canonical kernel as single source of truth (ADR-0002, D-005).** `@kmos/canonical-kernel` is
zero-runtime-dependency and owns identifiers, the three-section event envelope, the schema
validator, and a single consolidated 97-type event catalog. The fitness checker enforces
"kernel purity" and "no canonical redefinition." This is the correct response to the platform's
own highest-rated risk (R-02, canonical drift) and it is enforced, not merely intended. The
earlier defect here — service-local event catalogs — was found and remediated (MED-5), and the
consolidation is verified by the catalog being the only definition the fitness pass accepts.

**Ports and adapters (ADR-0003, D-006).** The four-layer rule (api → application → domain →
infrastructure, dependencies inward only) is enforced across all layers, and the panel
confirms the dependency-direction check now spans every `@kmos/*` package. The strategic payoff
is concrete: the same EventLog **contract** validates both the in-memory adapter and the
Postgres adapter, which is exactly the mechanism that lets storage be swapped without
re-litigating correctness. This is the difference between a system that claims technology
independence and one that can prove it.

**Event-driven spine.** Cross-service contact is canonical events + business APIs only; no
service imports another service's internals (enforced). Events are validated → enforced
(attribution/authorization at the bus chokepoint, ADR-0005) → appended → dispatched, with
idempotent consumers and dead-lettering. This is a defensible, well-understood pattern for an
institutional system and it is implemented coherently.

**The one true architectural debt — and why it is not a redesign.** CRIT-1: the kernel
`EventLog` is synchronous, but durable storage is inherently asynchronous. ADR-0004 and
KEP-001 already specify the migration to an async port ("await-everywhere"). The team
attempted it, hit ~59 failures and a ~200-call-site blast radius with no type-checker to lean
on, and **reverted to protect the green baseline** — then wrote the plan to do it properly
under `tsc` in CI. The panel regards this as the correct call. Critically, this is an
*interface evolution that is already designed*, not an open design question. The async
signature is the known end-state; the contract test is written to await results so it already
accepts an async adapter. This is the single most important reason the panel can call the
remaining work "execution."

**Minor architectural observations (not blockers):**
- The synchronous bus currently dispatches inline; the async migration will move dispatch off
  the append path. Tests that assert synchronous capture will need the documented updates
  (already anticipated in KEP-001). This is the main correctness-sensitive part of the next
  release and should be landed first.
- `OrganizationCreated` is modeled via `IdentityCreated` (M1-01) and a few service-promoted
  event types (M1-02) should be folded into the kernel catalog during the freeze. These are
  catalog-hygiene items, not architecture.

**Constitutional coherence.** The constitution, coding-constitution, and specification corpus
were reconciled into one authority (D-001), with conflicts logged rather than resolved by
fiat. The "seven engines vs nine services" and repository-layout discrepancies were
reconciled explicitly (D-003, D-004). The panel finds the constitutional architecture
internally consistent and extensible. **No redesign is warranted.**

---

## 3. Platform Identity Assessment

**Verdict: the vision is clear and differentiated; the front-door articulation needs to be
sharpened for newcomers.**

A reader who works through the README and `documentation/ARCHITECTURE.md` will understand what
KMOS is. The "knowledge is the permanent asset" framing is genuinely distinctive — most
comparable systems are document stores, DAM systems, CMSes, or data platforms that treat
content as the primary object and provenance as metadata. KMOS inverts that, and that
inversion is its identity.

Where identity is currently under-served is the **five-question test** for someone who has
never seen the project:
- *What is it?* — Answered (an OS for institutional knowledge). Strong.
- *Why does it exist?* — Implied across the constitution but not stated crisply in one place
  for an outsider.
- *Who is it for?* — Under-specified. The platform clearly serves institutions with long-lived
  knowledge (archives, research bodies, media organizations, regulated enterprises), but no
  single document names the target adopter and their pain.
- *What problems does it solve?* — Present but distributed across specs.
- *How is it different?* — The differentiator (permanence + provenance + replayable
  institutional memory + governed capabilities) is real but never stated as a one-paragraph
  positioning.

**Recommendation.** Author a short **Platform Vision / "What is KMOS"** document (see §14) that
answers all five questions in under two pages and is linked first from the README. This is
low-effort and high-leverage for adoption; it is not a redesign, it is articulation of what
already exists. Identity is the cheapest thing to fix now and the most expensive to lack once
external teams start forming their own (divergent) mental models.

---

## 4. Platform Boundary Assessment

**Verdict: responsibilities are appropriately assigned; the boundaries are real and enforced.
A few empty "reserved" directories should be either populated or clearly marked.**

The layering is clean and, importantly, machine-checked:

| Layer | Location | Responsibility | Boundary status |
|---|---|---|---|
| Kernel | `packages/canonical-kernel` | Canonical objects, envelope, schema, bus, replay | 🟢 Zero-dep, purity-enforced |
| Conformance | `packages/conformance` | Executable compliance contracts | 🟢 Kernel-only dependency |
| Platform services | `platform/*` (10) | The seven engines + Configuration + Search | 🟢 No cross-service internal imports |
| Engines | `engines/*` | Platform-catalog, observability | 🟢 Below services |
| Capabilities | `capabilities/*` | Reference capability library | 🟢 Above platform |
| Domains | `domains/*` (5) | Media, language, publishing, preservation, AI-collab | 🟢 Compose capabilities |
| Connectors | `connectors/*` | Connector framework | 🟢 Adapter-side |
| Applications | `applications/*` (7) | Thin apps + api-server + learning-platform reference | 🟢 Top of stack |
| Reference | `reference/`, `examples/` | Canonical docs + runnable demo | 🟢 Outside the platform |

**What is correctly inside.** The canonical kernel, the conformance contracts, the seven
engines, and the observability primitives all belong inside the platform and are placed
correctly. The decision to make conformance a first-class package (rather than a test folder)
is strategically right: it is the artifact third parties will depend on.

**What is correctly outside.** The reference applications (knowledge-studio, research-portal,
archive-explorer, administration, learning-platform) are thin and live at the top of the
stack, exactly where reference implementations belong. The runnable demo is in `examples/`,
not in the platform. Good separation.

**Boundary concerns:**
- **Empty reserved directories.** `sdk/`, `extensions/`, `governance/` (executable policy), and
  `architecture/adr/` exist with README placeholders but no content. This is honest, and the
  READMEs explain intent — but to an outside adopter, empty top-level directories read as
  abandonment or incompleteness. Recommendation: either populate them in the Substrate release
  (at minimum a first SDK capability template) or move the not-yet-built ones to a documented
  "reserved" note rather than empty tree nodes.
- **Reference application count.** Five reference apps plus a learning-platform reference is
  generous for v1.0. This is not wrong, but each is a maintenance surface that must keep passing
  conformance as the kernel evolves. The panel suggests designating **one** app as the
  canonical, fully-maintained reference and labeling the rest as examples, so the maintenance
  burden during the async migration is bounded.

No component was found to be on the wrong side of a boundary. The boundary model is the
platform's strongest structural feature.

---

## 5. Engineering Assessment

**Verdict: engineering quality is high and, unusually, the engineering *process* quality is
even higher. Reviewing this as if it were another company's platform, the panel would rate it
above the median pre-GA platform on discipline and honesty.**

**Strengths (with evidence):**
- **Enforced architecture.** 0 fitness violations across 142 files / 28 packages, run this
  session. The rules are executable, so they cannot quietly rot.
- **Test breadth.** 217 tests spanning unit, contract, event, replay, resilience/DR,
  migration, performance, concurrency, security, integration, and certification. The presence
  of *replay* and *migration* tests specifically is a maturity signal most platforms lack.
- **Conformance as a product.** The Conformance Kit self-certifies the kernel's reference
  adapters and includes a **negative control** that proves it can detect non-compliance. A
  conformance suite that cannot fail is theater; this one can, and is tested to.
- **Honest debt ledger.** `KNOWN_ISSUES.md` and `DECISIONS.md` name every deferral (CRIT-1,
  pervasive identity, real persistence/OIDC) with severity and rationale. Nothing material is
  hidden behind optimistic status.
- **Revert discipline.** Two documented cases (async migration; truncated service file) where
  the team backed out rather than ship unverifiable work. This is the behavior you most want
  and least often see.
- **Offline rigor.** Faced with a blocked npm registry and no compiler, the team built a
  zero-dependency toolchain (node:test, strip-types, a dev resolver, a hand-rolled fitness
  checker) and still produced a green, enforced baseline.

**Weaknesses / risks (objective):**
- **Type-checking has never run.** `tsc` cannot run in the sandbox; the suite proves runtime
  behavior but not type soundness. This is the single largest *quality* gap. The CI workflow is
  written to run `typecheck`, but it has not yet executed against the full tree. Until it does,
  there is residual risk that the async migration uncovers type errors. (Mitigated by: strong
  test coverage and a best-effort strip-types syntax pass on all sources.)
- **No live database / network verification.** The Postgres adapter and OIDC/secrets are
  port-shaped and contract-tested against fakes; they have not run against real backends.
- **Mount-induced fragility.** The FUSE mount truncates large editor writes and blocks git;
  the team worked around it with shell here-docs and a commit *plan*. This is an environment
  artifact, not a platform defect, but it means source-control history does not yet exist.
- **Documentation/versioning drift risk.** Several status documents carry "2026-06-30"
  timestamps and overlapping version language ("RC", "1.0.0-rc.1", "library-grade"); a reader
  must triangulate across README, IMPLEMENTATION_STATUS, and the close-outs to get the precise
  state. A single authoritative status surface would reduce this.

**Net.** The engineering organization has earned trust. The weaknesses are concentrated in
"things that require a real environment to verify," which is precisely what the next release
provides — they are not defects of judgment or design.

---

## 6. Documentation Assessment

**Verdict: the documentation is broad, coherent, and role-aware. It is strong enough for GA
with the addition of three platform-level documents and one consolidation.**

The `documentation/` set already covers most audiences well:

| Audience | Covered by | Status |
|---|---|---|
| Architects | ARCHITECTURE.md, ADRs, Reference Atlas (KMOS-10050) | 🟢 |
| Developers | DEVELOPER-GUIDE, CAPABILITY-DEVELOPMENT, WORKFLOW-DEVELOPMENT, GETTING-STARTED | 🟢 |
| Operators | OPERATIONS-GUIDE, DEPLOYMENT-GUIDE, TROUBLESHOOTING | 🟢 |
| Integrators | api/openapi.json, API & Integration standard (KMOS-0180) | 🟢 |
| Adopters | README, GETTING-STARTED | 🟡 needs a Vision/Adoption front door |
| Contributors | CONTRIBUTING.md, SECURITY.md | 🟡 needs governance/versioning |
| Governance boards | CONFORMANCE.md, ADRs, certification reports | 🟡 no single Governance Model doc |

**Gaps that matter for a multi-organization platform (detailed in §14):**
1. **Versioning & Compatibility Policy** — there is no published statement of how canonical
   objects, events, and APIs evolve, what "breaking" means, or what stability guarantees
   adopters get. This is the highest-priority documentation gap; ecosystems form their
   expectations around it.
2. **Release Lifecycle** — the channels exist informally (RC → Substrate → GA) but are not
   documented as a repeatable lifecycle (entry/exit criteria, who ratifies, what "GA" means).
3. **Governance Model (single document)** — governance practice is excellent but scattered
   across ADRs, CONFORMANCE.md, and review reports. One canonical document would make the
   stewardship model legible to an external board.
4. **Platform Vision** — see §3.

**Consolidation.** The `IMPLEMENTATION_STATUS.md` has accreted mission-by-mission sections and
is now hard to read top-to-bottom. Recommend collapsing it to a current-state summary with an
appended changelog, so the *current* status is unambiguous.

The panel explicitly does **not** recommend creating documents for volume. The four above each
close a concrete stewardship gap; nothing else is missing.

---

## 7. Repository Assessment

**Verdict: well-organized and discoverable; needs a presentation and consistency pass before
it could be handed to public long-term ownership.**

**Strengths.** The tree is architectural rather than technological (KMOS-10020): `packages/`,
`platform/`, `engines/`, `capabilities/`, `domains/`, `connectors/`, `applications/`,
`testing/`, `documentation/`, `specifications/`, `reference/`, `constitution/`. A new engineer
can infer the architecture from the directory layout alone, which is the stated goal and is
achieved. Version alignment is clean (all 29 packages at `1.0.0-rc.1`), the test runner is
uniform (100% node:test after the vitest removal), and the engineering record is unusually
complete.

**Issues to resolve before public ownership:**
- **No version-control history.** Git does not function on the mount; there is a 63-commit
  *plan* (review/12) but no actual history. A public repository needs real, logical commit
  history. This must be materialized on a normal checkout.
- **Empty top-level directories** (`sdk/`, `extensions/`, `governance/`, `architecture/adr/`)
  — see §4. They harm first-impression quality.
- **Two ADR locations.** `documentation/adr/` holds the ADRs; `architecture/adr/` is empty,
  yet the Coding Constitution §4 names `architecture/adr/` as the home for reverse-dependency
  ADRs. This is a real inconsistency (see §8) and a discoverability trap.
- **Binary canonical sources.** The normative specs are `.docx`/`.pdf` in `specifications/`,
  `reference/`, and `constitution/`. For a platform whose creed is replayable, diffable
  institutional memory, normative authority living in opaque binaries is an irony worth fixing:
  publish Markdown renderings (or an index) so the constitution itself is diff-friendly and
  reviewable in PRs.
- **LICENSE absent / UNLICENSED** — see §9.

None of these are architectural; all are stewardship-and-presentation items appropriate to
schedule into the Substrate release.

---

## 8. Governance Assessment

**Verdict: the governance practice is strong and ahead of most platforms; the governance
*documentation and self-consistency* need a pass. One concrete inconsistency must be fixed.**

**What is working well.** The ADR process is real and used (7 ADRs covering the load-bearing
decisions, plus a fuller DECISIONS.md log). Certification and conformance are distinct and both
exist: certification is the human/engineering judgment (review reports 00–13), conformance is
the executable contract (the Kit). Repository governance (version alignment, dead-code removal)
has been performed and audited (review/11). Release governance has been exercised in practice
across the RC/Hardening/Foundation cycle. This is a mature posture.

**The concrete defect.** The Coding Constitution §4 states: *"Reverse dependencies require a
logged ADR in `architecture/adr/`."* That directory is **empty**; every ADR lives in
`documentation/adr/`. A governing document points to the wrong location for the artifact it
mandates. This is exactly the kind of small inconsistency that erodes a governance model's
authority over time. **Fix:** pick one ADR home (the panel recommends `documentation/adr/`,
where the ADRs already are), update the Coding Constitution to match, and either remove
`architecture/adr/` or make it a pointer.

**Gaps for long-term stewardship:**
- **Constitutional change process is undefined.** The constitution is treated as supreme
  authority, but there is no documented process for amending it (who proposes, who ratifies,
  how it is versioned). A decade-scale platform will need to evolve its own constitution; the
  process for doing so should exist before GA, precisely so that the first amendment is
  governed rather than ad hoc.
- **No versioning strategy** (see §6) — governance and versioning are intertwined; both should
  land together.
- **Conformance levels need an owner.** Core/Certified/Reference levels exist; who grants a
  "Certified" badge, and on what evidence, is not yet defined. This becomes load-bearing the
  moment a third party claims compliance.
- **Human ratification step.** The roadmap correctly calls for independent human-board
  ratification before GA. Defining that board's charter now (even briefly) would strengthen
  the GA gate.

Governance is good enough to proceed, provided the §8 inconsistency is fixed and the change
process + versioning policy are authored during the Substrate release.

---

## 9. Public Release Assessment

**Verdict: NOT ready for public release today — but the blockers are bounded, well-understood,
and mostly non-engineering.**

| Public-release dimension | Status | Note |
|---|---|---|
| Professionalism / consistency | 🟡 | High quality; needs presentation pass + status consolidation |
| Usability / onboarding | 🟢 | `npm run demo/serve/health/seed` work with no build or DB |
| Repository presentation | 🟡 | Empty dirs, binary specs, no git history |
| Documentation quality | 🟢 | Broad and coherent (gaps in §6 noted) |
| **Licensing** | 🔴 | `UNLICENSED` — legally blocks any external use or contribution |
| Contribution process | 🟡 | CONTRIBUTING + SECURITY exist; needs governance/versioning + CLA decision |
| Security posture | 🟡 | Enforcement mechanism + STRIDE review present; real OIDC/secrets/mTLS deferred |
| Onboarding for contributors | 🟡 | Good dev guide; no SDK/templates yet |

**The hard blocker is LICENSE.** `UNLICENSED` means no one outside the owner may legally use,
fork, or contribute. Every other public-release item is moot until this is decided. This is an
owner decision the panel cannot make; it is the highest-priority owner action.

**The honest strength** is that the platform *runs* for a newcomer with zero setup — the
offline demo, server, and health dashboard all work directly from source. That is a better
first-run experience than many GA platforms offer, and it should be foregrounded once the
license question is settled.

The panel's position: do **not** make the repository public until (a) a license is chosen,
(b) the presentation pass (empty dirs, status consolidation, Markdown specs) is done, and
(c) at least the Vision + Versioning + Governance documents exist. None of these block the
*Substrate* engineering release; they block *publication*, which should follow GA, not precede
it.

---

## 10. Strategic Roadmap Assessment

**Verdict: the existing roadmap is correctly prioritized and correctly sequenced. The panel
endorses Substrate-then-GA and would not reorder it.**

The current plan (NEXT_TASK.md) is: KEP-001 async kernel + Architecture Freeze → pervasive
identity → real PostgreSQL → real OIDC/secrets → CI green end-to-end + cluster deploy → LICENSE
+ human ratification → GA. This ordering is right for three reasons:

1. **KEP-001 must go first.** It is the one change that touches the kernel interface; doing it
   before persistence and identity means those land on the final signatures rather than being
   migrated twice. Sequencing it first minimizes total churn.
2. **Identity rides with KEP-001.** Pervasive attribution threads the same write paths the
   async migration touches; co-executing them (as planned) avoids two passes over 30 files.
3. **Verification gates last.** Real DB, real OIDC, cluster deploy, and CI-green are
   verification of the above, correctly placed after the code changes they validate.

**Adjustments the panel recommends folding in (small, additive):**
- Add the **governance/documentation deliverables** (§6, §8, §14) into the Substrate scope.
  They are cheap, they are prerequisites for GA, and authoring them while the architecture is
  being frozen is the natural moment.
- Add the **ADR-home reconciliation** (§8) as an early, trivial fix.
- Add a **first SDK capability template** (§4, §11) so the conformance contracts have a
  concrete, scaffolded consumer — this de-risks ecosystem claims before GA.
- Treat **type-check-green under `tsc`** as an explicit, named exit criterion of the Substrate
  release, not an implicit byproduct of CI. It is the largest unverified quality dimension.

The roadmap does not need re-prioritization; it needs these few additions absorbed into the
already-correct sequence.

---

## 11. Strategic Risks

Ordered by long-term cost-if-unaddressed.

- **R-A · Type soundness has never been verified (High, until Substrate).** No `tsc` has run
  against the full tree. The async migration is the moment latent type errors will surface.
  *Mitigation:* run `typecheck` first thing in the Substrate environment, before KEP-001, to
  establish a clean baseline; treat green `tsc` as an exit gate.
- **R-B · Async-kernel migration blast radius (High, bounded).** ~150–200 await edits across
  ~30 files; the prior attempt produced 59 failures. *Mitigation:* execute strictly per
  KEP-001 under `tsc` + the full suite + the conformance EventLog contract (which already
  awaits results); land it first and in isolation. The risk is real but designed-for.
- **R-C · No version-control history / single-environment fragility (Med-High).** The platform
  has never lived on a normal git checkout; the FUSE mount truncates writes and blocks git.
  *Mitigation:* materialize the repo on a standard checkout early in Substrate and run the full
  verify there; treat the commit plan (review/12) as the seed.
- **R-D · Versioning/compatibility policy absent (Med-High, compounding).** Without a published
  stability contract, early adopters will set their own expectations and later changes will be
  perceived as breaking. *Mitigation:* publish the policy during Substrate, before any external
  user exists.
- **R-E · Ecosystem promises outrunning ecosystem artifacts (Med).** The Conformance Kit is
  excellent, but SDK/templates/extensions are still empty directories. If the platform markets
  extensibility before shipping the means to extend, credibility suffers. *Mitigation:* ship one
  real SDK template + one example extension that passes conformance.
- **R-F · Governance self-inconsistency (Med).** The ADR-home defect (§8) and undefined
  constitutional-change process weaken the governance model's authority precisely when it is
  about to matter most. *Mitigation:* the §8 fixes.
- **R-G · Reference-app maintenance surface (Low-Med).** Several reference apps must all keep
  passing conformance through the kernel migration. *Mitigation:* designate one canonical
  reference app; mark the rest as examples.
- **R-H · License/legal (Med, owner-only).** UNLICENSED blocks adoption and contribution; left
  unresolved it silently caps the platform's reach. *Mitigation:* owner decision.

---

## 12. Strategic Strengths

These are the assets the panel would protect at all costs through the next release.

- **Enforced architecture, not aspirational architecture.** The fitness checks make the
  boundaries real. This is the platform's compounding advantage: it cannot silently decay.
- **Conformance Kit.** The single most strategically valuable artifact in the repository. It
  converts "trust us, it's KMOS" into "run the suite." It is the foundation of any future
  ecosystem, certification program, and third-party adapter market — and it already exists and
  self-certifies with a working negative control.
- **Replayable institutional memory.** A platform whose entire state can be rebuilt from an
  immutable event log — proven by a passing DR test — has the right durability story for a
  decade-scale knowledge system.
- **Single canonical source of truth.** One kernel, one event catalog, one envelope, enforced.
  This is the antidote to the drift that kills long-lived platforms.
- **Engineering honesty and judgment.** The debt ledger, the documented reverts, the refusal to
  fabricate unverifiable capability. This culture is harder to build than any feature and is the
  best predictor that the Substrate release will be executed well.
- **Zero-dependency, build-free first run.** `npm run demo/serve` work with no install or
  database. Exceptional onboarding ergonomics that most platforms never achieve.
- **Specification-first lineage.** The implementation is traceable to a numbered spec corpus and
  a constitution, with reconciliations logged. The platform can explain *why* it is the way it
  is — institutional memory about itself.

---

## 13. Recommendations Before General Availability

Grouped by owner; each is proportionate to its long-term impact.

**Engineering (Substrate release — execution of already-designed work):**
1. Run `tsc` to green against the full tree **first**, establishing a type baseline (R-A).
2. Execute **KEP-001** (async EventLog) under `tsc` + full suite + conformance EventLog
   contract; declare **Architecture Freeze v1.0** (R-B; ADR-0004).
3. Thread **pervasive identity/attribution** on the same write paths (co-execute with #2).
4. Stand up **real PostgreSQL** behind the existing ports; run the contract + DR/replay against
   a live DB; ship migrations.
5. Stand up **real OIDC + secrets management**; re-run the security review against real backends.
6. Make **CI green end-to-end** (including the database job) and validate **cluster deployment**.
7. Fold the kernel catalog-hygiene items (M1-01/M1-02) into the freeze.
8. Materialize **real git history** on a standard checkout (seed from review/12).

**Governance & documentation (Substrate release — prerequisites for GA):**
9. Fix the **ADR-home inconsistency** (§8) — trivial, do early.
10. Author the **Versioning & Compatibility Policy**, **Release Lifecycle**, **Governance
    Model**, and **Platform Vision** documents (§14).
11. Define the **constitutional-change process** and the **human-ratification board charter**.
12. Consolidate **IMPLEMENTATION_STATUS.md** to a current-state + changelog form.

**Ecosystem (Substrate or fast-follow):**
13. Ship one **SDK capability template** + one **example extension** that passes conformance
    (R-E); define who grants the "Certified" conformance level.
14. Designate one **canonical reference application**; relabel the rest as examples (R-G).

**Owner-only (gate GA / publication):**
15. Decide the **LICENSE** (R-H) — highest-priority owner action; blocks all public release.
16. Provision the **networked + type-checked + Postgres CI/dev environment** — the single
    enabler for items 1–6.
17. Do the **public-release presentation pass** (empty dirs, Markdown specs) before, and only
    before, making the repository public.

**Not recommended:** any architectural redesign, any new canonical objects/events beyond the
catalog-hygiene folds, or creating documents for volume. The architecture is sound; the work
is execution and stewardship.

---

## 14. Recommended Canonical Documentation

The panel recommends **four** new platform-level documents and **two** consolidations. Each
closes a specific stewardship gap; none is busywork.

1. **Platform Vision / "What is KMOS"** (new, ~2 pages). Answers what/why/who/problems/
   differentiation in one place; linked first from the README. Closes the identity gap (§3).
2. **Versioning & Compatibility Policy** (new). Defines semantic versioning for canonical
   objects/events/APIs, what "breaking" means, deprecation windows, and the stability guarantee
   adopters receive. **Highest-priority new doc** (§6, R-D).
3. **Release Lifecycle** (new). Documents RC → Substrate → GA channels with entry/exit criteria,
   who ratifies each gate, and the definition of GA. Makes the roadmap repeatable (§6, §8).
4. **Governance Model** (new, single document). Consolidates the ADR process, constitutional-
   change process, certification vs conformance, conformance-level authority, and the
   human-ratification board into one legible charter (§8).

**Consolidations (not new docs):**
5. Collapse **IMPLEMENTATION_STATUS.md** to current-state + changelog (§5, §6).
6. Publish **Markdown renderings (or a navigable index)** of the binary `specifications/`,
   `reference/`, and `constitution/` documents so the normative corpus is diffable (§7).

Documents the panel deliberately does **not** recommend creating now: a separate Adoption Guide
(GETTING-STARTED covers it until there are external adopters), a separate Operator Guide
(OPERATIONS-GUIDE suffices), and a standalone Conformance Specification (CONFORMANCE.md + the
Kit's typed contracts are sufficient for v1.0). Add these only when real external demand
appears.

---

## 15. Final Recommendation

> ## ✅ READY FOR KMOS v1.0 PRODUCTION SUBSTRATE
> _subject to the named prerequisites below — all of which are stewardship decisions or
> already-designed execution, not unresolved architecture._

**Justification.** The panel applied the owner's own bar: *advance only if genuinely convinced
the platform's direction is sound and the remaining work is primarily execution rather than
unresolved strategic design.* On the evidence, both conditions hold.

- **The direction is sound.** The constitutional architecture is coherent, internally
  consistent, extensible, and — uniquely — *enforced* (0 fitness violations across 28
  packages). No genuine constitutional defect was found. The one true architectural debt
  (CRIT-1) has a finished design (KEP-001/ADR-0004), a known end-state signature, and a
  contract test already written to accept it.
- **The remaining work is execution.** Persistence sits behind ports with a contract test;
  identity threading follows the async migration's own write paths; OIDC/secrets are
  interface-shaped; the server and UI already run; CI is written and waiting for an
  environment. None of these are open design questions. They require a real environment in
  which to be performed and verified — which is exactly what the Substrate release provides.
- **The engineering organization has earned the advance.** The debt is named, not hidden; risky
  work was reverted rather than faked; the conformance machinery can actually fail. This is the
  behavior that makes "execution" a safe bet.

**Prerequisites that must accompany the advance** (none block *starting* Substrate; all gate
*finishing* it toward GA):
- **Owner:** decide the LICENSE; provision the networked + type-checked + Postgres CI/dev
  environment. These two are the critical path and only the owner can supply them.
- **Engineering exit criteria:** `tsc` green; KEP-001 landed and Architecture Freeze v1.0
  declared; real Postgres + OIDC verified; CI green end-to-end incl. the database job; cluster
  deploy validated.
- **Governance/docs:** the ADR-home fix and the four new documents (§14) authored.

The panel does **not** recommend "GA delayed pending architectural concerns" — there are no
unresolved architectural concerns. Nor does it recommend "additional strategic work before
Substrate" — the strategic design work is done; what remains is to *execute and verify* it,
which is the definition of the Substrate release.

---

## KMOS v1.0 Production Substrate — Strategic Definition

_(Defined at a strategic level only, per the mission. No implementation begun.)_

**Purpose.** Transform the certified, library-grade reference implementation into a verified,
production-substrate platform running on real infrastructure under a real compiler — and freeze
the architecture — so that General Availability becomes a ratification step rather than an
engineering risk.

**Objectives.**
1. Land KEP-001 (async EventLog kernel) and declare **Architecture Freeze v1.0**.
2. Thread pervasive identity/attribution across all write paths.
3. Real PostgreSQL persistence behind existing ports, with migrations and live DR/replay.
4. Real OIDC authentication/authorization and real secrets management; refreshed security review.
5. Green CI end-to-end (static + tests + conformance + database job) and a validated cluster
   deployment.
6. The governance and documentation prerequisites (§13, §14) and the ADR-home fix.
7. First ecosystem artifact: one SDK capability template + one conformant example extension.

**Success criteria (exit gates).**
- `npm run verify` (lint + **typecheck** + fitness + tests) green in CI, including the live
  database job; **0 fitness violations** maintained; conformance **all profiles compliant**
  against real adapters.
- Architecture Freeze v1.0 formally declared and recorded as an ADR.
- A reference deployment stands up on a real cluster and serves `/health`, `/metrics`, and the
  reference UI against real Postgres + OIDC.
- Real git history exists on a standard checkout.
- The four canonical documents (§14) published; governance inconsistencies resolved.

**Expected outcomes.** A frozen, type-checked, infrastructure-backed KMOS whose every prior
"deferred to production" item is either delivered or has a verified adapter; an ecosystem story
backed by a real template; and a documentation/governance base sufficient for an independent
board to ratify GA.

**Prerequisites (must exist before the release can complete).**
- A networked, type-checked, Postgres-capable CI/dev environment (owner-provided).
- A LICENSE decision (owner-provided).
- The KEP-001 plan (exists, review/07/ADR-0004) and the conformance contracts (exist) as the
  guardrails for execution.

**Explicitly out of scope (defer to post-GA or later):** distributed/federated deployment,
marketplace governance, advanced semantic inference, cross-organization trust, predictive
orchestration (per the constitution's deferred list). Substrate is about making v1.0 real and
frozen — not about widening scope.

---

_End of review/14. Advisory only; no source code, specification, or constitutional document was
modified in the production of this review._
