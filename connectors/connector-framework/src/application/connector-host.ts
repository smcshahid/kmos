/**
 * ConnectorHost — the Connector Framework (WP-17; KMOS-0180 §22, KMOS-0170).
 *
 * The host is the GOVERNANCE boundary for External Connectors. It does three
 * things, and connectors do none of them themselves:
 *
 *   1. Registration  — gives each connector a canonical Identity of kind
 *      'Connector' in the Identity Service, so the connector is a first-class,
 *      governed, never-anonymous actor (KMOS-0206 §5).
 *   2. Activation     — activates the connector and publishes the canonical
 *      `ConnectorActivated` event (defined in @kmos/platform-catalog).
 *   3. Ingestion      — routes each external record through the connector's
 *      TRANSLATION into a canonical Asset registered in the Asset Registry, then
 *      publishes `ExternalRecordIngested` (also in @kmos/platform-catalog) with
 *      provenance recording the external source AND the connector identity.
 *
 * The host is the only thing that touches the Asset Registry and the bus, so a
 * connector can never bypass the platform: it just returns a canonical
 * translation and the host registers it (KMOS-0170 — connectors communicate
 * exclusively through canonical events + contracts). The host carries no
 * business logic; it is pure orchestration over injected platform services.
 *
 * Determinism: the host takes an injected `now` clock and never reads the wall
 * clock itself, so ingestion is replayable (constitution §6).
 */

import {
  EventBus,
  KmosError,
  createEvent,
  type CanonicalEvent,
  type CanonicalId,
} from '@kmos/canonical-kernel';
import { AssetRegistryService } from '@kmos/assets';
import { IdentityService } from '@kmos/identity';
import type {
  Connector,
  ExternalRecord,
  IngestResult,
  RegisteredConnector,
} from '../domain/connector-types.js';

const PRODUCER = 'ConnectorHost';
const SCHEMA_VERSION = '1.0';

export interface ConnectorHostOptions {
  /** Shared canonical event bus (single-shared-bus deployments). */
  readonly bus: EventBus;
  /** Asset Registry: the authoritative system of record connectors translate into. */
  readonly assets: AssetRegistryService;
  /** Identity Service: connectors are registered here as canonical 'Connector' identities. */
  readonly identity: IdentityService;
  /** Deterministic clock (tests/replay); defaults to wall clock. */
  readonly now?: () => string;
  /** Tenant the connectors and ingested assets belong to (optional). */
  readonly organizationId?: CanonicalId;
}

export class ConnectorHost {
  private readonly bus: EventBus;
  private readonly assets: AssetRegistryService;
  private readonly identity: IdentityService;
  private readonly now: () => string;
  private readonly organizationId: CanonicalId | undefined;
  /** Registered connectors keyed by connector name. */
  private readonly registered = new Map<string, RegisteredConnector>();

  constructor(options: ConnectorHostOptions) {
    this.bus = options.bus;
    this.assets = options.assets;
    this.identity = options.identity;
    this.now = options.now ?? (() => new Date().toISOString());
    this.organizationId = options.organizationId;
  }

  /**
   * Register a connector, minting its canonical Identity (kind 'Connector').
   * Idempotent per connector name. A connector MUST be registered before it can
   * be activated or used to ingest, so every ingested fact is attributable to a
   * governed identity (never anonymous).
   */
  async registerConnector(connector: Connector): Promise<RegisteredConnector> {
    const existing = this.registered.get(connector.name);
    if (existing !== undefined) return existing;

    const identity = await this.identity.createIdentity({
      kind: 'Connector',
      displayName: connector.name,
      ...(this.organizationId !== undefined ? { organizationId: this.organizationId } : {}),
    });

    const entry: RegisteredConnector = {
      connector,
      identityId: identity.id,
      activated: false,
    };
    this.registered.set(connector.name, entry);
    return entry;
  }

  /**
   * Activate a registered connector and publish `ConnectorActivated`. Activation
   * is what makes a connector eligible to translate external records.
   */
  async activate(name: string): Promise<RegisteredConnector> {
    const entry = this.require(name);
    if (entry.activated) return entry;

    await entry.connector.activate();
    const activated: RegisteredConnector = { ...entry, activated: true };
    this.registered.set(name, activated);

    await this.emit(
      'ConnectorActivated',
      activated.identityId,
      {
        connectorIdentityId: activated.identityId,
        connectorName: name,
      },
      activated.identityId,
    );
    return activated;
  }

  /** Convenience: register then activate in one call. */
  async registerAndActivate(connector: Connector): Promise<RegisteredConnector> {
    await this.registerConnector(connector);
    return this.activate(connector.name);
  }

  /**
   * Route one external record through the named connector's translation into a
   * canonical Asset registered in the Asset Registry, then publish
   * `ExternalRecordIngested`. The connector only TRANSLATES; the host registers,
   * so the connector cannot bypass the registry. Provenance records both the
   * external source (`originalSource`) and the connector identity (a contributor
   * + the producing actor on the event), preserving institutional
   * accountability for external integrations (KMOS-0180 §23).
   */
  async ingest(name: string, external: ExternalRecord): Promise<IngestResult> {
    const entry = this.require(name);
    if (!entry.activated) {
      throw new KmosError('Connector must be activated before ingestion', {
        category: 'Conflict',
        code: 'connector.not_activated',
        subject: entry.identityId,
        detail: { connectorName: name },
      });
    }

    // 1) Translate the external record into a canonical translation (no IO).
    const translation = await entry.connector.ingest(external);

    // 2) Register the translation as a canonical Asset. This is the ONLY write
    //    path; the connector never touches the registry directly.
    const asset = await this.assets.registerAsset({
      assetType: translation.assetType,
      mediaType: translation.mediaType,
      displayName: translation.displayName,
      ...(this.organizationId !== undefined ? { organizationId: this.organizationId } : {}),
      storageRef: { storageId: translation.storageId, backend: 'connector' },
      checksum: translation.checksum,
      ...(translation.description !== undefined ? { description: translation.description } : {}),
      ...(translation.tags !== undefined ? { tags: translation.tags } : {}),
      provenance: {
        // Ingested from an external system via a connector.
        origin: 'IngestedByConnector',
        // The external locator — the foreign source of record.
        originalSource: external.uri,
        // The connector identity is recorded as the contributing actor so the
        // asset's provenance points back to the governed connector.
        contributors: [{ kind: 'AI', id: entry.identityId, role: 'Connector' }],
      },
    });

    // 3) Publish the canonical institutional event with full provenance.
    const event = await this.emit(
      'ExternalRecordIngested',
      asset.id,
      {
        assetId: asset.id,
        connectorIdentityId: entry.identityId,
        connectorName: name,
        externalSource: external.uri,
        externalContentType: external.contentType,
        checksum: external.checksum,
      },
      entry.identityId,
    );

    return {
      assetId: asset.id,
      connectorIdentityId: entry.identityId,
      externalSource: external.uri,
      eventId: event.identity.eventId,
    };
  }

  /** Look up a registered connector entry (with its canonical identity). */
  getConnector(name: string): RegisteredConnector | undefined {
    return this.registered.get(name);
  }

  // --- internals -----------------------------------------------------------

  private require(name: string): RegisteredConnector {
    const entry = this.registered.get(name);
    if (entry === undefined) {
      throw new KmosError('Connector is not registered', {
        category: 'NotFound',
        code: 'connector.not_registered',
        detail: { connectorName: name },
      });
    }
    return entry;
  }

  private async emit<P extends object>(
    type: string,
    subjectId: CanonicalId,
    payload: P,
    actorId: CanonicalId,
  ): Promise<CanonicalEvent<P>> {
    const event = createEvent<P>({
      type,
      schemaVersion: SCHEMA_VERSION,
      producer: PRODUCER,
      subjectId,
      payload,
      actorId,
      ...(this.organizationId !== undefined ? { organizationId: this.organizationId } : {}),
      time: this.now(),
    });
    await this.bus.publish(event, { streamId: subjectId });
    return event;
  }
}
