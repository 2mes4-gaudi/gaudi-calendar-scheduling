import { createRegistry } from "@gaudi/core";
import { z } from "zod";
import { helloInput, helloOutput, savedGreetingsOutput, searchInput, searchOutput, type Greeting } from "../model/greeting.js";
import { healthOutput, type HealthOutput } from "../model/health.js";
import { helloHandler } from "../services/greeting-service.js";
import { checkHealth } from "../services/health-service.js";

type HelloInput = z.infer<typeof helloInput>;
type HelloOutput = z.infer<typeof helloOutput>;

/**
 * Registry del feature: UNA acción = UNA fuente de verdad.
 * El CLI, las tools de agente (Mastra/MCP) y la doc del skill se generan desde aquí.
 */
export function buildRegistry() {
  const registry = createRegistry();

  registry.register<HelloInput, HelloOutput>({
    id: "scheduling.hello",
    description: "Saluda y persiste el saludo en la base de datos configurada (postgres).",
    inputSchema: helloInput,
    outputSchema: helloOutput,
    handler: helloHandler,
    meta: { destructive: false },
  });

  registry.register<{}, { greetings: Greeting[] }>({
    id: "scheduling.greetings.list",
    description: "Lista los saludos guardados.",
    inputSchema: helloInput.pick({}),
    outputSchema: savedGreetingsOutput,
    handler: async (_input, ctx) => {
      const rows = await ctx.db.listValues<Greeting>("greetings");
      return { greetings: rows };
    },
    meta: { destructive: false },
  });

  // Cerca semàntica sobre l'índex Llull del feature (SPEC §16).
  registry.register<z.infer<typeof searchInput>, z.infer<typeof searchOutput>>({
    id: "scheduling.greetings.search",
    description: "Cerca semàntica de saludos por texto (índex Llull gaudi-calendar-scheduling).",
    inputSchema: searchInput,
    outputSchema: searchOutput,
    handler: async (input, ctx) => {
      const pCtx = ctx as import("@gaudi/core").PlatformServiceContext;
      if (!pCtx.llull) return { results: [], indexed: false };
      const hits = await pCtx.llull.search("gaudi-calendar-scheduling", input.query, { limit: input.limit });
      return {
        results: (hits as any[])
          .filter((h: any) => h.id !== "__seed__")
          .map((h: any) => ({ id: h.id, title: h.title, score: h.score })),
        indexed: true,
      };
    },
    meta: { destructive: false },
  });

  // Health del feature (SPEC §18 nivell 1): OBLIGATORI a tot feature.
  registry.register<{}, HealthOutput>({
    id: "scheduling.health",
    description: "Health del feature: DAO + elements externs declarats (SPEC §18).",
    inputSchema: z.object({}),
    outputSchema: healthOutput,
    handler: async (_input, ctx) => checkHealth(ctx),
    meta: { destructive: false },
  });

  return registry;
}
