#!/usr/bin/env bash
# RELEASE d'un feature (el fa el DEVELOPER quan crea una versió, NO l'installer):
#   1. valida el manifest
#   2. talla el tag v<version> i el puja
#   3. el hook del registry (devops.registry) publica la versió al catàleg CENTRAL
#   El DEPLOY el fa l'installer a la instal·lació (release-watcher + apply-updates).
#   NO hi ha imatges per feature (SPEC §1): l'API la munta el gateway i la UI la
#   copia l'installer al webserver.
#
# Ús: bash scripts/release.sh [--push-tag]
#   Requereix: git remote (org 2mes4-gaudi).
set -euo pipefail

RELEASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RELEASE_DIR"

PUSH_TAG=0
for arg in "$@"; do
  case "$arg" in
    --push-tag) PUSH_TAG=1 ;;
  esac
done

# 1. Dades del manifest
VERSION="$(node -e "const Y=require('yaml'),fs=require('fs');console.log(Y.parse(fs.readFileSync('gaudi-feature.yaml','utf8')).version)")"
ID="$(node -e "const Y=require('yaml'),fs=require('fs');console.log(Y.parse(fs.readFileSync('gaudi-feature.yaml','utf8')).id)")"
TAG="v$VERSION"

echo "→ Release $ID v$VERSION (tag $TAG)"

# 2. Tag + push
if [ "$PUSH_TAG" = "1" ]; then
  git tag "$TAG"
  git push origin "$TAG"
fi

echo "✓ Release $ID v$VERSION llesta"
[ "$PUSH_TAG" = "0" ] && echo "  (--push-tag per tallar el tag $TAG)"
echo "  → el hook del registry publica la versió al catàleg central"
echo "  → l'installer la desplega (release-watcher → installer.update + deploy-platform)"
