import { z } from "zod";

/** Modelo de ejemplo: un registro con mensaje y fecha. Reemplazar por el dominio real del feature. */
export const GreetingModel = z.object({
  id: z.string(),
  message: z.string(),
  createdAt: z.string().datetime(),
});

export type Greeting = z.infer<typeof GreetingModel>;

/** Schemas de acciones del registry (cada acción declara sus inputs/outputs). */
export const helloInput = z.object({
  name: z.string().describe("Nombre a saludar"),
});
export const helloOutput = z.object({
  id: z.string(),
  message: z.string(),
  createdAt: z.string().datetime(),
});

export const savedGreetingsOutput = z.object({
  greetings: z.array(GreetingModel),
});

export const searchInput = z.object({
  query: z.string().min(1).describe("Text a cercar als saludos indexats (Llull, SPEC §16)"),
  limit: z.number().int().positive().max(50).optional(),
});
export const searchOutput = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      score: z.number(),
    })
  ),
  indexed: z.boolean().describe("false si Llull no está disponible (degradación con gracia)"),
});
