# KMOS platform image. Builds the monorepo, runs the full verification gates at
# build time (so the image is self-proving), and by default starts the HTTP API
# server (`npm run serve`, listening on PORT, default 8080). KEP-001 has landed:
# the async EventLog kernel + reference server are in place. The server runs
# fully in-memory by default; set KMOS_DATABASE_URL to back the EventLog with a
# real PostgreSQL (see documentation/DEPLOYMENT-TARGETS.md).
#
#   docker build -t kmos .
#   docker run -p 8080:8080 kmos            # start the API server
#   docker run kmos npm run demo            # or run the end-to-end reference demo
FROM node:22-bookworm-slim AS base
WORKDIR /kmos
COPY package.json package-lock.json* ./
# Workspaces need package.json files present before install; copy the tree.
COPY . .
RUN npm ci || npm install
# Verification gates (lint + typecheck + fitness + full test suite).
RUN npm run verify || (echo "verify failed" && exit 1)
EXPOSE 8080
# Default: start the reference HTTP API server.
CMD ["npm", "run", "serve"]
