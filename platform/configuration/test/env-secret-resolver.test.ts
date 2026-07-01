import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnvSecretResolver } from '../src/index.js';

test('EnvSecretResolver maps references to prefixed upper-snake env vars and resolves them', () => {
  const env = { KMOS_SECRET_VAULT_DB_PASSWORD: 's3cr3t', KMOS_SECRET_API_KEY: 'abc' };
  const r = new EnvSecretResolver({ env });
  assert.equal(r.envVarName({ secret: 'secret://vault/db/password' }), 'KMOS_SECRET_VAULT_DB_PASSWORD');
  assert.equal(r.resolve({ secret: 'secret://vault/db/password' }), 's3cr3t');
  assert.equal(r.resolve({ secret: 'api/key' }), 'abc');
  assert.equal(r.resolve({ secret: 'missing/one' }), undefined, 'unknown secret resolves to undefined');
});

test('EnvSecretResolver honors a custom prefix', () => {
  const r = new EnvSecretResolver({ prefix: 'APP_', env: { APP_DB_URL: 'postgres://x' } });
  assert.equal(r.resolve({ secret: 'db/url' }), 'postgres://x');
});
