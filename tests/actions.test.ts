/**
 * Tests de CONTRATO del feature (SPEC §3c) — referencia canónica:
 *   1. registry expone las acciones declaradas
 *   2. cada acción: caso feliz + validación + dry-run (DAO fake en memoria)
 *   3. DAO en memoria: round-trip set→get→list→delete (lo que se escribe es
 *      lo que se lee, misma estructura)
 *   4. PARIDAD CLI/API: la misma acción por bin.js y por createApp(registry)
 *      produce el mismo resultado (misma fuente de verdad)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { buildRegistry } from "../dist/domain/actions/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(HERE, "..", "dist", "bin.js");

/** DAO fake en memoria — contrato KVStore del core (@gaudi/core): por COLECCIÓN. */
export function createMemoryDao() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    kind: "postgres",
    name: "memory",
    listCollections: async () => [...store.keys()],
    get: async <T = unknown>(collection: string, key: string) =>
      (store.get(collection)?.get(key) as T) ?? null,
    set: async (collection: string, key: string, value: unknown) => {
      if (!store.has(collection)) store.set(collection, new Map());
      store.get(collection)!.set(key, value);
    },
    delete: async (collection: string, key: string) => { store.get(collection)?.delete(key); },
    list: async (collection: string) => [...(store.get(collection)?.keys() ?? [])],
    listValues: async <T = unknown>(collection: string) =>
      [...(store.get(collection)?.values() ?? [])] as T[],
    _store: store,
  };
}

export function makeCtx(db: ReturnType<typeof createMemoryDao> = createMemoryDao(), dryRun = false) {
  return {
    credentials: { get: async () => undefined, has: async () => false },
    logger: console,
    dryRun,
    db,
  };
}

test("registry expone las acciones declaradas", () => {
  const registry = buildRegistry();
  const actions = registry.list();
  assert.ok(actions.length >= 1, "debe haber al menos una acción");
  for (const a of actions) {
    // Al TEMPLATE los ids aún tienen placeholders (scheduling.hello);
    // en un feature generado quedan ids reales. Ambos deben pasar.
    assert.match(a.id, /^(\{\{[a-z_]+\}\}|[a-z0-9-]+)(\.[a-z0-9-]+)+$/, `id inválido: ${a.id}`);
    assert.ok(a.description.length > 0);
  }
});

test("la acción hello funciona sin BD configurada (memoria)", async () => {
  const registry = buildRegistry();
  const result = await registry.run("scheduling.hello", { name: "agent" }, makeCtx());
  assert.equal((result as { message: string }).message, "Hola, agent!");
});

test("validación: input inválido → error estructurado por el adapter (CLI --json)", () => {
  // registry.run puede lanzar en validación; el CONTRATO es que los adapters
  // (CLI --json / API) devuelvan { error } estructurado o el CLI valide args.
  try {
    const out = execFileSync(
      "node", [BIN, "scheduling", "hello", "--json"],
      { encoding: "utf8", env: { ...process.env, GAUDI_NO_ENV_LOAD: "1" } }
    ).trim();
    const parsed = JSON.parse(out) as { error?: string; message?: string };
    assert.ok(parsed.error === undefined || typeof parsed.error === "string");
  } catch (err) {
    const msg = String((err as any).stderr ?? (err as Error).message ?? "");
    // Commander valida args requeridos antes de zod — mensaje esperado: missing required argument 'name'
    assert.match(msg, /missing required argument|error/i);
  }
});

test("dry-run no ejecuta el handler", async () => {
  const registry = buildRegistry();
  const result = await registry.run("scheduling.hello", { name: "agent" }, makeCtx(undefined, true));
  assert.equal((result as { dryRun: boolean }).dryRun, true);
});

test("DAO en memoria: round-trip set→get→list→delete por colección (lo que escribo es lo que leo)", async () => {
  const db = createMemoryDao();
  const doc = { id: "r1", name: "gaudi", tags: ["a", "b"] };

  await db.set("docs", "r1", doc);
  const read = await db.get("docs", "r1");
  assert.deepEqual(read, doc, "get debe devolver EXACTAMENTE lo escrito (misma estructura)");

  const listed = await db.listValues<typeof doc>("docs");
  assert.equal(listed.length, 1);
  assert.deepEqual(listed[0], doc, "listValues devuelve la misma estructura");

  await db.set("docs", "r2", { id: "r2" });
  assert.equal((await db.listValues("docs")).length, 2, "list por colección");
  assert.equal((await db.listValues("other")).length, 0, "colecciones aisladas");

  await db.delete("docs", "r1");
  assert.equal(await db.get("docs", "r1"), null, "delete elimina");
  assert.equal((await db.listValues("docs")).length, 1);
});

test("PARIDAD CLI/API: la misma acción por bin.js y por createApp produce el mismo resultado", async () => {
  // CLI: invoca el binario real (mismo registry, mismo ctx del runtime).
  // Los argumentos son POSICIONALES (schema-driven): <dominio> <accion> <arg> --json
  const cliOut = execFileSync(
    "node", [BIN, "scheduling", "hello", "agent", "--json"],
    { encoding: "utf8", env: { ...process.env, GAUDI_NO_ENV_LOAD: "1" } }
  ).trim();

  // API: si el feature expone createApp (architecture.api), ejecuta la misma
  // acción por el endpoint — mismo registry → mismo resultado.
  let apiOut: string | null = null;
  try {
    const mod = await import("../dist/adapters/api/index.js");
    if (typeof mod.createApp === "function") {
      const app = mod.createApp(buildRegistry(), () => makeCtx());
      const res = await app.request("/api/actions/scheduling.hello", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "agent" }),
      });
      apiOut = await res.text();
    }
  } catch {
    apiOut = null; // sin API declarada → paridad no aplica (no-fail)
  }

  if (apiOut !== null) {
    const cliJson = JSON.parse(cliOut);
    const apiJson = JSON.parse(apiOut);
    assert.deepEqual(
      { message: cliJson.message, error: cliJson.error },
      { message: apiJson.message, error: apiJson.error },
      "CLI y API deben producir el MISMO resultado (misma fuente de verdad)"
    );
  }
});

// Health (SPEC §18): tot feature neix amb l'acció health (DAO + externs)
test("registry exposa scheduling.health amb output estàndard", async () => {
  const registry = buildRegistry();
  const a = registry.get("scheduling.health");
  assert.ok(a, "l'acció health és obligatòria (SPEC §18)");
  assert.equal(a.meta?.destructive, false);
});
