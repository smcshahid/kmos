# KMOS Application Packaging Standard

_The single packaging standard every KMOS application follows._ Generalized from the two
flagships (Knowledge Studio, Podcast Studio); they are the reference templates. ESRI-01.

> Generalize only where evidence exists: this standard is what **both** flagships share.
> Anything only one app has is not (yet) part of the standard.

## 1. Directory & files (every app has these)

```
products/<app>/              (or applications/<app> for thin reference apps)
├── package.json             @kmos/<app>-app · deps on @kmos/sdk + @kmos/providers +
│                            @kmos/content-projections + the domains it orchestrates
├── tsconfig.json            extends ../../tsconfig.base.json; references its @kmos deps
├── src/
│   ├── index.ts             exports + `isMain` entry: compose fromEnv → build service → serve
│   ├── platform.ts          composition: @kmos/sdk substrate + domains (no substrate boilerplate)
│   ├── <service>.ts         the application service (pipeline orchestration + read models)
│   ├── http.ts / web.ts     thin transport + UI (no business logic)
│   └── <store>.ts           durable job-state over the shared SqlClient port (optional)
├── test/                    node:test; offline; success + degradation paths
├── Dockerfile               self-verifying (`npm run verify`), serves on the app PORT
├── README.md                Vision + User Guide + quick start + ops/deploy
└── ARCHITECTURE.md          architecture + developer + extension guide
```

Plus a root `package.json` run-script (`"<app>": "node … <app>/src/index.ts"`) and a root
`tsconfig.json` project reference.

## 2. Constitutional rules (enforced)

- **Thin app** — business logic only in capabilities; canonical objects only in KMOS.
- **Compose via `@kmos/sdk`** — never repeat the platform-substrate boilerplate; domain
  composition stays in the app (KMOS-0200 §17).
- **Providers by config** — inject from `@kmos/providers` via `extractionConfigFromEnv()`;
  never name an engine ([Provider Guide](PROVIDER-GUIDE.md)).
- **Reuse shared capabilities** — `@kmos/content-projections`, reference capabilities.
- **Down-only dependencies** — fitness ranks enforce it; run `npm run fitness`.
- **Honest degradation** — offline path works (paste/reference); real infra via env.

## 3. Runtime & config conventions

- **Entry** (`index.ts`): `createXPlatformFromEnv()` → build service → `init()` (recovery) →
  serve. Distinct default `PORT` per app (KS 8090, Podcast 8091).
- **Durable when** `KMOS_DATABASE_URL` is set (PostgreSQL EventLog + job state + boot
  recovery); in-memory otherwise.
- **Providers** via `KMOS_LLM_*` / ASR endpoint env; **secrets injected at install**, never
  in git/image.
- **Health** at `GET /health` (liveness + count); dependency probes where relevant.

## 4. Verification (built into the image)

The Dockerfile runs `npm run verify` at build time — the image is **self-proving**: it does
not exist unless lint + typecheck + fitness + tests pass. Offline dev uses
`npm run verify:offline` (fitness + node:test).

## 5. Deployment artifacts

- **Dockerfile** (above) → image via the release workflow (§ [Release & Docker](RELEASE-AND-DOCKER.md)).
- **Olares Application Chart** (Helm `Chart.yaml` + `templates/` + `OlaresManifest.yaml`) —
  reuse `deployment/olares/` as the reference; consume Olares-provided PostgreSQL (do not
  bundle a DB); FQDN service discovery; `entrance.host` == Service name == release name.
- **Vanilla K8s** via `deployment/kubernetes/` values — portable, adapters/values only.

## 6. Checklist (a new app conforms when)

Package layout §1 · thin-app rules §2 · config/runtime §3 · self-verifying image §4 ·
deployment artifacts §5 · README + ARCHITECTURE present · fitness + conformance + tests green
· a root run-script + tsconfig reference added. Then it is a conformant KMOS application and
inherits the whole operational standard.
