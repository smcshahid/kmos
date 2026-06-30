# KMOS build/verify image. The platform is currently library-grade (in-process
# services + a runnable reference demo); there is no long-running HTTP server yet
# (gated to the post-KEP-001 cycle). This image builds the monorepo, runs the
# full verification gates, and by default executes the end-to-end reference demo.
FROM node:22-bookworm-slim AS base
WORKDIR /kmos
COPY package.json package-lock.json* ./
# Workspaces need package.json files present before install; copy the tree.
COPY . .
RUN npm ci || npm install
# Verification gates (lint + typecheck + fitness + full test suite).
RUN npm run verify || (echo "verify failed" && exit 1)
# Default: run the end-to-end reference demo so `docker run` shows KMOS working.
CMD ["npm", "run", "demo"]
