#!/usr/bin/env bash
# build.sh — genera la estructura ESTÁNDAR de build del feature en su propio
# directorio (SPEC §8). Se invoca desde `npm run build` (tras el tsc) y también
# desde el bootstrap del runtime. Resultado:
#
#   features/<slug>/dist/      CLI + daemons (build de tsc, paso previo)
#   features/<slug>/ui/dist/   UI construida (SPA, vite)
#   features/<slug>/api/       API construida (módulo Hono: index.js → createApp)
#   features/<slug>/_public/   estáticos públicos (si existe public/)
#
# El webserver base sirve TODO desde el directorio del feature (disco → HTTP,
# sin copias ni pods por feature).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "→ [build] $(basename "$ROOT") — estructura estándar de build (SPEC §8)"

# 1. UI (SPA): si existe ui/package.json, build → ui/dist
if [ -f ui/package.json ]; then
  echo "→ [build] UI (vite) → ui/dist"
  if [ ! -d ui/node_modules ]; then
    (cd ui && npm install --no-audit --no-fund --silent --include=dev)
  fi
  (cd ui && npm run build)
fi

# 2. API: módulo Hono estándar → api/index.js (re-export del createApp).
# Font: dist/server.js (estructura moderna) o dist/index.js (estructura
# adapters/api) — la que exporti createApp.
mkdir -p api
API_SRC=""
if [ -f dist/server.js ] && grep -q "createApp" dist/server.js 2>/dev/null; then
  API_SRC="dist/server.js"
elif [ -f dist/index.js ] && grep -q "createApp" dist/index.js 2>/dev/null; then
  API_SRC="dist/index.js"
fi
if [ -n "$API_SRC" ]; then
  # Re-exporta createApp (y buildRuntime si el source lo expone): el
  # webserver base importa este módulo bajo <feature>/api/* → createApp.
  if grep -q "export.*buildRuntime" "$API_SRC" 2>/dev/null; then
    cat > api/index.js <<APIEOF
// Módulo API estándar (SPEC §8) — generado por build.sh.
// El webserver base lo importa bajo <feature>/api/* → createApp.
export { createApp, buildRuntime } from "../$API_SRC";
APIEOF
  else
    cat > api/index.js <<APIEOF
// Módulo API estándar (SPEC §8) — generado por build.sh.
// El webserver base lo importa bajo <feature>/api/* → createApp.
export { createApp } from "../$API_SRC";
APIEOF
  fi
  echo "→ [build] API → api/index.js (des de $API_SRC)"
fi
# 3. _public/: estáticos públicos sin auth (si existe public/)
if [ -d public ] && [ -n "$(ls -A public 2>/dev/null)" ]; then
  rm -rf _public
  cp -R public _public
  echo "→ [build] _public/ sincronizado desde public/"
fi

echo "→ [build] OK: dist/ ui/dist api/ _public/"