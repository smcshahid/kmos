#!/usr/bin/env node
/**
 * KMOS architecture-fitness checks (Readiness Report §10.6/§10.10).
 *
 * Encodes constitutional invariants as automated gates that run in CI:
 *   1. Dependency direction: applications -> domains/connectors -> capabilities ->
 *      engines/platform -> packages. Imports may only point "down" the stack.
 *      Enforced for EVERY @kmos/* workspace import (resolved to its owning
 *      layer), not just the kernel (remediation HIGH-3).
 *   2. No cross-service imports: a platform service may not import another
 *      platform service's internals (cross-service contact is events + APIs).
 *   3. Canonical kernel purity: packages/canonical-kernel imports no
 *      infrastructure (e.g. 'pg') and nothing from upper layers.
 *   4. No storage/infra imports outside an `infrastructure/` directory
 *      (ports-and-adapters; domain cores stay infrastructure-free).
 *   5. Await-everywhere publication (KEP-001 Decision KEP-D1): no fire-and-forget
 *      canonical emits (`void this.emit(...)` / `void this.publish(...)`) in
 *      platform/** or domains/** write paths — they defer dispatch to a later
 *      microtask and break the publication-ordering contract. The single
 *      sanctioned exception is a constructor (cannot `await`), which must carry
 *      an explicit `fitness-allow-fire-and-forget` comment.
 *
 * Zero dependencies; pure Node. Exit code 1 on any violation.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');

// Lower rank = lower in the stack. Imports may only go to equal/lower rank.
const LAYER_RANK = {
  packages: 0,
  engines: 1,
  platform: 1,
  capabilities: 2,
  sdk: 2,
  connectors: 3,
  domains: 3,
  applications: 4,
  products: 5,
};

const LAYER_DIRS = Object.keys(LAYER_RANK);

const INFRA_MODULES = ['pg', 'postgres', 'kafkajs', 'nats', 'amqplib', 'ioredis', 'mongodb'];

const violations = [];

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'test') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) acc.push(full);
  }
  return acc;
}

// Discover the layer of every @kmos/* workspace package by reading its
// package.json "name" under each layer directory. This makes dependency
// direction enforceable for ALL workspace imports, not just the kernel.
function buildPackageLayerMap() {
  const map = new Map();
  for (const layer of LAYER_DIRS) {
    const base = join(ROOT, layer);
    if (!existsSync(base)) continue;
    for (const pkgDir of readdirSync(base)) {
      const pj = join(base, pkgDir, 'package.json');
      if (!existsSync(pj)) continue;
      try {
        const name = JSON.parse(readFileSync(pj, 'utf8')).name;
        if (typeof name === 'string') map.set(name, layer);
      } catch {
        /* ignore malformed package.json */
      }
    }
  }
  return map;
}

const PKG_LAYER = buildPackageLayerMap();

function importsOf(src) {
  const specs = [];
  const re = /(?:import|export)[^'"]*from\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src)) !== null) specs.push(m[1]);
  const re2 = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = re2.exec(src)) !== null) specs.push(m[1]);
  // bare side-effect imports: import 'x';
  const re3 = /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;
  while ((m = re3.exec(src)) !== null) specs.push(m[1]);
  return specs;
}

function topLayer(relPath) {
  const top = relPath.split(sep)[0];
  return top in LAYER_RANK ? top : undefined;
}

// Resolve a workspace package import specifier (@scope/name[/subpath]) to the
// package name, then to its owning layer via the discovered map.
function layerOfPackage(spec) {
  if (!spec.startsWith('@')) return undefined;
  const parts = spec.split('/');
  const pkgName = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : spec;
  return PKG_LAYER.get(pkgName);
}

const files = LAYER_DIRS.flatMap((d) => walk(join(ROOT, d)));

for (const file of files) {
  const rel = file.slice(ROOT.length + 1);
  const layer = topLayer(rel);
  if (layer === undefined) continue;
  const rank = LAYER_RANK[layer];
  const isInfra = rel.split(sep).includes('infrastructure');
  const src = readFileSync(file, 'utf8');

  for (const spec of importsOf(src)) {
    // (3/4) infrastructure modules only inside infrastructure/ dirs
    if (INFRA_MODULES.includes(spec.split('/')[0])) {
      if (layer === 'packages') {
        violations.push(`[kernel-purity] ${rel} imports infrastructure module '${spec}'`);
      } else if (!isInfra) {
        violations.push(`[ports-adapters] ${rel} imports infra '${spec}' outside an infrastructure/ directory`);
      }
      continue;
    }

    // (1) dependency direction for ALL @kmos workspace imports
    const depLayer = layerOfPackage(spec);
    if (depLayer !== undefined) {
      if (LAYER_RANK[depLayer] > rank) {
        violations.push(`[dep-direction] ${rel} (${layer}) imports upward into ${depLayer} via '${spec}'`);
      }
    }

    // (2) cross-service deep imports between platform services
    if (layer === 'platform' && spec.startsWith('@kmos/')) {
      const myService = rel.split(sep)[1];
      const m = /^@kmos\/([^/]+)/.exec(spec);
      const target = m?.[1];
      if (target && target !== 'canonical-kernel' && target !== myService && depLayer === 'platform') {
        violations.push(`[cross-service] ${rel} imports another platform service '${spec}' (use events/APIs)`);
      }
    }
  }

  // (5) await-everywhere publication contract (KEP-D1): forbid fire-and-forget
  // canonical emits in service/domain write paths. An explicit
  // `fitness-allow-fire-and-forget` comment on the emit line or within the three
  // preceding lines waives it (the sole sanctioned case: a constructor, which
  // cannot `await`).
  if (layer === 'platform' || layer === 'domains') {
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const m = /\bvoid\s+this\.(emit|publish|emitLifecycle)\s*\(/.exec(lines[i]);
      if (m === null) continue;
      const window = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
      if (!/fitness-allow-fire-and-forget/.test(window)) {
        violations.push(
          `[await-everywhere] ${rel}:${i + 1} fire-and-forget 'void this.${m[1]}(…)' — await it (KEP-D1) or justify with a fitness-allow-fire-and-forget comment`,
        );
      }
    }
  }
}

if (violations.length > 0) {
  console.error(`\nKMOS architecture-fitness: ${violations.length} violation(s):`);
  for (const v of violations) console.error('  - ' + v);
  console.error('\nSee constitution/CODING-CONSTITUTION.md for the rules.\n');
  process.exit(1);
}

console.log(
  `KMOS architecture-fitness: OK (${files.length} source files scanned, ${PKG_LAYER.size} workspace packages mapped, 0 violations).`,
);
