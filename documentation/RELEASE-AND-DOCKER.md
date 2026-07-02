# Release & Docker Workflow (reproducible)

_The single, reproducible release workflow for KMOS and its applications._ ESRI-01.
Complements [RELEASE-LIFECYCLE](RELEASE-LIFECYCLE.md) (stages/gates) and
[VERSIONING-AND-COMPATIBILITY](VERSIONING-AND-COMPATIBILITY.md) (version semantics).

## 1. Images & workflows

Every deployable has a **self-verifying** Dockerfile (`npm run verify` at build time) and a
GitHub Actions release workflow that builds `linux/amd64` and pushes to Docker Hub:

| Image | Dockerfile | Workflow | Tag trigger |
|---|---|---|---|
| KMOS platform | `Dockerfile` | `.github/workflows/release-image.yml` | `v*` / manual |
| Knowledge Studio | `products/knowledge-studio/Dockerfile` | `release-studio-image.yml` | `studio-v*` / manual |
| Podcast Studio | `products/podcast-studio/Dockerfile` | `release-podcast-image.yml` | `podcast-v*` / manual |
| Caption/ASR sidecar | — | `release-caption-image.yml` | manual |

**Secrets:** `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` (repo secrets). The workflow fails early
if they are missing. Namespace = the (lowercased) Docker Hub username.

## 2. The reproducible flow

```
1. Verify locally:   npm run verify           (lint + typecheck + fitness + tests)
                     npm run conformance
2. Bump versions:    app/code (package.json), config/profile, output/contract — independently
3. Tag:              git tag <app>-v<semver>   (e.g. podcast-v1.0.0)   then git push --tags
4. CI builds:        the release workflow builds the self-verifying image and pushes:
                       docker.io/<ns>/<app>:<semver>  +  :latest
5. GitHub Release:    create a release from the tag with notes (RELEASE-NOTES.md)
6. Deploy:           pull the pinned image on Olares/K8s (see DEPLOYMENT/OLARES guides)
```

The image is reproducible because it is built from a tagged commit and **cannot exist unless
verification passed**. Pin the exact `:<semver>` (not `:latest`) in deployment manifests for
reproducible installs.

## 3. Tagging & versioning

- **Image tags:** `<app>-v<semver>` (git) → `<ns>/<app>:<semver>` + `:latest` (Docker Hub).
- **Three independent versions** (AIMPOS lesson): application/code, configuration/profile,
  output/contract — never conflate them. Record baseline advancements in
  [DECISIONS](../engineering/DECISIONS.md).
- **Immutable images** (olares-one lesson): production code is baked in; secrets injected at
  install; a factory reset is a *rebuild from this doc*, not re-troubleshooting.

## 4. Rollback

- **Image rollback:** redeploy the previous pinned `:<semver>` (images are immutable and
  retained on Docker Hub). Never rely on `:latest` for rollback.
- **Data:** the durable PostgreSQL EventLog is the system of record; read models rebuild by
  replay on boot (ADR-0011). See [BACKUP-AND-RESTORE](BACKUP-AND-RESTORE.md) +
  [DISASTER-RECOVERY](DISASTER-RECOVERY.md) for pg_dump/restore drills.
- **Olares/Helm:** `helm rollback` to the prior revision; keep the Market chart and in-cluster
  release in sync (olares-one lesson — Market vs in-cluster upgrades can diverge).

## 5. Lessons captured (from prior deployments)

- Use **FQDN service discovery**, never hardcoded cluster IPs (they change on reinstall).
- `entrance.host` **must equal** the Service name == release name (else "stuck initializing").
- **Secrets at install** via Olares Studio / K8s Secret — never in git or images; do not rely
  on install-time prompts for non-required env.
- Cross-namespace calls can `503`; make every cross-app call retry-safe with backoff/timeout,
  or use the supported out-of-band host tool.
- Consume Olares-provided **PostgreSQL** middleware; do not bundle a database.
- Keep the **Market chart and in-cluster release in sync**; re-upload the packaged chart for
  clean reinstalls.

See [OLARES-DEPLOYMENT-GUIDE](OLARES-DEPLOYMENT-GUIDE.md) and [OPERATIONS-GUIDE](OPERATIONS-GUIDE.md)
for the full Olares runbook.

## 6. Automated release (tag → artifacts)

`.github/workflows/release.yml` makes a platform release a single action — push a `v<semver>`
tag (or dispatch), and CI does the rest:

```
Tag v* → verify (lint · fitness · typecheck · unit · conformance)
       → build & push image (docker.io/<ns>/kmos:<semver> + :latest)
       → package Olares Application Chart (.tgz) + SHA256SUMS.txt
       → create GitHub Release with the chart, notes, and checksums attached
```

The **GitHub Release is the authoritative download** — the Olares chart and checksums are
attached; no manual packaging, no repository spelunking.

### Automated vs. manual (honest status)

| Step | Status |
|---|---|
| Verify (static + tests + conformance) on tag | **Automated** (`release.yml` verify job) |
| Build + push platform image to Docker Hub | **Automated** (needs `DOCKERHUB_*` secrets) |
| Package Olares chart `.tgz` + checksums | **Automated** (`helm package` in `release.yml`) |
| Create GitHub Release + upload artifacts | **Automated** (`softprops/action-gh-release`) |
| App images (Knowledge/Podcast Studio) | **Automated** per-app (`release-studio-image.yml`, `release-podcast-image.yml`); add each app's Olares chart to the release job when it is published to Olares |
| First real run / secret provisioning | **Manual** — a maintainer sets `DOCKERHUB_USERNAME` + `DOCKERHUB_TOKEN` and pushes the first `v*` tag |

Everything from tag to downloadable artifacts is automated; the only manual prerequisites are
one-time secret provisioning and the deliberate act of creating the version tag.

