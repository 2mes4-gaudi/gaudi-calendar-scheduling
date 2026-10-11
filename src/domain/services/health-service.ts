import type { ServiceContext } from "@gaudi/core";
import type { HealthOutput } from "../model/health.js";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

/**
 * Health del feature (SPEC §18, nivell 1):
 *  - DAO roundtrip de LECTURA
 *  - validación ligera de elementos externos declarados (credenciales…)
 *  - PODS declarats al manifest (pods[]): GET /healthz per pod (timeout 3s)
 *  - DEPENDENCIES (dependencies.features[]): proveïdors presents i compatibles
 *
 * Health 360: cada check incluye error/latencia y se publica también en /health del pod agéntico.
 */

const MANIFEST_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "gaudi-feature.yaml");

interface PodDecl { id: string; health?: { httpGet?: { path?: string; port?: number } } }
interface DepDecl { id: string; version?: string }

function readManifestDecls(): { pods: PodDecl[]; deps: DepDecl[] } {
  try {
    const raw = readFileSync(MANIFEST_PATH, "utf8");
    const m = JSON.parse(raw) as { pods?: PodDecl[]; dependencies?: { features?: DepDecl[] } };
    return { pods: Array.isArray(m.pods) ? m.pods : [], deps: m.dependencies?.features ?? [] };
  } catch {
    return { pods: [], deps: [] };
  }
}

/** Versió instal·lada d'una dependència al registry local (~/.gaudi/registry.json). */
function installedVersion(depId: string): string | null {
  try {
    const file = join(process.env.GAUDI_DIR ?? join(homedir(), ".gaudi"), "registry.json");
    if (!existsSync(file)) return null;
    const reg = JSON.parse(readFileSync(file, "utf8")) as {
      entries?: Array<{ id: string; version: string; status?: string }>;
    };
    const entry = reg.entries?.find((e) => e.id === depId && e.status !== "removed");
    return entry?.version ?? null;
  } catch {
    return null;
  }
}

function satisfies(installed: string, declared?: string): boolean {
  if (!declared) return true;
  const clean = declared.replace(/^v/, "");
  const inst = installed.replace(/^v/, "");
  if (clean === inst) return true;
  const caret = clean.match(/^\^(\d+)\.(\d+)\.(\d+)$/);
  if (caret) {
    const m = inst.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!m) return true;
    return (
      Number(m[1]) === Number(caret[1]) &&
      (Number(m[2]) > Number(caret[2]) || (Number(m[2]) === Number(caret[2]) && Number(m[3]) >= Number(caret[3])))
    );
  }
  return false;
}

export async function checkHealth(ctx: ServiceContext): Promise<HealthOutput> {
  const components: HealthOutput["components"] = [];
  const errors: NonNullable<HealthOutput["errors"]> = [];
  const { pods, deps } = readManifestDecls();

  // DAO: lectura de la colección principal (detecta caída de conexión)
  const daoStart = Date.now();
  try {
    await ctx.db.list("greetings");
    components.push({ name: "dao", ok: true, detail: (ctx.db as any).kind ?? "postgres", latencyMs: Date.now() - daoStart });
  } catch (err) {
    const msg = (err as Error).message;
    components.push({ name: "dao", ok: false, detail: "postgres unavailable", error: msg, latencyMs: Date.now() - daoStart });
    errors.push({ component: "dao", error: msg });
  }

  // Ejemplo: validación de credenciales declaradas (descomentar si el feature declara alguna)
  // const hasToken = await ctx.credentials.has("scheduling.example-token");
  // components.push({ name: "credentials:scheduling.example-token", ok: true, detail: hasToken ? "configurat" : "no configurat (opcional)" });

  // PODS del feature (SPEC §18): si el manifest declara pods[], GET /healthz per pod.
  // Sense cluster (GAUDI_AGENT_ID absent = local/sandbox) → component degradat "no configurat".
  if (pods.length > 0) {
    if (process.env.GAUDI_AGENT_ID) {
      for (const pod of pods) {
        const port = pod.health?.httpGet?.port ?? 8080;
        const path = pod.health?.httpGet?.path ?? "/healthz";
        const pStart = Date.now();
        try {
          const controller = new AbortController();
          const t = setTimeout(() => controller.abort(), 3000);
          const res = await fetch(`http://${pod.id}:${port}${path}`, { signal: controller.signal });
          clearTimeout(t);
          const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
          const ok = res.ok && j.ok !== false;
          components.push({ name: `pod:${pod.id}`, ok, detail: `http ${res.status}`, latencyMs: Date.now() - pStart });
          if (!ok) errors.push({ component: `pod:${pod.id}`, error: `healthz http ${res.status}` });
        } catch (e) {
          const msg = (e as Error).message;
          components.push({ name: `pod:${pod.id}`, ok: false, detail: "unreachable", error: msg, latencyMs: Date.now() - pStart });
          errors.push({ component: `pod:${pod.id}`, error: msg });
        }
      }
    } else {
      components.push({ name: "pods", ok: true, detail: `no configurat (local/sandbox, ${pods.length} declarat(s))` });
    }
  }

  // DEPENDENCIES (SPEC §18): proveïdors instal·lats i en versió compatible
  if (deps.length > 0) {
    const problems: string[] = [];
    for (const dep of deps) {
      const v = installedVersion(dep.id);
      if (v === null) problems.push(`${dep.id}: no instal·lat`);
      else if (!satisfies(v, dep.version)) problems.push(`${dep.id}@${v} ≠ ${dep.version}`);
    }
    components.push({
      name: "dependencies",
      ok: problems.length === 0,
      detail: problems.length ? problems.join("; ") : `${deps.length} proveïdor(s) ok`,
    });
    if (problems.length) errors.push({ component: "dependencies", error: problems.join("; ") });
  }

  const ok = components.every((c) => c.ok);
  return {
    ok,
    components,
    ...(errors.length ? { errors } : {}),
    ts: new Date().toISOString(),
    pod: process.env.GAUDI_AGENT_ID ?? undefined,
  };
}
