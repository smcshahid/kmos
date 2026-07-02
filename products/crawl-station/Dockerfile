# CrawlStation image (KMOS ecosystem flagship #003 — the acquisition front-end).
# Builds the monorepo, runs the full verification gates at build time (self-proving),
# and serves the CrawlStation UI + API on PORT (default 8092). Runs fully in-memory by
# default; set KMOS_DATABASE_URL to back the canonical EventLog with real PostgreSQL
# (durable, restart-safe acquired knowledge) — see products/crawl-station/docs/DEPLOYMENT-GUIDE.md.
# The crawler makes outbound HTTP requests; give the container network egress to the
# sites you intend to acquire. It honors robots.txt by default.
#
#   docker build -f products/crawl-station/Dockerfile -t crawl-station .
#   docker run -p 8092:8092 crawl-station
FROM node:22-bookworm-slim AS base
WORKDIR /kmos
COPY . .
RUN npm ci || npm install
RUN npm run verify || (echo "verify failed" && exit 1)
EXPOSE 8092
CMD ["npm", "run", "crawl"]
