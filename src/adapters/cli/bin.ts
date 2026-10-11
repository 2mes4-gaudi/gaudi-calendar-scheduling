#!/usr/bin/env node
/**
 * Adapter CLI — capa fina agente-friendly (SPEC §3).
 * Misma fuente de verdad que API/Mastra: registry + buildRuntime().
 * Nunca contiene lógica de dominio, solo inyección de contexto (DB postgres + creds).
 */
import { createStore, type KVStore } from "@gaudi/core";
import { buildCli } from "@gaudi/core/cli";
import YAML from "yaml";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRegistry } from "../../domain/actions/index.js";
import { loadFpConfig, toDbConfig } from "../../config/index.js";

const registry = buildRegistry();

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
const ctxFactory = () => {
  dbPromise ??= getDb();
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
    logger: console,
    dryRun: false,
    db: wrapDb(dbPromise),
  };
};

// Build CLI con el ctxFactory real (postgres / memoria)
const here = fileURLToPath(new URL("../../../", import.meta.url));
let manifest: { id: string; name: string; version: string; description: string };
try {
  manifest = YAML.parse(readFileSync(join(here, "gaudi-feature.yaml"), "utf8")) as typeof manifest;
} catch {
  manifest = { id: "feature", name: "Feature", version: "0.0.0", description: "" };
}

const program = buildCli(registry, { name: manifest.id, description: manifest.description, version: manifest.version }, ctxFactory);
// El CLI d'agent MAI ha de quedar viu: els handles (pool PG, bus NATS...)
// mantenen l'event loop obert i el runner d'executors esperaria per sempre.
program
  .parseAsync(process.argv)
  .then((code) => process.exit(process.exitCode ?? (typeof code === "number" ? code : 0)))
  .catch((err) => {
    process.stderr.write(`✗ ${(err as Error)?.message ?? String(err)}\n`);
    process.exit(1);
  });
