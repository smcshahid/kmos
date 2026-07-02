# Podcast Studio image (KMOS ecosystem flagship #002).
# Builds the monorepo, runs the full verification gates at build time (self-proving),
# and serves the Podcast Studio UI + API on PORT (default 8091). Runs fully in-memory by
# default; set KMOS_DATABASE_URL to back the canonical EventLog with real PostgreSQL
# (durable, restart-safe knowledge). Providers are configured via env — see
# documentation/PROVIDER-GUIDE.md (switch AI providers by config, not code).
#
#   docker build -f products/podcast-studio/Dockerfile -t podcast-studio .
#   docker run -p 8091:8091 podcast-studio
FROM node:22-bookworm-slim AS base
WORKDIR /kmos
COPY . .
RUN npm ci || npm install
RUN npm run verify || (echo "verify failed" && exit 1)
EXPOSE 8091
CMD ["npm", "run", "podcast"]
