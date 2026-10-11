import type { HealthOutput } from "../model/health.js";
import type { SchedulingContext } from "../../ports/context.js";
import { API_VERSIONS } from "./versions.js";

/**
 * Health del feature (SPEC §18 / §15c):
 *  - calcom-api: GET /v2/me de l'API v2 (credencial + API vives)
 *  - calcom-web: GET / de l'app web interna (producte viu)
 *  - credentials: presència d'api-key i cron-key declarades al manifest
 *  - daemons: última execució dels cron del producte (via /api/cron status no existeix → informatiu)
 */
export async function checkHealth(ctx: SchedulingContext): Promise<HealthOutput> {
  const components: HealthOutput["components"] = [];
  const errors: NonNullable<HealthOutput["errors"]> = [];

  for (const credId of ["calendar.api-key", "calendar.cron-key"]) {
    try {
      const has = await ctx.credentials.has(credId);
      components.push({
        name: `credentials:${credId}`,
        ok: has,
        detail: has ? "configurada" : "no configurada (requerida)",
      });
      if (!has) errors.push({ component: `credentials:${credId}`, error: "Credencial requerida no configurada" });
    } catch (err) {
      components.push({ name: `credentials:${credId}`, ok: false, error: (err as Error).message });
      errors.push({ component: `credentials:${credId}`, error: (err as Error).message });
    }
  }

  const apiStart = Date.now();
  try {
    await ctx.calcom.get("/v2/me", {}, API_VERSIONS.me);
    components.push({ name: "calcom-api", ok: true, detail: ctx.config.apiBase, latencyMs: Date.now() - apiStart });
  } catch (err) {
    const msg = (err as Error).message;
    components.push({ name: "calcom-api", ok: false, detail: ctx.config.apiBase, error: msg, latencyMs: Date.now() - apiStart });
    errors.push({ component: "calcom-api", error: msg });
  }

  const webStart = Date.now();
  try {
    const res = await fetch(`${ctx.config.webBase.replace(/\/$/, "")}/`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
      redirect: "manual",
    });
    const ok = res.status < 500;
    components.push({ name: "calcom-web", ok, detail: `${ctx.config.webBase} (HTTP ${res.status})`, latencyMs: Date.now() - webStart });
    if (!ok) errors.push({ component: "calcom-web", error: `HTTP ${res.status}` });
  } catch (err) {
    const msg = (err as Error).message;
    components.push({ name: "calcom-web", ok: false, detail: ctx.config.webBase, error: msg, latencyMs: Date.now() - webStart });
    errors.push({ component: "calcom-web", error: msg });
  }

  const ok = errors.length === 0;
  return { ok, components, errors: errors.length > 0 ? errors : undefined, ts: ctx.clock().toISOString() };
}
