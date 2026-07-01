# Knowledge Studio image (KMOS ecosystem flagship #001).
# Builds the monorepo, runs the full verification gates at build time (self-proving),
# and serves the Knowledge Studio UI + API on PORT (default 8090). Runs fully in-memory
# by default; set KMOS_DATABASE_URL to back the canonical EventLog with real PostgreSQL
# (durable, restart-safe knowledge) — see products/knowledge-studio/docs/DEPLOYMENT-GUIDE.md.
#
#   docker build -f products/knowledge-studio/Dockerfile -t knowledge-studio .
#   docker run -p 8090:8090 knowledge-studio
FROM node:22-bookworm-slim AS base
WORKDIR /kmos
COPY . .
RUN npm ci || npm install
RUN npm run verify || (echo "verify failed" && exit 1)
EXPOSE 8090
CMD ["npm", "run", "studio"]
