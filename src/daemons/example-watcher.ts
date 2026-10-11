/**
 * Daemon de ejemplo — corre DENTRO del pod agéntico (SPEC §14b).
 * Nunca es un pod; los pods son Deployments separados (§15b) para cómputo pesado.
 *
 * Declarado en manifest (desactivado por defecto):
 *   daemons:
 *     - id: example-watcher
 *       description: "Ejemplo cron — publica un tick de salud por el bus del agente"
 *       command: "node dist/daemons/example-watcher.js"
 *       schedule: "0-59/15 * * * *"
 *       enabled: false
 *       restart: on-failure
 *
 * El supervisor `gaudi daemon` lo gestiona: `gaudi daemon start calendar.scheduling.example-watcher`.
 * Usa el registry (misma fuente que CLI/API) + MessageBus + logger Loki — nunca lógica duplicada.
 */
import { buildRuntime } from "../adapters/api/index.js";
import { createFeatureLogger } from "@gaudi/core";

// Logger estándar (SPEC §19): label feature + daemon, fallback stderr sin Loki.
const logger = createFeatureLogger("calendar-scheduling", { daemon: "example-watcher" });

async function tick(): Promise<void> {
  const { registry, ctx } = await buildRuntime();
  // 1) Health via la MISMA acción del registry (sin duplicación)
  const health = (await registry.run("scheduling.health", {}, ctx)) as { ok?: boolean };
  logger.info("tick de salut completat", { ok: health.ok });
  // 2) Publica el resultado al topic del agente (SPEC §14): degradación con gracia
  const pCtx = ctx as import("@gaudi/core").PlatformServiceContext;
  const published = await pCtx.messageBus?.publish({
    type: "scheduling.watcher.tick",
    payload: { ok: health.ok === true, ts: new Date().toISOString() },
    origin: { kind: "daemon", id: "scheduling.example-watcher" },
  });
  if (published && !published.published) {
    logger.warn("tick no publicat al bus", { reason: published.reason });
  }
}

// Si se ejecuta con --once (testing), hace un solo tick
if (process.argv.includes("--once")) {
  tick()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error("tick fallit", { error: (err as Error).message });
      process.exit(1);
    });
} else {
  // Loop continuo si no hay schedule (el supervisor lo relanza con cron)
  void tick();
  setInterval(() => void tick(), 15 * 60 * 1000);
}
