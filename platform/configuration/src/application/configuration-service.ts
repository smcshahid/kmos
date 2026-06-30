/**
 * Configuration Service application layer (KMOS-0209, KMOS-0160 §9, KMOS-0190).
 *
 * Externalized, versioned, governed configuration for every platform service,
 * capability, and extension. Responsibilities realized here:
 *  - register scoped ConfigurationSets;
 *  - set values, producing a NEW immutable ConfigurationVersion on every change
 *    (previous versions are preserved and remain readable) with a recorded reason;
 *  - resolve effective values with deterministic precedence (profile override >
 *    set default);
 *  - hold secret values only as SecretReference pointers, resolving the clear
 *    value on demand through the SecretResolver port (never persisted);
 *  - publish a canonical event for every governed change.
 *
 * Cross-service contact is canonical events + business APIs only; this service
 * imports no other platform service (coding constitution §4).
 */

import {
  EventBus,
  createCanonicalObject,
  createEvent,
  newCanonicalId,
  KmosError,
  type CanonicalId,
} from '@kmos/canonical-kernel';
import {
  isSecretReference,
  type ConfigurationProfileBody,
  type ConfigurationProfileObject,
  type ConfigurationScope,
  type ConfigurationSetBody,
  type ConfigurationSetObject,
  type ConfigurationValue,
  type ConfigurationVersionBody,
  type ConfigurationVersionObject,
} from '../domain/model.js';
import { createConfigurationCatalog } from '../domain/configuration-catalog.js';
import type { SecretResolver } from '../domain/secret-resolver.js';
import { InMemoryRepository, type Repository } from '../infrastructure/in-memory-repository.js';
import { EchoSecretResolver } from '../infrastructure/echo-secret-resolver.js';

export interface ConfigurationServiceOptions {
  /** Injected bus. Defaults to a bus wired to the local Configuration catalog. */
  readonly bus?: EventBus;
  /** Secret resolution port. Defaults to an in-memory echo adapter. */
  readonly secretResolver?: SecretResolver;
  /** Deterministic clock for service-emitted events/objects (tests/replay). */
  readonly now?: () => string;
}

export interface RegisterSetInput {
  readonly scope: ConfigurationScope;
  readonly namespace: string;
}

export interface SetValuesOptions {
  readonly reason: string;
  /** Target a profile's override map instead of the set defaults. */
  readonly profile?: string;
}

export interface ResolveOptions {
  readonly profile?: string;
}

const PRODUCER = 'ConfigurationService';

export class ConfigurationService {
  private readonly bus: EventBus;
  private readonly secrets: SecretResolver;
  private readonly now: () => string;
  private readonly sets: Repository<ConfigurationSetObject> = new InMemoryRepository();
  private readonly versions: Repository<ConfigurationVersionObject> = new InMemoryRepository();
  private readonly profiles: Repository<ConfigurationProfileObject> = new InMemoryRepository();

  constructor(options: ConfigurationServiceOptions = {}) {
    this.bus = options.bus ?? new EventBus({ catalog: createConfigurationCatalog() });
    this.secrets = options.secretResolver ?? new EchoSecretResolver();
    this.now = options.now ?? (() => new Date().toISOString());
  }

  /** Underlying bus (for advanced/inter-service wiring within the monolith). */
  get eventBus(): EventBus {
    return this.bus;
  }

  // --- Set registration (KMOS-0209 §3) ---

  /** Register a new scoped ConfigurationSet. Emits ConfigurationRegistered. */
  async registerSet(input: RegisterSetInput): Promise<ConfigurationSetObject> {
    const id = newCanonicalId('ConfigurationSet');
    const now = this.now();
    const set = createCanonicalObject<ConfigurationSetBody>({
      id,
      type: 'ConfigurationSet',
      schemaVersion: '1.0',
      owner: 'ConfigurationService',
      lifecycle: 'Active',
      displayName: `${input.scope}:${input.namespace}`,
      now,
      body: { scope: input.scope, namespace: input.namespace, versionCount: 0 },
    });
    this.sets.put(set);
    await this.publish('ConfigurationRegistered', id, {
      setId: id,
      scope: input.scope,
      namespace: input.namespace,
    });
    return set;
  }

  getSet(id: CanonicalId): ConfigurationSetObject | undefined {
    return this.sets.get(id);
  }

  // --- Setting values: immutable versioning (KMOS-0209 §3) ---

  /**
   * Set values on a configuration set, creating a NEW immutable
   * ConfigurationVersion. The previous version is preserved and remains
   * readable. When `profile` is given, the values become overrides for that
   * profile; otherwise they update the set defaults. Carries prior values
   * forward (merge). Emits ConfigurationUpdated.
   */
  async setValues(
    setId: CanonicalId,
    values: Readonly<Record<string, ConfigurationValue>>,
    options: SetValuesOptions,
  ): Promise<ConfigurationVersionObject> {
    const set = this.requireSet(setId);
    const previous = this.currentVersion(set);

    const baseValues = previous ? previous.body.values : {};
    const baseProfiles = previous ? previous.body.profiles : {};

    let nextValues: Record<string, ConfigurationValue>;
    let nextProfiles: Record<string, Record<string, ConfigurationValue>>;

    if (options.profile === undefined) {
      nextValues = { ...baseValues, ...values };
      nextProfiles = this.cloneProfiles(baseProfiles);
    } else {
      nextValues = { ...baseValues };
      nextProfiles = this.cloneProfiles(baseProfiles);
      nextProfiles[options.profile] = { ...(nextProfiles[options.profile] ?? {}), ...values };
    }

    const versionNumber = set.body.versionCount + 1;
    const now = this.now();
    const version = createCanonicalObject<ConfigurationVersionBody>({
      id: newCanonicalId('ConfigurationVersion'),
      type: 'ConfigurationVersion',
      schemaVersion: '1.0',
      owner: 'ConfigurationService',
      lifecycle: 'Active',
      displayName: `${set.body.namespace}#${versionNumber}`,
      now,
      body: {
        setId,
        versionNumber,
        values: nextValues,
        profiles: nextProfiles,
        reason: options.reason,
      },
    });
    this.versions.put(version);

    // Advance the set pointer to the new version (immutable history preserved).
    this.sets.put({
      ...set,
      version: set.version + 1,
      updatedAt: now,
      body: { ...set.body, currentVersionId: version.id, versionCount: versionNumber },
    });

    const payload: Record<string, unknown> = {
      setId,
      versionId: version.id,
      versionNumber,
      reason: options.reason,
      keys: Object.keys(values),
    };
    if (options.profile !== undefined) payload.profile = options.profile;
    await this.publish('ConfigurationUpdated', setId, payload);

    return version;
  }

  /** Read a specific version by id (history remains readable after updates). */
  getVersion(versionId: CanonicalId): ConfigurationVersionObject | undefined {
    return this.versions.get(versionId);
  }

  /** All versions of a set, oldest-first. */
  getVersionHistory(setId: CanonicalId): readonly ConfigurationVersionObject[] {
    return this.versions
      .list()
      .filter((v) => v.body.setId === setId)
      .sort((a, b) => a.body.versionNumber - b.body.versionNumber);
  }

  // --- Profiles (KMOS-0209 §3) ---

  /** Declare a named profile (e.g. dev/staging/prod). Emits ConfigurationProfileChanged. */
  async registerProfile(setId: CanonicalId, name: string): Promise<ConfigurationProfileObject> {
    this.requireSet(setId);
    const now = this.now();
    const profile = createCanonicalObject<ConfigurationProfileBody>({
      id: newCanonicalId('ConfigurationProfile'),
      type: 'ConfigurationProfile',
      schemaVersion: '1.0',
      owner: 'ConfigurationService',
      lifecycle: 'Active',
      displayName: name,
      now,
      body: { setId, name },
    });
    this.profiles.put(profile);
    await this.publish('ConfigurationProfileChanged', setId, { setId, profile: name, change: 'registered' });
    return profile;
  }

  getProfiles(setId: CanonicalId): readonly ConfigurationProfileObject[] {
    return this.profiles.list().filter((p) => p.body.setId === setId);
  }

  // --- Resolution (KMOS-0209 §3) ---

  /**
   * Resolve the effective value of a key. Precedence: profile override beats the
   * set default. If the effective value is a SecretReference, the clear value is
   * fetched through the SecretResolver port (never read from storage) and a
   * SecretReferenced event is published. Returns undefined if the key is unset.
   */
  async resolve(
    setId: CanonicalId,
    key: string,
    options: ResolveOptions = {},
  ): Promise<ConfigurationValue | undefined> {
    const set = this.requireSet(setId);
    const version = this.currentVersion(set);
    if (!version) return undefined;

    const effective = this.effectiveValue(version, key, options.profile);
    if (effective === undefined) return undefined;

    if (isSecretReference(effective)) {
      await this.publish('SecretReferenced', setId, { setId, key, ref: effective.secret });
      const clear = this.secrets.resolve(effective);
      if (clear === undefined) {
        throw new KmosError(`Unresolvable secret reference: ${effective.secret}`, {
          category: 'NotFound',
          code: 'configuration.secret.unresolvable',
          subject: setId,
          detail: { key, ref: effective.secret },
        });
      }
      return clear;
    }

    return effective;
  }

  // ---- internals ----

  private effectiveValue(
    version: ConfigurationVersionObject,
    key: string,
    profile?: string,
  ): ConfigurationValue | undefined {
    if (profile !== undefined) {
      const overrides = version.body.profiles[profile];
      if (overrides && Object.prototype.hasOwnProperty.call(overrides, key)) {
        return overrides[key];
      }
    }
    if (Object.prototype.hasOwnProperty.call(version.body.values, key)) {
      return version.body.values[key];
    }
    return undefined;
  }

  private currentVersion(set: ConfigurationSetObject): ConfigurationVersionObject | undefined {
    const id = set.body.currentVersionId;
    return id ? this.versions.get(id) : undefined;
  }

  private cloneProfiles(
    profiles: Readonly<Record<string, Readonly<Record<string, ConfigurationValue>>>>,
  ): Record<string, Record<string, ConfigurationValue>> {
    const out: Record<string, Record<string, ConfigurationValue>> = {};
    for (const [name, overrides] of Object.entries(profiles)) out[name] = { ...overrides };
    return out;
  }

  private requireSet(id: CanonicalId): ConfigurationSetObject {
    const set = this.sets.get(id);
    if (!set) {
      throw new KmosError(`No such configuration set: ${id}`, {
        category: 'NotFound',
        code: 'configuration.set.notfound',
        subject: id,
      });
    }
    return set;
  }

  private async publish(type: string, subjectId: CanonicalId, payload: Record<string, unknown>): Promise<void> {
    const ev = createEvent({ type, schemaVersion: '1.0', producer: PRODUCER, subjectId, payload, time: this.now() });
    await this.bus.publish(ev, { streamId: subjectId });
  }
}
