# KMOS-0209 (DRAFT) — Configuration Service

Status: DRAFT (authored by implementation agent; pending governance review per KMOS-9999 §20).
Derived from: KMOS-0160 §9 (externalized configuration), KMOS-0190 (secrets), KMOS-0200, KMOS-0207 (governed changes).

## 1. Purpose
Provide externalized, versioned, governed configuration for every platform service, capability, and extension, so that operational and business parameters change without code changes (KMOS-0160 §9). Secrets are referenced, never stored in the clear.

## 2. Owned canonical objects
ConfigurationSet, ConfigurationVersion, ConfigurationProfile, SecretReference. Owner: ConfigurationService.

## 3. Responsibilities
- Register a ConfigurationSet (scope: platform | service | capability | extension; key namespace).
- Set values producing an immutable ConfigurationVersion (previous version preserved; reason recorded).
- Profiles (e.g. dev/staging/prod) and overrides resolved deterministically: profile override > set default.
- SecretReference values hold a pointer (e.g. `secret://vault/...`) resolved by a SecretResolver PORT; the value is never persisted.
- Resolve effective configuration for (scope, key, profile).
- Governed changes: changes may require approval (integrates with Governance via events); every change publishes a canonical event.

## 4. Events
ConfigurationRegistered, ConfigurationUpdated (new version), ConfigurationProfileChanged, SecretReferenced. (Registered on a local catalog extending the kernel seed until promoted to KMOS-10040.)

## 5. Ports
ConfigurationRepository (in-memory now; Postgres later), SecretResolver (in-memory/echo adapter now; Vault/KMS later).

## 6. Acceptance
Externalized resolution with profile overrides; immutable version history; secret values never stored; governed change events; technology-independent. Tests cover resolution precedence, versioning, secret indirection, profile override.
