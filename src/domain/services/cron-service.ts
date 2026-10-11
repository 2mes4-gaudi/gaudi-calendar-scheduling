import type { z } from "zod";
import type { SchedulingContext } from "../../ports/context.js";
import { KNOWN_CRON_JOBS, type cronTickInput } from "../model/calendar.js";

export interface CronTickResult {
  ok: boolean;
  results: Array<{ job: string; ok: boolean; detail?: unknown; error?: string }>;
}

/**
 * Executa els jobs interns de Cal.diy (/api/cron/*) amb el CRON_API_KEY.
 * Els invoca el supervisor de daemons del feature (daemons[] del manifest, SPEC §14b/§15c).
 */
export async function cronTick(input: z.infer<typeof cronTickInput>, ctx: SchedulingContext): Promise<CronTickResult> {
  const jobs = input.jobs && input.jobs.length > 0 ? input.jobs : [...KNOWN_CRON_JOBS];
  const unknown = jobs.filter((j) => !KNOWN_CRON_JOBS.includes(j as (typeof KNOWN_CRON_JOBS)[number]));
  if (unknown.length > 0) {
    throw new Error(`Jobs desconeguts: ${unknown.join(", ")}. Vàlids: ${KNOWN_CRON_JOBS.join(", ")}`);
  }

  const results: CronTickResult["results"] = [];
  for (const job of jobs) {
    try {
      const res = await ctx.calcom.cron(job);
      results.push({ job, ok: res.ok, detail: res.detail, error: res.error });
    } catch (err) {
      results.push({ job, ok: false, error: (err as Error).message });
    }
  }
  return { ok: results.every((r) => r.ok), results };
}
