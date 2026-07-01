# ADR-KS-0001 — Knowledge Studio as a thin product layer over KMOS

Status: Accepted · Date: 2026-07-01 · Scope: Knowledge Studio (flagship app #001)

## Context

Knowledge Studio is the first product built on KMOS after the platform reached GA and its
kernel was frozen (ADR-0012). The brief: a real, standalone-useful product that
*immediately demonstrates why KMOS exists* — "drop long-form knowledge in, leave with
understanding" — while building entirely on the platform and not redesigning it. We had to
decide how the product relates to KMOS, how "verifiable knowledge" is realized, and how to
handle capabilities that need external infrastructure (YouTube download, ASR, video clips).

## Decision

1. **Thin product layer.** The app adds orchestration + UX only. It owns no business logic
   and no canonical objects; it drives KMOS services through their public business APIs and
   never bypasses them. The frozen kernel is untouched.
2. **Evidence, lineage, and trust are KMOS facts; the UI shows them.** Concepts are
   Knowledge objects; lineage is Asset lineage (`recordDerivation`); trust is a Governance
   assessment. **Evidence quotes and chapters are read-time projections** over the
   transcript Asset (the concept's evidence ref) — they *surface* where an idea appears and
   never fabricate a passage. A concept with no locatable passage shows no quote and is
   marked *needs review*.
3. **Evidence-decisive, honest trust.** `assessTrust` is called with identity + policy
   satisfying the mandatory gate, `knowledgeProvenance` reflecting a real passage, and
   `reviewerApproval: false`; at threshold `0.75` a grounded concept surfaces as *Trusted*
   and an ungrounded one as *Needs review*, with the full reason list shown.
4. **AI stays behind capability contracts.** Transcription, extraction, and translation run
   as KMOS capabilities; the offline build uses deterministic reference capabilities so
   everything works with no external services. Production swaps in real implementations
   (Whisper/Ollama/hosted) against the same contracts — provider independence, no app change.
5. **Honest capability boundaries.** Features needing external infra (yt-dlp download, ASR,
   ffmpeg clips) are architected behind contracts and **reported in the pipeline UI** with a
   `mode` tag (`external`) rather than faked. They are deferred, not dead ends.
6. **Own composition root; own port.** The app wires the KMOS services it needs
   (`createStudioPlatform` / `…FromEnv`) mirroring the reference platform's durable-Postgres
   + read-model-recovery pattern, and serves on its own port (8090).

## Consequences

- **Positive.** The product is genuinely differentiated (verifiable, durable, owned
  knowledge), the platform stays authoritative and reusable, AI is swappable, and the app is
  honest about what runs. It is the intended "front door" — using it explains KMOS.
- **Costs / trade-offs.** Offline concept quality is limited by the reference extractor
  (mitigated by connecting a production LLM capability). Per-source **job state** is
  in-memory in V1 (canonical knowledge persists in KMOS; the transcript/segment view is
  rebuilt on re-process) — a tracked roadmap item; single-replica for now. Evidence
  grounding is lexical in V1 (term-in-passage), which is precise but can miss paraphrase —
  a future semantic-grounding capability can improve recall without changing the contract.
- **Alternatives rejected.** (a) Extend the reference api-server directly — rejected to keep
  the product decoupled and to model "every deployable owns its composition." (b) Let the
  app call models/tools directly for richer output — rejected; it would couple the product
  to a provider and bypass KMOS. (c) Generate AI citations instead of projecting real
  passages — rejected; it breaks the core promise (verifiable, not asserted).

## References

KMOS-9999 §9 (applications are thin views) · ADR-0011 (read-model recovery) · ADR-0012
(architecture freeze) · [ARCHITECTURE.md](../ARCHITECTURE.md) · [VISION.md](../VISION.md).
