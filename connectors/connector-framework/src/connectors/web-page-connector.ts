/**
 * WebPageConnector — a reference External Connector (KMOS-0180 §22).
 *
 * It models the simplest realistic external integration: a fetched web page (or
 * any web-addressable record) handed in as a deterministic external record. It
 * performs NO real network IO — the bytes/text are supplied to it — so it is
 * fully deterministic and replayable (constitution §6). Its sole job is
 * TRANSLATION: map the external `{ uri, contentType, bytesOrText, checksum }`
 * onto a canonical translation that the ConnectorHost will register as an Asset.
 *
 * It contains no business logic and never touches the Asset Registry, the
 * Identity Service or the bus: it is a pure adapter that returns a canonical
 * description and lets the governing host do the canonical writes (KMOS-0170 —
 * connectors communicate exclusively through canonical contracts).
 */

import type {
  CanonicalTranslation,
  Connector,
  ExternalRecord,
} from '../domain/connector-types.js';
import type { AssetType } from '@kmos/assets';

const TEXTUAL = /^(text\/|application\/(json|xml|xhtml\+xml))/i;

/** Map an external IANA media type onto a canonical AssetType (deterministic). */
function classify(contentType: string): AssetType {
  const ct = contentType.toLowerCase();
  if (ct.startsWith('image/')) return 'Image';
  if (ct.startsWith('video/')) return 'Video';
  if (ct.startsWith('audio/')) return 'Audio';
  if (TEXTUAL.test(ct)) return 'Document';
  return 'Other';
}

/** Derive a stable storage id from the external locator (no path of record). */
function storageIdFor(uri: string): string {
  return `web:${uri}`;
}

export class WebPageConnector implements Connector {
  readonly name: string;

  constructor(name = 'web-page') {
    this.name = name;
  }

  /** Nothing to open for a deterministic connector; activation is a no-op. */
  async activate(): Promise<void> {
    // Real connectors would validate config / open a deterministic client here.
  }

  /**
   * Translate one external web record into a canonical translation. Pure and
   * deterministic: identical input yields identical output.
   */
  async ingest(external: ExternalRecord): Promise<CanonicalTranslation> {
    const displayName = external.displayName ?? external.uri;
    return {
      assetType: classify(external.contentType),
      mediaType: external.contentType,
      displayName,
      storageId: storageIdFor(external.uri),
      checksum: external.checksum,
      tags: ['external', 'web'],
      description: `Ingested from external source ${external.uri} via the ${this.name} connector.`,
    };
  }
}
