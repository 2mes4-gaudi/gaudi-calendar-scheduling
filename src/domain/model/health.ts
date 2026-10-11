import { z } from "zod";

/** Output estàndard del health 360 (SPEC §18) — igual a tots els nivells + pods/errors. */
export const healthOutput = z.object({
  ok: z.boolean(),
  components: z.array(
    z.object({
      name: z.string(),
      ok: z.boolean(),
      detail: z.string().optional(),
      error: z.string().optional(),
      latencyMs: z.number().optional(),
      replicas: z.string().optional(),
    })
  ),
  errors: z
    .array(
      z.object({
        component: z.string(),
        error: z.string(),
        since: z.string().optional(),
      })
    )
    .optional(),
  ts: z.string().optional(),
  pod: z.string().optional(),
});
export type HealthOutput = z.infer<typeof healthOutput>;
