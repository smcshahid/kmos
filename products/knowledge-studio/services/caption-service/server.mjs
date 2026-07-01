/**
 * Knowledge Studio caption/ASR service.
 *
 * A small, provider-independent companion that turns a YouTube video id into a
 * transcript, so Knowledge Studio's YouTube path runs end-to-end. It speaks the exact
 * contract Knowledge Studio's KS_CAPTION_ENDPOINT expects:
 *
 *   POST /  { "videoId": "<id>" }  ->  200 { "transcript": "<text>", "source": "captions|asr" }
 *                                       204/404 when nothing could be produced
 *
 * Strategy (fast → thorough):
 *   1. yt-dlp fetches existing captions (auto or manual) as WebVTT — exact timings,
 *      no ASR needed. Knowledge Studio parses VTT natively (exact jump-to-moment).
 *   2. If there are no captions and SPEACHES_URL is set, yt-dlp extracts the audio and
 *      it is transcribed by a Whisper/Speaches server over the OpenAI-compatible
 *      /v1/audio/transcriptions API (VTT response → exact timings).
 *
 * Zero npm dependencies (node:http + child_process + global fetch/FormData/Blob). yt-dlp
 * and ffmpeg are provided by the container image. Everything is provider-independent:
 * point SPEACHES_URL at any OpenAI-audio-compatible ASR server.
 */

import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.env.PORT ?? 8092);
const SPEACHES_URL = process.env.SPEACHES_URL ?? '';           // e.g. http://speaches:8000
const ASR_MODEL = process.env.ASR_MODEL ?? 'Systran/faster-whisper-small';
const SUB_LANGS = process.env.SUB_LANGS ?? 'en.*,en';
const YTDLP = process.env.YTDLP_BIN ?? 'yt-dlp';

/** Run a command, resolving with {code, stdout, stderr}. Never rejects. */
function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { ...opts });
    let stdout = ''; let stderr = '';
    child.stdout?.on('data', (d) => { stdout += d; });
    child.stderr?.on('data', (d) => { stderr += d; });
    child.on('error', (err) => resolve({ code: -1, stdout, stderr: String(err) }));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

/** Fetch existing captions as WebVTT text via yt-dlp. Returns text or ''. */
async function fetchCaptions(url) {
  const dir = await mkdtemp(join(tmpdir(), 'cap-'));
  try {
    await run(YTDLP, [
      '--skip-download', '--write-auto-subs', '--write-subs',
      '--sub-langs', SUB_LANGS, '--sub-format', 'vtt', '--convert-subs', 'vtt',
      '-o', join(dir, '%(id)s.%(ext)s'), url,
    ]);
    const files = (await readdir(dir)).filter((f) => f.endsWith('.vtt'));
    if (files.length === 0) return '';
    // Prefer a manual/en track if multiple; otherwise the first.
    const pick = files.sort((a, b) => a.length - b.length)[0];
    return await readFile(join(dir, pick), 'utf8');
  } catch {
    return '';
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Download audio + transcribe via a Whisper/Speaches server. Returns text or ''. */
async function transcribeAudio(url) {
  if (!SPEACHES_URL) return '';
  const dir = await mkdtemp(join(tmpdir(), 'asr-'));
  try {
    const out = await run(YTDLP, [
      '-x', '--audio-format', 'mp3', '--audio-quality', '5',
      '-o', join(dir, 'audio.%(ext)s'), url,
    ]);
    if (out.code !== 0) return '';
    const files = (await readdir(dir)).filter((f) => f.endsWith('.mp3'));
    if (files.length === 0) return '';
    const bytes = await readFile(join(dir, files[0]));
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: 'audio/mpeg' }), 'audio.mp3');
    form.append('model', ASR_MODEL);
    form.append('response_format', 'vtt'); // VTT → exact timings for evidence
    const res = await fetch(`${SPEACHES_URL.replace(/\/$/, '')}/v1/audio/transcriptions`, {
      method: 'POST', body: form,
    });
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function handleResolve(videoId) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const captions = await fetchCaptions(url);
  if (captions.trim()) return { transcript: captions, source: 'captions' };
  const asr = await transcribeAudio(url);
  if (asr.trim()) return { transcript: asr, source: 'asr' };
  return null;
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

const server = http.createServer((req, res) => {
  const send = (status, body) => {
    const payload = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(payload);
  };

  if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
    return send(200, { status: 'ok', asr: SPEACHES_URL ? 'configured' : 'captions-only' });
  }
  if (req.method !== 'POST') return send(405, { error: 'Use POST /' });

  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    let videoId = '';
    try { videoId = String(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}').videoId ?? ''); } catch { /* ignore */ }
    if (!VIDEO_ID.test(videoId)) return send(400, { error: 'Provide a valid 11-char YouTube videoId' });
    handleResolve(videoId)
      .then((result) => (result ? send(200, result) : send(404, { error: 'No captions or transcript could be produced' })))
      .catch((err) => send(500, { error: String(err) }));
  });
});

server.listen(PORT, () => {
  console.log(`caption-service listening on :${PORT}  (ASR: ${SPEACHES_URL || 'disabled — captions only'})`);
});
