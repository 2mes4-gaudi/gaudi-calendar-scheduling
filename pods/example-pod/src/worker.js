/**
 * Worker del pod de ejemplo (SPEC §15b regla 3 / §14b).
 *
 * Usa `createPodWorker` del SDK (@gaudi/core): ÉS L'ÚNICA via permesa per
 * accedir al bus des del codi d'un pod (prohibit importar el client nats raw).
 * El helper inclou: queue-group NATS (escalat per rèpliques), concurrència 1,
 * servidor /healthz amb estat i aturada amb gràcia (SIGTERM/SIGINT).
 *
 * Config per env (els injecta el Deployment generat pel constructor):
 *   GAUDI_NATS_URL       → nats://nats:4222
 *   GAUDI_POD_QUEUE      → gaudi.calendar.scheduling.tasks
 *   GAUDI_POD_GROUP      → tasks-executors
 */
import { createPodWorker } from "@gaudi/core";

const worker = createPodWorker({
  queue: process.env.GAUDI_POD_QUEUE ?? "gaudi.calendar.scheduling.tasks",
  group: process.env.GAUDI_POD_GROUP ?? "tasks-executors",
  healthPort: Number(process.env.PORT ?? 8080),
  featureId: "calendar-scheduling",
  handler: async (msg) => {
    // Aquí va la feina real del pod (executar codi, compilar, batch...).
    // Exemple: logueja l'ordre rebuda i publica responent al topic de sortida.
    console.log("[example-pod] ordre rebuda:", {
      type: msg?.type,
      correlationId: msg?.correlationId,
    });
  },
});

worker.start().catch((err) => {
  console.error("[example-pod] error arrencant:", err);
  process.exit(1);
});
