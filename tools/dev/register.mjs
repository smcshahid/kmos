/** Registers the dev-only .js -> .ts resolver hook. Used via `node --import`. */
import { register } from 'node:module';
register('./resolver.mjs', import.meta.url);
