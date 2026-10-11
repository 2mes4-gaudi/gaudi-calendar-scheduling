#!/usr/bin/env bash
# Hook de desinstalación del feature (COMPLEMENTARIO al lifecycle base del core).
# El core ya lo baja del catálogo (gaudi feature uninstall). Este hook es el
# punto de entrada para la limpieza específica del feature: eliminar datos,
# colecciones/tablas propias, credenciales en desuso, etc.
set -euo pipefail

FEATURE_ID="${1:?uso: uninstall.sh <feature_id>}"
echo "→ [hook] uninstall $FEATURE_ID — limpieza específica del feature aquí"
