# Knowledge Studio — Caption / ASR service

A small, provider-independent companion that gives Knowledge Studio the **frictionless
YouTube path**: paste a URL → it fetches the transcript → concepts, evidence, lineage, and
trust follow. Zero npm dependencies; `yt-dlp` + `ffmpeg` come from the image.

## Contract (what Knowledge Studio calls)

```
POST /  { "videoId": "<11-char id>" }
  → 200 { "transcript": "<WebVTT or text>", "source": "captions" | "asr" }
  → 404 when nothing could be produced
GET /health → { "status": "ok", "asr": "configured" | "captions-only" }
```

This is exactly the `KS_CAPTION_ENDPOINT` contract. It is provider-independent: point
`SPEACHES_URL` at **any** OpenAI-audio-compatible ASR server (Speaches, faster-whisper, …).

## How it works

1. **Captions first (fast, exact):** `yt-dlp` fetches existing auto/manual captions as
   WebVTT — real timestamps, no ASR needed. Knowledge Studio parses VTT natively, so
   evidence "jump to moment" is exact.
2. **ASR fallback:** if there are no captions and `SPEACHES_URL` is set, `yt-dlp` extracts
   the audio and your Whisper/Speaches server transcribes it via
   `/v1/audio/transcriptions` (VTT response → exact timings).

## Configuration

| Env | Purpose | Default |
|---|---|---|
| `PORT` | Listen port | `8092` |
| `SPEACHES_URL` | Whisper/Speaches base URL (OpenAI-compatible). Unset → captions only | unset |
| `ASR_MODEL` | ASR model id passed to the server | `Systran/faster-whisper-small` |
| `SUB_LANGS` | yt-dlp caption language filter | `en.*,en` |

## Deploy (recommended: as a Knowledge Studio sidecar)

The Knowledge Studio Olares chart can run this **in the same pod** as a sidecar, so
Knowledge Studio reaches it at `http://localhost:8092` with no cross-app networking. Enable
it at install:

```yaml
# Knowledge Studio values
captionService:
  enabled: true
  image: { repository: <your-ns>/knowledge-studio-caption, tag: "1.0.0" }
  speachesUrl: "http://<speaches-host>:8000"   # your Olares Speaches/Whisper
```

Knowledge Studio then sets `KS_CAPTION_ENDPOINT=http://localhost:8092` automatically. See
[../../docs/OLARES-DEPLOYMENT.md](../../docs/OLARES-DEPLOYMENT.md) → "Frictionless YouTube".

## Deploy (alternative: standalone container)

```bash
docker run -p 8092:8092 -e SPEACHES_URL=http://speaches:8000 \
  <your-ns>/knowledge-studio-caption:1.0.0
# then set KS_CAPTION_ENDPOINT=http://<this-host>:8092 on Knowledge Studio
```

The image is built + pushed by `.github/workflows/release-caption-image.yml`.

## Local check

```bash
node server.mjs                                   # captions-only mode
curl -s localhost:8092/health                     # {"status":"ok","asr":"captions-only"}
```

Live YouTube/ASR requires network + (for ASR) a reachable Speaches — verify on your Olares.
