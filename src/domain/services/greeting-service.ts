import type { PlatformServiceContext } from "@gaudi/core";
import type { z } from "zod";
import type { helloInput, helloOutput } from "../model/greeting.js";

/** Índex Llull del feature (SPEC §16): naming canònic gaudi-<feature-slug>. */
const LLULL_INDEX = "gaudi-calendar-scheduling";

/**
 * Handler de ejemplo: lógica de negocio pura (SPEC §3 — domain).
 * Usa ctx.db (DAO postgres via KVStore), ctx.llull (indexació, §16) y
 * ctx.credentials — nunca lee env ni hace fetch directo.
 */
export async function helloHandler(
  input: z.infer<typeof helloInput>,
  ctx: PlatformServiceContext
): Promise<z.infer<typeof helloOutput>> {
  const id = `greeting-${Date.now()}`;
  const doc = {
    id,
    message: `Hola, ${input.name}!`,
    createdAt: new Date().toISOString(),
  };

  // Persistencia vía DAO postgres (interfaz GreetingDao / KVStore)
  await ctx.db.set("greetings", id, doc);

  // Indexació a Llull (SPEC §16a: indexa en escriure) — degradació amb gràcia
  if (ctx.llull) {
    const indexed = await ctx.llull.index(LLULL_INDEX, {
      id,
      fields: { title: doc.message, content: `Saludo a ${input.name}` },
    });
    if (!indexed) ctx.logger.warn("saludo no indexat a Llull", { id });
  }

  return doc;
}
