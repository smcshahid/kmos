/**
 * Capability Registry Service application layer (KMOS-0205).
 *
 * The authoritative catalog of executable business capabilities: register,
 * version, discover, certify, and analyse dependencies (rejecting cycles). It
 * catalogs business abilities and remains independent of any runtime.
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
  compareSemver,
  parseSemver,
  type CapabilityBody,
  type CapabilityCertificationBody,
  type CapabilityCertificationObject,
  type CapabilityManifestBody,
  type CapabilityManifestObject,
  type CapabilityObject,
  type CertificationLevel,
} from '../domain/model.js';
import { findCycle, transitiveDependencies, type DependencyEdges } from '../domain/dependency-graph.js';
import { InMemoryRepository, type Repository } from '../infrastructure/in-memory-repository.js';

export interface RegisterCapabilityInput {
  readonly name: string;
  readonly ownerDomain: string;
  readonly businessPurpose: string;
  readonly version: string; // semver
  readonly inputs?: readonly string[];
  readonly outputs?: readonly string[];
  readonly contract: CapabilityManifestBody['contract'];
  readonly dependencies?: readonly CanonicalId[];
  readonly securityRequirements?: readonly string[];
}

export interface DiscoverQuery {
  readonly ownerDomain?: string;
  readonly input?: string;
  readonly output?: string;
  readonly consumesEvent?: string;
  readonly minCertification?: CertificationLevel;
  readonly lifecycle?: CapabilityBody['lifecycleState'];
}

export interface CapabilityRegistryOptions {
  readonly bus?: EventBus;
  readonly now?: () => string;
}

const CERT_ORDER: readonly CertificationLevel[] = [
  'Experimental', 'Development', 'Verified', 'Production', 'Enterprise', 'Reference',
];

export class CapabilityRegistryService {
  private readonly bus: EventBus;
  private readonly now: () => string;
  private readonly capabilities: Repository<CapabilityObject> = new InMemoryRepository();
  /** capabilityId -> manifests by version */
  private readonly manifests = new Map<CanonicalId, Map<string, CapabilityManifestObject>>();
  private readonly certifications: Repository<CapabilityCertificationObject> = new InMemoryRepository();

  constructor(options: CapabilityRegistryOptions = {}) {
    this.bus = options.bus ?? new EventBus();
    this.now = options.now ?? (() => new Date().toISOString());
  }

  /** Register a new capability (its first version). */
  async registerCapability(input: RegisterCapabilityInput): Promise<CapabilityObject> {
    parseSemver(input.version);
    const id = newCanonicalId('Capability');
    await this.assertNoCycle(id, input.dependencies ?? []);
    const now = this.now();
    const capability = createCanonicalObject<CapabilityBody>({
      id, type: 'Capability', schemaVersion: '1.0', owner: 'CapabilityRegistry',
      lifecycle: 'Created', displayName: input.name, now,
      body: { name: input.name, ownerDomain: input.ownerDomain, businessPurpose: input.businessPurpose, currentVersion: input.version, lifecycleState: 'Proposed' },
    });
    this.capabilities.put(capability);
    this.putManifest(id, input, now);
    await this.publish('ManifestValidated', id, { capabilityId: id, version: input.version });
    await this.publish('CapabilityRegistered', id, { capabilityId: id, name: input.name, version: input.version });
    return capability;
  }

  /** Register a new version of an existing capability (immutable manifest history). */
  async registerVersion(capabilityId: CanonicalId, input: Omit<RegisterCapabilityInput, 'name' | 'ownerDomain' | 'businessPurpose'>): Promise<CapabilityManifestObject> {
    const cap = this.requireCapability(capabilityId);
    parseSemver(input.version);
    if (this.manifests.get(capabilityId)?.has(input.version)) {
      throw new KmosError(`Version already registered: ${input.version}`, { category: 'Conflict', code: 'capability.version.exists', subject: capabilityId });
    }
    await this.assertNoCycle(capabilityId, input.dependencies ?? []);
    const now = this.now();
    const manifest = this.putManifest(capabilityId, { ...input, name: cap.body.name, ownerDomain: cap.body.ownerDomain, businessPurpose: cap.body.businessPurpose }, now);
    // advance currentVersion if newer
    if (compareSemver(input.version, cap.body.currentVersion) > 0) {
      this.capabilities.put({ ...cap, version: cap.version + 1, updatedAt: now, body: { ...cap.body, currentVersion: input.version } });
    }
    await this.publish('ManifestValidated', capabilityId, { capabilityId, version: input.version });
    return manifest;
  }

  getCapability(id: CanonicalId): CapabilityObject | undefined {
    return this.capabilities.get(id);
  }

  getManifest(id: CanonicalId, version?: string): CapabilityManifestObject | undefined {
    const byVersion = this.manifests.get(id);
    if (!byVersion) return undefined;
    const v = version ?? this.capabilities.get(id)?.body.currentVersion;
    return v ? byVersion.get(v) : undefined;
  }

  getVersions(id: CanonicalId): readonly string[] {
    return [...(this.manifests.get(id)?.keys() ?? [])].sort(compareSemver);
  }

  getContract(id: CanonicalId, version?: string): CapabilityManifestBody['contract'] | undefined {
    return this.getManifest(id, version)?.body.contract;
  }

  /** Discover capabilities by business criteria (KMOS-0205 discovery). */
  discover(query: DiscoverQuery = {}): readonly CapabilityObject[] {
    return this.capabilities.list().filter((cap) => {
      const manifest = this.getManifest(cap.id);
      if (!manifest) return false;
      if (query.ownerDomain && cap.body.ownerDomain !== query.ownerDomain) return false;
      if (query.input && !manifest.body.inputs.includes(query.input)) return false;
      if (query.output && !manifest.body.outputs.includes(query.output)) return false;
      if (query.consumesEvent && !manifest.body.contract.consumedEvents.includes(query.consumesEvent)) return false;
      if (query.lifecycle && cap.body.lifecycleState !== query.lifecycle) return false;
      if (query.minCertification) {
        const have = cap.body.certification;
        if (!have || CERT_ORDER.indexOf(have) < CERT_ORDER.indexOf(query.minCertification)) return false;
      }
      return true;
    });
  }

  /** Grant a certification level for a capability version (KMOS-0205 certification). */
  async certify(capabilityId: CanonicalId, version: string, level: CertificationLevel, authority: string): Promise<CapabilityCertificationObject> {
    const cap = this.requireCapability(capabilityId);
    if (!this.manifests.get(capabilityId)?.has(version)) {
      throw new KmosError(`No such version: ${version}`, { category: 'NotFound', code: 'capability.version.notfound', subject: capabilityId });
    }
    const now = this.now();
    const cert = createCanonicalObject<CapabilityCertificationBody>({
      id: newCanonicalId('CapabilityCertification'), type: 'CapabilityCertification', schemaVersion: '1.0',
      owner: 'CapabilityRegistry', lifecycle: 'Approved', now,
      body: { capabilityId, version, level, authority, grantedAt: now },
    });
    this.certifications.put(cert);
    this.capabilities.put({ ...cap, version: cap.version + 1, updatedAt: now, body: { ...cap.body, certification: level, lifecycleState: 'Certified' } });
    await this.publish('CapabilityCertified', capabilityId, { capabilityId, version, level });
    return cert;
  }

  getCertificationHistory(capabilityId: CanonicalId): readonly CapabilityCertificationObject[] {
    return this.certifications.list().filter((c) => c.body.capabilityId === capabilityId);
  }

  async deprecate(capabilityId: CanonicalId): Promise<CapabilityObject> {
    const cap = this.requireCapability(capabilityId);
    const now = this.now();
    const updated: CapabilityObject = { ...cap, version: cap.version + 1, updatedAt: now, body: { ...cap.body, lifecycleState: 'Deprecated' } };
    this.capabilities.put(updated);
    await this.publish('CapabilityDeprecated', capabilityId, { capabilityId });
    return updated;
  }

  /** Direct + transitive dependencies of a capability (latest version). */
  getDependencies(capabilityId: CanonicalId): { direct: readonly CanonicalId[]; transitive: readonly CanonicalId[] } {
    const direct = this.getManifest(capabilityId)?.body.dependencies ?? [];
    const transitive = [...transitiveDependencies(this.currentEdges(), capabilityId)];
    return { direct, transitive };
  }

  // ---- internals ----

  private currentEdges(extraId?: CanonicalId, extraDeps?: readonly CanonicalId[]): DependencyEdges {
    const edges = new Map<CanonicalId, readonly CanonicalId[]>();
    for (const [id, byVersion] of this.manifests) {
      const cap = this.capabilities.get(id);
      const v = cap?.body.currentVersion;
      const m = v ? byVersion.get(v) : undefined;
      edges.set(id, m?.body.dependencies ?? []);
    }
    if (extraId) edges.set(extraId, extraDeps ?? []);
    return edges;
  }

  private async assertNoCycle(capabilityId: CanonicalId, deps: readonly CanonicalId[]): Promise<void> {
    for (const d of deps) {
      if (!this.capabilities.get(d)) {
        throw new KmosError(`Unknown dependency: ${d}`, { category: 'NotFound', code: 'capability.dependency.notfound', subject: capabilityId });
      }
    }
    const cycle = findCycle(this.currentEdges(capabilityId, deps));
    if (cycle) {
      throw new KmosError(`Circular capability dependency: ${cycle.join(' -> ')}`, { category: 'Validation', code: 'capability.dependency.cycle', subject: capabilityId, detail: { cycle } });
    }
  }

  private putManifest(capabilityId: CanonicalId, input: RegisterCapabilityInput, now: string): CapabilityManifestObject {
    const manifest = createCanonicalObject<CapabilityManifestBody>({
      id: newCanonicalId('CapabilityManifest'), type: 'CapabilityManifest', schemaVersion: '1.0',
      owner: 'CapabilityRegistry', lifecycle: 'Active', displayName: `${input.name}@${input.version}`, now,
      body: {
        capabilityId, name: input.name, businessPurpose: input.businessPurpose, ownerDomain: input.ownerDomain,
        version: input.version, inputs: input.inputs ?? [], outputs: input.outputs ?? [], contract: input.contract,
        dependencies: input.dependencies ?? [], ...(input.securityRequirements ? { securityRequirements: input.securityRequirements } : {}),
      },
    });
    const byVersion = this.manifests.get(capabilityId) ?? new Map<string, CapabilityManifestObject>();
    byVersion.set(input.version, manifest);
    this.manifests.set(capabilityId, byVersion);
    return manifest;
  }

  private requireCapability(id: CanonicalId): CapabilityObject {
    const cap = this.capabilities.get(id);
    if (!cap) throw new KmosError(`No such capability: ${id}`, { category: 'NotFound', code: 'capability.notfound', subject: id });
    return cap;
  }

  private async publish(type: string, subjectId: CanonicalId, payload: Record<string, unknown>): Promise<void> {
    const ev = createEvent({ type, schemaVersion: '1.0', producer: 'CapabilityRegistry', subjectId, payload, time: this.now() });
    await this.bus.publish(ev, { streamId: subjectId });
  }
}
