# Knowledge Studio — User Guide

**Drop long-form knowledge in. Leave with understanding.**

Knowledge Studio takes a long piece of media — a lecture, a talk, an interview — and
turns it into an explorable map of ideas. Every concept it surfaces is tied back to the
exact moment it was said, so you can always check the source for yourself.

This guide is for the people who *use* that map: learners, researchers, and educators.
No coding required.

---

## What it is

You give Knowledge Studio a YouTube link, a transcript, or a named upload. It reads the
whole thing and hands back:

- a list of **concepts** — the ideas the source actually teaches;
- a **definition** for each, with the **evidence** (real quotes) that back it up;
- a **jump-to-moment** button on every quote, so one click takes you to where it was said;
- **relationships** between ideas, **lineage** (where each idea came from), and an honest
  **trust** signal telling you which concepts are well-grounded and which need a second look.

It is honest by design. When Knowledge Studio can find a supporting passage for a concept,
it marks it **Trusted**. When it can't, it says **Needs review** — it will never invent a
quote to look more confident than it is. That honesty is the point: you can always verify,
and the app tells you when it can't.

---

## Getting started

Knowledge Studio runs as a small web app on your own machine. Once someone on your team has
started it (from the KMOS repository, `npm run studio`), open a browser to:

```
http://localhost:8090
```

The whole app is a single page. You'll land on the home screen with a composer in the
middle — three input tabs, a **Process** button, and a **Try the sample lecture** button.

### Try the sample first (30 seconds)

The fastest way to understand Knowledge Studio is to watch it work:

1. Click **Try the sample lecture**. This loads a real ~4-minute lecture on the science of
   learning into the composer.
2. Click **Process**.
3. Watch the pipeline run (more on that below), then explore the concepts it found —
   *Retrieval Practice*, *Spacing*, *Interleaving*, *Working Memory*, and more.

Everything in the rest of this guide applies to the sample exactly as it does to your own
content, so it's a safe place to click around.

---

## Bringing in your own content

The composer has three tabs. Pick the one that matches what you have.

**YouTube URL.** Paste a link like `https://www.youtube.com/watch?v=…`. If you're running
offline, also paste the video's captions or transcript into the box below — Knowledge Studio
will use those. (Automatic download and transcription need production infrastructure; see
*Current limits* below.)

**Paste transcript.** Paste the text of the talk directly, and optionally give it a title.
This is the most reliable path and works fully offline.

**Upload.** Name a file you have (for example `lecture.mp4`) and paste its transcript. Media
decoding and speech-to-text run through production capabilities; offline, the pasted
transcript is what gets processed.

Before pressing Process, you can also choose a **Translate to** language — French, Arabic,
Spanish, or none. When set, concepts and the transcript are also produced in that language.

### Transcript tips (this matters)

How you format the transcript directly affects how precisely Knowledge Studio can send you
to a moment.

- **Timestamped lines** give **exact** timing. Use lines like:

  ```
  [00:12] Let us start with a distinction between Encoding, Storage, and Retrieval.
  [00:31] Most people treat studying as an encoding problem.
  ```

  WebVTT caption files work too. With these, every "Jump to moment" lands precisely.

- **Plain prose** (no timestamps) still works — Knowledge Studio splits it into segments and
  **estimates** the timing. Estimated timecodes are clearly labelled as `(estimated)` so you
  always know when a moment is approximate rather than exact.

When in doubt, prefer captions with timestamps.

---

## Watching it process

When you press **Process**, Knowledge Studio shows a **visible pipeline** — a list of stages
that light up as each one completes. This is deliberate: you can see exactly what the app is
doing to your source, and each stage carries an honest label.

The stages are:

1. **Acquire source** — locate and read the source.
2. **Audio extraction** — *skipped when you supply a transcript* (it's only needed when
   starting from raw media).
3. **Transcript** — register the source and transcript with lineage.
4. **Chapter detection** — group the talk into readable chapters.
5. **Concept extraction** — find the ideas the source teaches.
6. **Evidence grounding** — locate a real supporting passage for each concept.
7. **Relationship discovery** — connect concepts that appear together.
8. **Trust assessment** — judge, per concept, how well-grounded it is.
9. **Search indexing** — make everything findable.
10. **Packaging** — assemble the downloadable products.

Each stage also shows a small **mode tag** so nothing is hidden:

- **KMOS** — done by the durable KMOS knowledge platform.
- **projection** — a read-only view computed over data KMOS already holds.
- **reference AI** — a basic built-in capability (definitions are lighter here; richer when a
  production AI is connected).
- **needs infra** — a step that requires production infrastructure (e.g. auto-download).

If something can't finish, the stage turns amber and the app tells you plainly what went
wrong — most often, "paste a transcript to process this source."

---

## Exploring concepts

When processing finishes, the source opens with three tabs — **Concepts**, **Transcript**,
and **Download center** — and a **Chapters** outline down the left side. Click any chapter to
jump straight to it.

The **Concepts** tab is a grid of cards. Each card shows:

- the **concept name** and a short **definition**;
- a **trust dot** — green **Trusted** or amber **Needs review**;
- how many **evidence quotes** back it up.

Click a card to open the **concept drawer** on the right — the heart of the app.

### The concept drawer

The drawer gives you the full, verifiable picture of one idea:

- **Definition** — what the concept means, and which source it came from.
- **Evidence — the proof.** Each supporting quote from the transcript, with its timecode and a
  **Jump to moment** button. If a passage couldn't be located, the drawer says so honestly
  rather than showing a made-up quote.
- **Related concepts** — clickable chips. Click one to open that concept next, so you can walk
  the map idea by idea.
- **Lineage — chain of custody.** A short chain showing where the idea traces back to:
  *transcript ← source media*. This is how you know the idea is anchored to a real artifact.
- **Trust — why you can rely on this.** A plain-English list of reasons (for example:
  *"knowledge provenance established; asset integrity verified; workflow completed"*) — never
  a bare number with no explanation.

### Jump to moment — a walkthrough

Say you opened *Spacing* and want to hear it in context:

1. In the drawer, find a quote under **Evidence**.
2. Click **Jump to moment**.
3. The drawer closes, the **Transcript** tab opens, and the exact passage scrolls into view and
   briefly highlights.

You've gone from an abstract idea to the precise sentence that supports it, in one click.

---

## Verifying trust

Trust in Knowledge Studio is a feature you can lean on, because it's honest.

- **Trusted** (green) — a supporting passage was located in the transcript. The idea is
  grounded in something you can read for yourself.
- **Needs review** (amber) — no locatable supporting passage was found. The concept is still
  shown, but flagged, so you know to check it manually rather than take it on faith.

The app will **never fabricate a quote** to turn a "Needs review" into a "Trusted." When it
can't prove something, it says so. Open the drawer's **Trust** section any time to see the
specific reasons behind the verdict.

---

## Searching

The **search box** lives in the header and works across everything you've processed.

Type at least **two characters**. Results are **meaning-based** — they're concepts, not raw
text matches. Each result shows the concept, a supporting quote, and the timestamp where it
appears. Click a result to open that concept's drawer, exactly as if you'd clicked its card.

Search is a fast way to answer "where did this talk cover *forgetting*?" without scrolling
the whole transcript.

---

## Chapters and transcript

The **Transcript** tab shows the full text, split into **chapters** and marked with
**timecodes**, formatted for comfortable reading. The **Chapters** outline on the left (also
available from the Concepts view) lets you jump to any section.

This is the same transcript the concepts are grounded in, so it's where every "Jump to
moment" lands.

---

## Collections

Concepts are grouped by the source they came from — each processed source is its own entry in
**Your library** on the home screen, showing its status, concept count, and chapter count.
Click any library card to reopen that source and pick up where you left off. Your library
grows as you process more material, and search spans all of it.

---

## Downloading your knowledge

The **Download center** turns one source into several reusable products. Every export carries
**citations back to the source moment**, so the knowledge stays verifiable wherever it goes:

- **Transcript** (`.txt`) — plain, timecoded text.
- **Transcript (Markdown)** (`.md`) — the same transcript, chaptered.
- **Study notes** (`.md`) — concepts, their cited quotes, and their trust — ready to revise from.
- **Concepts** (`.json`) — machine-readable knowledge, for reuse in other tools.
- **Knowledge package** (`.json`) — everything: transcript, chapters, concepts, evidence, and
  lineage, in one file.

If you only download one thing, **Study notes** is the most useful for learning, and the
**Knowledge package** is the most complete.

---

## Keyboard and accessibility

Knowledge Studio is built to be usable without a mouse and with assistive technology.

- **Fully keyboard-navigable** — you can reach the composer, tabs, concept cards, drawer,
  search, and downloads entirely by keyboard.
- **Press Escape** to close the concept drawer.
- **Screen-reader landmarks** mark the main regions of the page; progress is announced as the
  pipeline runs.
- **Visible focus** outlines show where you are.
- The app **honors reduced-motion** settings and supports **high-contrast** viewing, including
  a dark mode that follows your system preference.

---

## Current limits, and what's coming

Knowledge Studio is honest about what it can and can't do today:

- **YouTube auto-download and speech-to-text need production infrastructure.** Offline, you
  supply the transcript or captions yourself. When the production capabilities are connected,
  a link is all you'll need.
- **Concept definitions are basic in the offline reference mode.** They get noticeably richer
  when a production AI capability is connected.
- **Video clip / Reel export is planned**, not yet available. Today you export text, notes,
  and structured knowledge; short clips are on the roadmap.

None of these limits affect the core promise: whatever you process, every concept you keep is
tied back to a real moment you can verify.

---

## FAQ

**Do I need a YouTube link to use it?**
No. Pasting a transcript works fully and is the most reliable path. YouTube is one of three
input tabs.

**Why is one of my concepts marked "Needs review"?**
Knowledge Studio couldn't locate a supporting passage for it in the transcript, so it flagged
the concept rather than pretend otherwise. Open the drawer to see the reasons, and check the
transcript yourself.

**Why do some timecodes say "(estimated)"?**
Your transcript didn't include timestamps, so timing was estimated from the text. Provide
timestamped lines (`[00:12] …`) or a WebVTT caption file for exact jump-to-moment timing.

**Why was "Audio extraction" skipped?**
Because you supplied a transcript. Audio extraction is only needed when starting from raw
media.

**Can I get my knowledge out of the app?**
Yes — the Download center offers transcript, chaptered Markdown, study notes, machine-readable
concepts, and a complete knowledge package. Every export cites the source moment.

**Is my data sent anywhere?**
In the offline reference mode, processing runs locally on the machine serving the app.
Connecting a hosted AI capability changes that; ask whoever operates your instance.

**How do I get back to the start?**
Click the **Knowledge Studio** name in the top-left. That clears the search and returns you
to the home screen and your library.
