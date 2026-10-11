# Pod de ejemplo — workload dedicado (SPEC §15b) con createPodWorker del SDK (§14b).
# NO es un daemon: es un Deployment K3s dedicado en gaudi-platform.
# El constructor lo despliega con `gaudi feature install` (garantía de operatividad §10c).

FROM node:22-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

EXPOSE 8080

# Healthcheck obligatorio (K8s liveness/readiness) — lo sirve createPodWorker
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://localhost:8080/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "src/worker.js"]
