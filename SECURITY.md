# Security Policy

## Scope & current posture
KMOS enforces **attribution + authorization** at the canonical event chokepoint
(`CallContext` + `Authorizer` + `requireActor`; see `testing/security/`). The
HTTP API accepts `x-kmos-actor` / `x-kmos-organization` attribution headers.

Production-grade controls are **staged, not yet shipped** (honest status; see
`documentation/SECURITY-REVIEW.md`): real OIDC/JWT auth, mTLS/SPIFFE workload
identity, Vault-backed secrets, encryption at rest, signed events, WORM
retention. Do not deploy KMOS to handle sensitive data until these land.

## Reporting a vulnerability
Report suspected vulnerabilities privately to the maintainers (do not open public
issues for security reports). Include reproduction steps and impact. You will
receive an acknowledgement and a remediation timeline.

## Hardening roadmap
Tracked in `documentation/SECURITY-REVIEW.md` (remediation backlog) and
`engineering/review/` (certification + readiness assessments).
