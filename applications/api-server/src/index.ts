/** @kmos/api-server — entry point. `npm run serve` (PORT env, default 8080). */
export * from './platform.js';
export * from './server.js';
import { createApiServer } from './server.js';

const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js');
if (isMain) {
  const port = Number(process.env.PORT ?? 8080);
  const server = createApiServer();
  server.listen(port, () => {
    console.log(`KMOS API server listening on http://localhost:${port}  (UI at /, health at /health)`);
  });
}
