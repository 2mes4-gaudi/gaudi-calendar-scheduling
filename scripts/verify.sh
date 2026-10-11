#!/usr/bin/env bash
# Hook de verificación del feature (COMPLEMENTARIO al lifecycle base del core).
# El core ya ha ejecutado: validación del manifest, npm test y el chequeo del
# catálogo (gaudi feature verify). Este hook es el punto de entrada para
# verificaciones específicas del feature: smoke test de sus acciones, estado de
# colecciones/tablas, credenciales presentes, etc.
set -euo pipefail

FEATURE_ID="${1:?uso: verify.sh <feature_id>}"
echo "→ [hook] verify $FEATURE_ID — chequeos específicos del feature aquí"
