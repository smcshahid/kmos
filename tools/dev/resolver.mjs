/**
 * Dev-only module resolver hook. Two jobs, both for running TypeScript sources
 * directly under Node `--experimental-strip-types` without a build or npm install
 * (the sandbox npm registry is blocked; see engineering/DECISIONS.md D-E):
 *
 *   1. Map spec-correct ESM ".js" import specifiers to their sibling ".ts" source.
 *   2. Map workspace package names "@kmos/<pkg>" to their src entry so
 *      cross-package imports keep clean boundaries offline. Platform services
 *      live under platform/<pkg>; shared libraries under packages/<pkg>.
 *
 * Production never uses this hook: `tsc` emits real ".js" and npm workspaces /
 * package "exports" resolve "@kmos/*" to built dist in CI.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../../', import.meta.url); // repo root (tools/dev -> root)

// Where each workspace package name lives, by directory, in priority order.
const PKG_DIRS = ['packages', 'platform', 'engines', 'capabilities', 'domains', 'connectors', 'applications', 'sdk'];

function firstExisting(urls) {
  for (const u of urls) {
    if (existsSync(fileURLToPath(u))) return u.href;
  }
  return undefined;
}

export async function resolve(specifier, context, nextResolve) {
  // (2) workspace packages: @kmos/<pkg>[/subpath]
  if (specifier.startsWith('@kmos/')) {
    const rest = specifier.slice('@kmos/'.length);
    const slash = rest.indexOf('/');
    const pkg = slash === -1 ? rest : rest.slice(0, slash);
    const sub = slash === -1 ? 'index' : rest.slice(slash + 1).replace(/\.js$/, '');
    const candidates = [];
    for (const dir of PKG_DIRS) {
      const base = new URL(`${dir}/${pkg}/src/`, ROOT);
      candidates.push(new URL(`${sub}.ts`, base));
      candidates.push(new URL(`${sub}/index.ts`, base));
    }
    const hit = firstExisting(candidates);
    if (hit) return { url: hit, shortCircuit: true };
  }

  // (1) relative ".js" -> sibling ".ts"
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && specifier.endsWith('.js')) {
    const parentDir = context.parentURL ? new URL('.', context.parentURL) : undefined;
    const tsUrl = new URL(specifier.replace(/\.js$/, '.ts'), parentDir);
    if (existsSync(fileURLToPath(tsUrl))) {
      return { url: tsUrl.href, shortCircuit: true };
    }
  }

  return nextResolve(specifier, context);
}
