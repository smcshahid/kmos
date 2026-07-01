# Future Application Analysis

_KEAI-01 · 2026-07-01._ **Architecture only — no implementation.** Evaluating likely
future applications to find common vs. unique capabilities and reuse opportunity. This
informs *which* capabilities are worth the shared layer and *when* (via the second-
consumer rule).

## 1. The candidate applications

| App | One-line purpose | Nearest reference evidence |
|---|---|---|
| **Knowledge Studio** | Media → verifiable, navigable knowledge | built (KMOS) |
| **Media Pipeline** | Acquire, preserve, enrich, publish owned media | MPP / olares-one (built off-KMOS) |
| **Podcast Studio** | Podcasts/RSS → transcripts, chapters, show notes, clips | media-pipeline `repurpose.py`, chapters |
| **Meeting Studio** | Meeting recordings → minutes, decisions, action items | ASR + extraction + summarization |
| **Research Studio** | Web/library research → cited, lineage-tracked synthesis | olares-one AI Hub / CrawlStation |
| **MuhammadanWay** | Curated knowledge/media product over the core | motivating first-party consumer |
| **Publishing Studio** | Governed release of knowledge artifacts | `domains/publishing`, AIMPOS release gate |

## 2. Capability matrix (common vs. unique)

`●` needs it centrally · `○` needs it lightly · blank = not core.

| Capability | KStudio | MediaPipe | Podcast | Meeting | Research | Mu.Way | Publishing |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Knowledge core (concepts/lineage/trust) | ● | ● | ● | ● | ● | ● | ● |
| Governance / approval | ○ | ● | ○ | ● | ○ | ● | ● |
| Search (semantic/lexical) | ● | ● | ● | ● | ● | ● | ○ |
| Source acquisition | ● | ● | ● | ○ | ● | ○ | |
| Speech / ASR | ● | ● | ● | ● | | ○ | |
| Language / translation | ● | ● | ○ | ○ | ○ | ● | ○ |
| Media processing (ffmpeg) | ○ | ● | ● | ● | | ○ | |
| Chunking / segmentation | ● | ● | ● | ● | ● | ○ | ○ |
| Subtitles | | ● | ● | ○ | | | |
| Moment / clip intelligence | ○ | ● | ● | ● | | | |
| Summarization | ● | ● | ● | ● | ● | ● | ○ |
| Publishing / packaging | ● | ● | ● | ● | ● | ● | ● |
| Storage tiering / preservation | ○ | ● | ○ | ○ | | ● | ○ |
| Web crawl / research | | | | | ● | | |
| Generative media (avatar/video) | | ○ | | | | ○ | |

## 3. Reading the matrix

- **Everything left of "Media processing" plus Summarization and Publishing is common
  across ≥4 apps.** These are the *ecosystem's spine*: knowledge core, governance, search,
  acquisition, ASR, translation, chunking, summarization, publishing. Every one already
  has ≥2-app evidence today — they are the Candidate set (see [Capability
  Inventory](KEAI-01-CAPABILITY-INVENTORY.md) §C).
- **Media processing, subtitles, moment intelligence, preservation** cluster in the
  media-heavy apps (Media Pipeline, Podcast, Meeting). Strong reuse *within* that cluster
  — promote when the first media app lands on KMOS.
- **Web crawl/research** is unique to Research Studio today → defer until it is built.
- **Generative media** (avatar/video) is unique to production apps (AIMPOS-class) → stays
  app-specific; the *router pattern* is the reusable lesson, not the engines.

## 4. Reuse conclusion

- **~10 capabilities are common enough to be shared**, and all already have real
  second-consumer evidence — but per the Constitution they are promoted **only when the
  first KMOS consumer is built**, not preemptively.
- **The most reuse per unit effort comes from building one media application on KMOS.**
  Media Pipeline (or Podcast Studio) as the next app would legitimately promote
  acquisition, ASR (done), media-processing, chunking, subtitles, translation, moment
  intelligence, summarization, and publishing — the shared spine — with cited evidence.
  Every *subsequent* studio then becomes mostly composition.
- **Unique capabilities stay in their app** until a second consumer appears (web crawl →
  Research; generative media → Production). This keeps the shared layer honest.

## 5. Implication for sequencing (no implementation here)

The evidence says the ecosystem does **not** need a broad speculative build-out; it needs
**one more capability-bearing application on KMOS** to convert the already-evidenced
Candidate spine into shared capabilities. That is the substance of the
[final recommendation](KEAI-01-INDEX-AND-RECOMMENDATION.md) (Option B).
