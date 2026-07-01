import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRssFeed, resolveSource, parseYouTubeId } from '../src/acquisition.ts';
import { createPodcastPlatform } from '../src/platform.ts';
import { PodcastStudioService } from '../src/studio.ts';
import { SAMPLE_TRANSCRIPT } from '../src/sample.ts';

const SAMPLE_RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>The Science of Learning</title>
  <description>How people actually learn.</description>
  <item>
    <title>Episode 12 — Retrieval Practice</title>
    <guid>ep-12</guid>
    <pubDate>Tue, 01 Jul 2026 08:00:00 GMT</pubDate>
    <itunes:duration>00:32:10</itunes:duration>
    <description><![CDATA[A deep dive into retrieval practice.]]></description>
    <enclosure url="https://cdn.example.com/ep12.mp3" type="audio/mpeg" length="30000000"/>
  </item>
  <item>
    <title>Episode 11 — Spacing</title>
    <enclosure url="https://cdn.example.com/ep11.mp3" type="audio/mpeg"/>
  </item>
</channel></rss>`;

test('parseRssFeed extracts channel + selectable episodes with audio', () => {
  const feed = parseRssFeed(SAMPLE_RSS);
  assert.equal(feed.title, 'The Science of Learning');
  assert.equal(feed.episodes.length, 2);
  assert.equal(feed.episodes[0]!.title, 'Episode 12 — Retrieval Practice');
  assert.equal(feed.episodes[0]!.audioUrl, 'https://cdn.example.com/ep12.mp3');
  assert.equal(feed.episodes[0]!.durationSec, 32 * 60 + 10);
  assert.match(feed.episodes[0]!.description ?? '', /retrieval practice/i);
});

test('parseRssFeed never throws on messy input', () => {
  assert.deepEqual(parseRssFeed('').episodes, []);
  assert.deepEqual(parseRssFeed('<rss><channel><item><title>no audio</title></item></channel></rss>').episodes, []);
});

test('resolveSource resolves YouTube ids and audio URLs', () => {
  assert.equal(parseYouTubeId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(resolveSource('youtube', 'https://youtu.be/dQw4w9WgXcQ').audioRef, 'youtube:dQw4w9WgXcQ');
  assert.equal(resolveSource('audio', 'https://cdn.example.com/ep12.mp3').audioRef, 'https://cdn.example.com/ep12.mp3');
});

test('acquisition: an audio episode processes end-to-end when a transcript fetcher is configured', async () => {
  // Stub the fetcher (provider-independent seam); the pipeline acquires captions and
  // produces verifiable knowledge exactly as the pasted-transcript path does.
  const studio = new PodcastStudioService(createPodcastPlatform(), {
    transcriptFetcher: async (audioRef: string) => (audioRef ? SAMPLE_TRANSCRIPT : undefined),
  });
  const ep = await studio.submitAndProcess({ kind: 'audio', reference: 'https://cdn.example.com/ep12.mp3', title: 'Ep 12' });
  assert.equal(ep.status, 'ready', ep.error ?? '');
  assert.equal(ep.stages.find((s) => s.id === 'acquire')!.mode, 'kmos');
  assert.match(ep.stages.find((s) => s.id === 'acquire')!.detail ?? '', /fetched via the configured/i);
  assert.ok(ep.conceptIds.length >= 3, 'concepts produced from fetched transcript');
});
