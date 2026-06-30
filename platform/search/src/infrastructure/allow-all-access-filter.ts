/**
 * AccessFilter adapters (KMOS-0208 §3/§5).
 *
 * `AllowAllAccessFilter` is the default: every document is readable (no
 * governance integration wired yet). `ClassificationAccessFilter` is a simple
 * governance-aware adapter that enforces organization scoping and security
 * clearances; an Identity/Governance-backed adapter replaces it later behind the
 * same port. These live in infrastructure because authorization is an external
 * concern, not a domain rule.
 */

import type { SecurityClassification } from '@kmos/canonical-kernel';
import type { AccessContext, IndexedDocument } from '../domain/model.js';
import type { AccessFilter } from '../domain/ports.js';

/** Default allow-all filter (KMOS-0208 §5). */
export class AllowAllAccessFilter implements AccessFilter {
  canRead(_doc: IndexedDocument, _context: AccessContext | undefined): boolean {
    return true;
  }
}

/**
 * Governance-aware filter: a document is readable only if the caller's
 * organization matches (when the document is org-scoped) AND the caller is
 * cleared for the document's classification (when one is set and clearances are
 * provided). Absent context is treated as unprivileged for restricted content.
 */
export class ClassificationAccessFilter implements AccessFilter {
  canRead(doc: IndexedDocument, context: AccessContext | undefined): boolean {
    const docOrg = doc.body.fields.organizationId;
    if (docOrg !== undefined) {
      if (!context?.organizationId || context.organizationId !== docOrg) return false;
    }
    const classification = doc.body.fields.classification;
    if (classification !== undefined && classification !== 'Public') {
      const clearances: readonly SecurityClassification[] | undefined = context?.clearances;
      if (!clearances || !clearances.includes(classification)) return false;
    }
    return true;
  }
}
