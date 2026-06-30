/**
 * Connector Framework domain model (KMOS-0180 §22 External Connectors;
 * KMOS-0170 Connector contributions).
 *
 * A Connector is the boundary between an EXTERNAL system and KMOS. Per
 * KMOS-0180 §22 a connector "SHALL translate external protocols into canonical
 * KMOS objects and events", and per KMOS-0170 connectors "SHALL communicate
 * exclusively through canonical events and contracts". A connector is therefore
 * a pure TRANSLATION ADAPTER: it carries no business logic (that lives in
 * capabilities) and it never reaches into platform internals — it only emits
 * canonical translations that the governing ConnectorHost turns into canonical
 * objects + events.
 *
 * This module is infrastructure-free (constitution §1/§2): it declares the
 * contracts and value objects only; the concrete wiring lives in the
 * application layer (the host) and in individual connector adapters.
 */

import type { CanonicalId } from '@kmos/canonical-kernel';
import type { AssetType } from '@kmos/assets';

/**
 * An opaque external record handed to a connector from some foreign protocol
 * (a fetched web page, a file read off disk, a CMS payload, etc.). The shape is
 * intentionally minimal and protocol-agnostic; richer connectors may accept a
 * superset. It is NOT a canonical object — it is the raw external input the
 * connector must translate.
 */
export interface ExternalRecord {
  /** Stable external locator of the record (e.g. a URL, a file URI, a CMS id). */
  readonly uri: string;
  /** IANA media type of the external payload, e.g. "text/html". */
  readonly contentType: string;
  /** The external payload itself — text or bytes. Deterministic; no live IO. */
  readonly bytesOrText: string | Uint8Array;
  /** Integrity digest supplied by (or computed deterministically for) the source. */
  readonly checksum: string;
  /** Optional human label for the record. */
  readonly displayName?: string;
}

/**
 * The canonical translation a connector produces for one external record. This
 * is the ONLY thing a connector returns: a description of the canonical Asset
 * the host should register. The connector chooses the canonical classification
 * and metadata; the host owns registration so the connector cannot bypass the
 * Asset Registry (KMOS-0170: communicate exclusively through canonical
 * contracts).
 */
export interface CanonicalTranslation {
  readonly assetType: AssetType;
  readonly mediaType: string;
  readonly displayName: string;
  /** Logical storage id for the asset's bytes (descriptive; not its identity). */
  readonly storageId: string;
  readonly checksum: string;
  /** Free, extensible canonical metadata derived from the external record. */
  readonly tags?: readonly string[];
  readonly description?: string;
}

/** The outcome of ingesting one external record through the host. */
export interface IngestResult {
  /** Canonical id of the Asset the external record was translated into. */
  readonly assetId: CanonicalId;
  /** Canonical id of the connector identity that produced it (provenance). */
  readonly connectorIdentityId: CanonicalId;
  /** The external locator that was ingested (provenance: external source). */
  readonly externalSource: string;
  /** The canonical event id emitted to record the ingestion. */
  readonly eventId: CanonicalId;
}

/**
 * The Connector contract (KMOS-0180 §22). A connector has a stable name, can be
 * activated, and translates an external record into a canonical translation.
 * Translation is deterministic and side-effect-free with respect to the
 * platform: a connector NEVER writes to the Asset Registry or publishes events
 * itself — the host does that on its behalf, attributing it to the connector's
 * canonical identity. `ingest` here means "translate", not "persist".
 */
export interface Connector {
  /** Stable, human-meaningful connector name (used for the canonical Identity). */
  readonly name: string;
  /** Prepare the connector to run (open deterministic resources, validate config). */
  activate(): Promise<void>;
  /** Translate one external record into a canonical translation (no platform IO). */
  ingest(external: ExternalRecord): Promise<CanonicalTranslation>;
}

/**
 * A connector registered with the host, paired with its canonical Identity.
 * The identity is created by the host in the Identity Service with kind
 * 'Connector' so the connector is a governed, first-class, never-anonymous
 * actor (KMOS-0206 §5).
 */
export interface RegisteredConnector {
  readonly connector: Connector;
  /** Canonical Identity id (kind 'Connector') for this connector. */
  readonly identityId: CanonicalId;
  readonly activated: boolean;
}
