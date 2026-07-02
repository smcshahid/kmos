# Install KMOS on Olares — the one place, the clear steps

**Everything you install comes from ONE place: the [GitHub Releases page](https://github.com/smcshahid/kmos/releases).**
You never dig through repository folders. Each release attaches the ready-to-install Olares
Application Charts (`.tgz`) and their checksums.

## 1. Download (from the latest GitHub Release)

Open **https://github.com/smcshahid/kmos/releases/latest** and download the assets you want:

| File | What it is | Install order |
|---|---|---|
| `kmos-<version>.tgz` | The KMOS **platform** (shared knowledge core + PostgreSQL) | **1st** |
| `knowledge-studio-<version>.tgz` | **Knowledge Studio** app | after KMOS |
| `podcast-studio-<version>.tgz` | **Podcast Studio** app | after KMOS |
| `SHA256SUMS.txt` | Checksums for the above | — |

(Optional) verify integrity: `sha256sum -c SHA256SUMS.txt`

## 2. Install into Olares

For each `.tgz`, in **Olares Studio → Market → Install a custom app** (upload custom chart),
upload the file and install. Recommended order: **KMOS first** (it provides the shared
PostgreSQL event log), then the studio app(s). The studios run as companions over the SAME
KMOS database — one institutional memory, no duplicate database.

The Docker images the charts reference are public on Docker Hub
(`docker.io/malikshahid85/{kmos,knowledge-studio,podcast-studio}`) — Olares pulls them for you.

## 3. Set your AI provider (at install — configuration, not code)

Each studio works **offline out of the box** (deterministic reference extractor; paste a
transcript). To use a real LLM, set these environment variables at install time (Olares Studio
→ the app's environment/config), or edit the chart `values.yaml` before upload:

| Variable | Meaning | Example |
|---|---|---|
| `KMOS_LLM_PROVIDER` | `reference` \| `ollama` \| `openai-compatible` | `openai-compatible` |
| `KMOS_LLM_BASE_URL` | endpoint | Ollama: `http://ollama.ollamaserver-shared:11434` · OpenAI: `https://api.openai.com/v1` |
| `KMOS_LLM_MODEL` | model / deployment | `llama3.1` · `gpt-4o-mini` · `deepseek-chat` |
| `KMOS_LLM_API_KEY` | secret (cloud only) | your key — set at install, never in git |

**Switching providers is just changing these values** — no rebuild, no code change. The same
config covers OpenAI, Azure OpenAI, Groq, DeepSeek, OpenRouter, Mistral, Together (all
OpenAI-compatible) and local Ollama. Full matrix + how to add Gemini/Claude/Bedrock:
[PROVIDER-GUIDE.md](PROVIDER-GUIDE.md).

**Local (Ollama) shortcut:** you can instead set `OLLAMA_URL` (+ `OLLAMA_MODEL`) and leave
`KMOS_LLM_PROVIDER` empty.

**Transcription/acquisition (podcasts, YouTube):** set `PODCAST_TRANSCRIBE_ENDPOINT`
(Podcast Studio) or `KS_CAPTION_ENDPOINT` (Knowledge Studio) to a Whisper/Speaches HTTP
service; leave empty to paste a transcript. (Knowledge Studio can also enable an in-pod
caption sidecar — see its chart `values.yaml`.)

## 4. Shared vs. isolated database

- **Shared (recommended):** set `databaseUrl` on a studio to the KMOS app's PostgreSQL →
  one shared institutional memory across apps.
- **Isolated:** leave `databaseUrl` empty → the app uses its own Olares-provisioned PostgreSQL.

## 5. Verify it's up

Open the app's entrance in Olares; `GET /health` returns `{"status":"ok"}`. Details + the full
Olares runbook: [OLARES-DEPLOYMENT-GUIDE.md](OLARES-DEPLOYMENT-GUIDE.md) ·
[OPERATIONS-GUIDE.md](OPERATIONS-GUIDE.md).

---

_Releases are produced automatically on a version tag (`.github/workflows/release.yml`): the
GitHub Release is always the authoritative, complete download location. See
[RELEASE-AND-DOCKER.md](RELEASE-AND-DOCKER.md)._
