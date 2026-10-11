#!/usr/bin/env bash
# Hook de instalación del feature (COMPLEMENTARIO al lifecycle base del core).
# El kernel clona/pulsa el repo durante la instalación y ejecuta este hook:
#   1. BUILD en el lugar: npm install + npm run build → dist/, api/index.js,
#      ui/dist. El webserver de plataforma munta el feature DESDE SU PROPIO
#      directorio: sin build no hay API ni UI.
#   2. Pasos específicos del feature: seeds, permisos, tablas extra, etc.
# Idempotente: se puede ejecutar varias veces (install y update).
set -euo pipefail

FEATURE_ID="${1:?uso: install.sh <feature_id>}"
echo "→ [hook] install $FEATURE_ID"

# 1. Build estándar del feature en su directorio (SPEC §8).
echo "→ [hook] npm install + npm run build"
# --include=dev explícit: si el pod té NODE_ENV=production, npm ometria les
# devDependencies i el build (tsc/vite) no tindria eines.
npm install --no-audit --no-fund --include=dev
npm run build

# 2. Pasos específicos del feature (seeds, permisos...) — añádelos aquí.

echo "→ [hook] install $FEATURE_ID — OK"
