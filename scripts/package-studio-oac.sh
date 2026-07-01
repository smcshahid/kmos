#!/usr/bin/env bash
# Package the Knowledge Studio Olares Application Chart (OAC) as a .tgz you can upload
# to Olares via Market → My Olares → Upload custom chart (the same flow used for KMOS).
# Produces a tarball whose single top-level directory is the chart name, matching what
# `helm package` yields (so no helm binary is required).
#
#   bash scripts/package-studio-oac.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."

CHART_DIR="products/knowledge-studio/deployment/olares"
VERSION="$(grep '^version:' "$CHART_DIR/Chart.yaml" | head -1 | awk '{print $2}')"
OUT_DIR="products/knowledge-studio/deployment/package"
OUT="$OUT_DIR/knowledge-studio-${VERSION}.tgz"

mkdir -p "$OUT_DIR"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/knowledge-studio"
cp -r "$CHART_DIR/." "$TMP/knowledge-studio/"

tar -czf "$OUT" -C "$TMP" knowledge-studio
echo "Packaged $OUT"
echo "Contents:"
tar -tzf "$OUT"
