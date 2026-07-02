# KMOS Documentation Index

_The single entry point to KMOS documentation._ Each major topic has **exactly one
authoritative document** (below). Start with the Ecosystem Playbook; everything else is the
detail behind it. ESRI-01 — kept current to prevent drift.

## Start here

- **[The KMOS Book](THE-KMOS-BOOK.md)** — the definitive engineering handbook: the single,
  coherent entry point (Vision → Architecture → Capabilities → Building Apps → Operations →
  Governance → Future). Read this first; everything else is the depth behind it.
- **[Ecosystem Playbook](ecosystem/ECOSYSTEM-PLAYBOOK.md)** — the operational how-to for
  building on KMOS (human or AI).
- **[Ecosystem Constitution](ecosystem/ECOSYSTEM-CONSTITUTION.md)** — the enduring principles.
- **[Platform Vision](PLATFORM-VISION.md)** — what KMOS is and why.

## Authoritative document per topic

| Topic | Authoritative doc |
|---|---|
| **Engineering handbook (start here)** | [THE-KMOS-BOOK](THE-KMOS-BOOK.md) |
| Ecosystem principles | [ecosystem/ECOSYSTEM-CONSTITUTION](ecosystem/ECOSYSTEM-CONSTITUTION.md) |
| Release automation | [RELEASE-AND-DOCKER](RELEASE-AND-DOCKER.md) §6 (`.github/workflows/release.yml`) |
| Operational handbook (onboarding) | [ecosystem/ECOSYSTEM-PLAYBOOK](ecosystem/ECOSYSTEM-PLAYBOOK.md) |
| Platform architecture | [ARCHITECTURE](ARCHITECTURE.md) |
| Ecosystem architecture | [ecosystem/KEAI-01-ECOSYSTEM-ARCHITECTURE](ecosystem/KEAI-01-ECOSYSTEM-ARCHITECTURE.md) |
| Build an app / extract capabilities | [ecosystem/KEAI-01-ECOSYSTEM-DEVELOPMENT-GUIDE](ecosystem/KEAI-01-ECOSYSTEM-DEVELOPMENT-GUIDE.md) |
| Capability inventory | [ecosystem/KEAI-01-CAPABILITY-INVENTORY](ecosystem/KEAI-01-CAPABILITY-INVENTORY.md) |
| Capability lifecycle (rationale/trigger) | [CAPABILITY-EVOLUTION-ROADMAP](CAPABILITY-EVOLUTION-ROADMAP.md) |
| Capability development | [CAPABILITY-DEVELOPMENT-GUIDE](CAPABILITY-DEVELOPMENT-GUIDE.md) |
| Workflow development | [WORKFLOW-DEVELOPMENT-GUIDE](WORKFLOW-DEVELOPMENT-GUIDE.md) |
| **AI providers & configuration** | [PROVIDER-GUIDE](PROVIDER-GUIDE.md) |
| SDK | [ecosystem/KEAI-01-SDK-STRATEGY](ecosystem/KEAI-01-SDK-STRATEGY.md) |
| Developer guide | [DEVELOPER-GUIDE](DEVELOPER-GUIDE.md) |
| Getting started | [GETTING-STARTED](GETTING-STARTED.md) |
| Conformance | [CONFORMANCE](CONFORMANCE.md) |
| **App packaging standard** | [PACKAGING-STANDARD](PACKAGING-STANDARD.md) |
| **Release & Docker (reproducible)** | [RELEASE-AND-DOCKER](RELEASE-AND-DOCKER.md) |
| Release lifecycle (stages/gates) | [RELEASE-LIFECYCLE](RELEASE-LIFECYCLE.md) |
| Versioning & compatibility | [VERSIONING-AND-COMPATIBILITY](VERSIONING-AND-COMPATIBILITY.md) |
| Release notes | [RELEASE-NOTES](RELEASE-NOTES.md) |
| Deployment (overview + decision) | [DEPLOYMENT-GUIDE](DEPLOYMENT-GUIDE.md) · [DEPLOYMENT-DECISION-GUIDE](DEPLOYMENT-DECISION-GUIDE.md) · [DEPLOYMENT-TARGETS](DEPLOYMENT-TARGETS.md) |
| Olares deployment | [OLARES-DEPLOYMENT-GUIDE](OLARES-DEPLOYMENT-GUIDE.md) |
| Operations | [OPERATIONS-GUIDE](OPERATIONS-GUIDE.md) |
| Upgrade / rollback | [UPGRADE-GUIDE](UPGRADE-GUIDE.md) |
| Backup / disaster recovery | [BACKUP-AND-RESTORE](BACKUP-AND-RESTORE.md) · [DISASTER-RECOVERY](DISASTER-RECOVERY.md) |
| Troubleshooting | [TROUBLESHOOTING-GUIDE](TROUBLESHOOTING-GUIDE.md) |
| Migration | [MIGRATION-GUIDE](MIGRATION-GUIDE.md) |
| **Release readiness gate** | [RELEASE-READINESS-CHECKLIST](RELEASE-READINESS-CHECKLIST.md) |
| **Manual testing philosophy** | [MANUAL-TESTING-PHILOSOPHY](MANUAL-TESTING-PHILOSOPHY.md) |
| Governance model | [GOVERNANCE-MODEL](GOVERNANCE-MODEL.md) |
| Security review | [SECURITY-REVIEW](SECURITY-REVIEW.md) |
| Architecture decisions | [adr/README](adr/README.md) |
| Decisions log | [../engineering/DECISIONS.md](../engineering/DECISIONS.md) |
| v1 record | [V1-RECORD](V1-RECORD.md) |
| API reference | [api/](api/) |

## Conventions (to prevent drift)

- **One authoritative doc per topic** (this table). New lessons **edit the authoritative
  doc**, never a new near-duplicate.
- **Cross-reference, don't copy.** The Playbook and this index are the maps; the detail lives
  in one place each.
- **Ecosystem docs reflect the ecosystem, not the historical journey.** Point-in-time
  engineering reviews and the v1 record are archived under `engineering/review/` and
  `V1-RECORD.md`; they are history, not the operating docs.
