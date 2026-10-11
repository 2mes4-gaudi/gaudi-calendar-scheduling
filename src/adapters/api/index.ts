import { Hono } from "hono";
import {
  createStore,
  createFeatureLogger,
  createNatsMessageBus,
  createLlullClient,
  type ServiceContext,
  type PlatformServiceContext,
  type KVStore,
} from "@gaudi/core";
import { buildRegistry } from "../../domain/actions/index.js";
import { loadFpConfig, toDbConfig } from "../../config/index.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Adapter API — Hono (SPEC §8).
 * Expone createApp(registry) montado por el gateway bajo /<slug>/api.
 * Misma fuente de verdad que el CLI: registry + ctx via buildRuntime().
 *
 * El ctx inyecta TODOS los ports de plataforma vía SDK (SPEC §3d):
 * logger Loki (§19), MessageBus NATS (§14) y LlullClient (§16), con
 * degradación con gracia cuando no están configurados (dev/tests).
 */

const MANIFEST_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "gaudi-feature.yaml");

function readOwnManifest(): { id?: string; version?: string } {
  try {
    const raw = readFileSync(MANIFEST_PATH, "utf8");
    return JSON.parse(raw) as { id?: string; version?: string };
  } catch {
    return {};
  }
}

function makeMemoryDb(): KVStore {
  const store = new Map<string, Map<string, unknown>>();
  return {
    kind: "postgres",
    name: "memory",
    async get<T>(collection: string, key: string) {
      return (store.get(collection)?.get(key) as T) ?? null;
    },
    async set(collection: string, key: string, value: unknown) {
      if (!store.has(collection)) store.set(collection, new Map());
      store.get(collection)!.set(key, value);
    },
    async delete(collection: string, key: string) {
      store.get(collection)?.delete(key);
    },
    async list(collection: string) {
      return [...(store.get(collection)?.keys() ?? [])];
    },
    async listValues<T>(collection: string) {
      return [...(store.get(collection)?.values() ?? [])] as T[];
    },
    async listCollections() {
      return [...store.keys()];
    },
  } as unknown as KVStore;
}

let configuredDb: KVStore | null = null;
async function getDb(): Promise<KVStore> {
  if (configuredDb) return configuredDb;
  try {
    const config = loadFpConfig();
    const dbConfig = toDbConfig(config);
    configuredDb = await createStore(dbConfig, { get: async () => undefined } as any);
  } catch {
    configuredDb = makeMemoryDb();
  }
  return configuredDb;
}

let dbPromise: Promise<KVStore> | null = null;
function wrapDb(promise: Promise<KVStore>): KVStore {
  const wrap = (method: string) => async (...args: any[]) => {
    const db = await promise;
    return (db as any)[method](...args);
  };
  return {
    kind: "postgres",
    name: "wrapped",
    get: wrap("get"),
    set: wrap("set"),
    delete: wrap("delete"),
    list: wrap("list"),
    listValues: wrap("listValues"),
    listCollections: wrap("listCollections"),
  } as unknown as KVStore;
}
function ctxFactory(): PlatformServiceContext {
  dbPromise ??= getDb();
  const { id, version } = readOwnManifest();
  return {
    credentials: {
      get: async (id: string) => {
        const envVar = `GAUDI_${id.toUpperCase().replace(/[.-]/g, "_")}`;
        return process.env[envVar];
      },
      has: async (id: string) => {
        const envVar = `GAUDI_${id.toUpperCase().replace(/[.-]/g, "_")}`;
        return Boolean(process.env[envVar]);
      },
    },
    // Logger estándard (SPEC §19): label feature obligatorio, fallback stderr sin Loki.
    logger: createFeatureLogger("calendar-scheduling"),
    dryRun: false,
    db: wrapDb(dbPromise),
    // Bus NATS (SPEC §14): conexión lazy — degrada con gracia si no hay broker.
    messageBus: createNatsMessageBus({
      source: id ?? "calendar.scheduling",
      version: version ?? "0.1.0",
      logger: console,
    }),
    // Llull (SPEC §16): fetch lazy — degrada con gracia (false/[]) si no está.
    llull: createLlullClient(),
  };
}

export async function buildRuntime(): Promise<{ registry: ReturnType<typeof buildRegistry>; ctx: ServiceContext }> {
  const registry = buildRegistry();
  const ctx = ctxFactory();
  // Ensure DB is ready (warm)
  await getDb();
  return { registry, ctx };
}

export function createApp(
  registry = buildRegistry(),
  ctxFactoryFn: () => ServiceContext = ctxFactory
) {
  const app = new Hono();

  // Health 360 — delega a la acción scheduling.health (SPEC §18 N1)
  app.get("/health", async (c) => {
    try {
      const ctx = ctxFactoryFn();
      // registry health es la fuente de verdad
      const healthAction = registry.get("scheduling.health");
      if (healthAction) {
        const result = await registry.run("scheduling.health", {}, ctx);
        return c.json(result);
      }
      return c.json({ ok: true, components: [{ name: "api", ok: true, detail: "no health action" }] });
    } catch (err) {
      return c.json({ ok: false, components: [{ name: "api", ok: false, detail: (err as Error).message, error: (err as Error).message }] }, 500);
    }
  });

  // Soporte también para /health?deep=1 (compat gateway) y /healthz (K8s probes)
  app.get("/healthz", async (c) => {
    try {
      const res = await fetch(`${c.req.url.replace("/healthz", "/health")}`);
      const j = await res.json();
      return c.json(j, res.status as any);
    } catch {
      return c.json({ ok: false, components: [{ name: "healthz", ok: false, error: "unavailable" }] }, 500);
    }
  });

  const api = new Hono();
  api.post("/actions/:id", async (c) => {
    const id = c.req.param("id");
    const action = registry.get(id);
    if (!action) return c.json({ error: `Acción desconocida: ${id}` }, 404);
    const body = await c.req.json().catch(() => ({}));
    try {
      return c.json(await registry.run(id, body, ctxFactoryFn()));
    } catch (err) {
      return c.json({ error: (err as Error).message, action: id }, 400);
    }
  });
  app.route("/api", api);

  return app;
}


