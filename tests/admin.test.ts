import { test } from "node:test";
import assert from "node:assert/strict";
import { adminBootstrap, apiKeysCreate, apiKeysList, apiKeysRevoke, deriveUsername } from "../dist/domain/services/admin-service.js";
import { generateApiKey, sha256Hex } from "../dist/adapters/admin/pg.js";

function makeCalcomDb(seed: {
  users?: Array<{ id: number; username: string | null; email: string; defaultScheduleId?: number | null }>;
} = {}) {
  const users = [...(seed.users ?? [])];
  const schedules = new Map<number, number[]>();
  const keys = new Map<number, Array<{ id: string; note: string | null; createdAt: Date }>>();
  let nextId = 100;
  const db = {
    users,
    schedules,
    keys,
    async findUserByEmail(email: string) {
      const u = users.find((x) => x.email.toLowerCase() === email.toLowerCase());
      return u ? { ...u, defaultScheduleId: u.defaultScheduleId ?? null } : undefined;
    },
    async findUserByUsername(username: string) {
      const u = users.find((x) => (x.username ?? "").toLowerCase() === username.toLowerCase());
      return u ? { ...u, defaultScheduleId: u.defaultScheduleId ?? null } : undefined;
    },
    async isUsernameTaken(username: string) {
      return users.some((x) => (x.username ?? "").toLowerCase() === username.toLowerCase());
    },
    async createUser(input: { username: string; email: string; name?: string; timeZone: string; role: string }) {
      const u = { id: nextId++, username: input.username, email: input.email, defaultScheduleId: null };
      users.push(u);
      return u;
    },
    async ensureDefaultSchedule(userId: number, _tz: string) {
      const existing = schedules.get(userId);
      if (existing) return existing[0];
      const id = nextId++;
      schedules.set(userId, [id]);
      return id;
    },
    async listApiKeys(userId: number) {
      return (keys.get(userId) ?? []).map((k) => ({ ...k, lastUsedAt: null, expiresAt: null }));
    },
    async createApiKey(userId: number, note: string) {
      const { apiKey, hashedKey } = generateApiKey();
      const id = `key${nextId++}`;
      const arr = keys.get(userId) ?? [];
      arr.push({ id, note, createdAt: new Date() });
      keys.set(userId, arr);
      assert.equal(hashedKey, sha256Hex(apiKey.replace("cal_", "")));
      return { apiKey, id };
    },
    async revokeApiKey(id: string) {
      for (const [, arr] of keys) {
        const i = arr.findIndex((k) => k.id === id);
        if (i >= 0) {
          arr.splice(i, 1);
          return true;
        }
      }
      return false;
    },
    async close() {},
  };
  return db;
}

function makeCtx(db: ReturnType<typeof makeCalcomDb>, platformUsers: Array<{ email: string; name?: string; role?: string }> = [], overrides: Record<string, unknown> = {}) {
  return {
    credentials: { get: async () => undefined, has: async () => true },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    dryRun: false,
    db: {},
    calcom: {},
    config: { apiBase: "http://x", webBase: "http://x", publicUrl: "http://x", apiVersion: "2024-08-13", defaultTimeZone: "Europe/Madrid" },
    messageBus: { publish: async () => {} },
    clock: () => new Date("2026-10-11T10:00:00.000Z"),
    admin: {
      calcomDb: db,
      platformUsers: { listUsers: async () => platformUsers, close: async () => {} },
    },
    ...overrides,
  };
}

test("deriveUsername: saneja emails a usernames vàlids", () => {
  assert.equal(deriveUsername("ericmora82@gmail.com"), "ericmora82");
  assert.equal(deriveUsername("Eric.Mora+test@X.com"), "eric-mora-test");
  assert.equal(deriveUsername("a@b.c"), "a");
  assert.equal(deriveUsername("---@x.com"), "user");
});

test("admin-bootstrap: crea usuari + schedule + API key i és idempotent", async () => {
  const db = makeCalcomDb();
  const ctx = makeCtx(db);

  const first = await adminBootstrap({ email: "ericmora82@gmail.com", username: "ericmora" }, ctx as never);
  assert.equal(first.users.length, 1);
  assert.deepEqual(
    { email: first.users[0].email, username: first.users[0].username, created: first.users[0].created },
    { email: "ericmora82@gmail.com", username: "ericmora", created: true }
  );
  assert.ok(first.users[0].apiKey?.startsWith("cal_"));
  assert.ok(first.users[0].scheduleId);

  const second = await adminBootstrap({ email: "ericmora82@gmail.com" }, ctx as never);
  assert.equal(second.users[0].created, false);
  assert.equal(second.users[0].username, "ericmora");
  assert.equal(second.users[0].apiKey, undefined, "no ha de rotar la clau en la segona passada");
  assert.equal(db.keys.get(1)?.length ?? db.keys.get(db.users[0].id)?.length, 1);
});

test("admin-bootstrap: sense email → tots els usuaris de plataforma (owner→ADMIN, desempat d'usernames)", async () => {
  const db = makeCalcomDb({ users: [{ id: 1, username: "altre", email: "altre@x.com" }] });
  const ctx = makeCtx(db, [
    { email: "ericmora82@gmail.com", name: "Eric", role: "owner" },
    { email: "altre@x.com", name: "Altre", role: "member" },
  ]);
  const res = await adminBootstrap({}, ctx as never);
  assert.equal(res.users.length, 2);
  const eric = res.users.find((u) => u.email === "ericmora82@gmail.com")!;
  assert.equal(eric.username, "ericmora82");
  assert.ok(eric.apiKey);
  const altre = res.users.find((u) => u.email === "altre@x.com")!;
  assert.equal(altre.created, false);
  assert.ok(altre.apiKey, "usuari existent sense claus → se'n crea una");
});

test("admin-bootstrap: username explícit ocupat per un altre email → error", async () => {
  const db = makeCalcomDb({ users: [{ id: 1, username: "ericmora", email: "other@x.com" }] });
  const ctx = makeCtx(db);
  await assert.rejects(
    adminBootstrap({ email: "ericmora82@gmail.com", username: "ericmora" }, ctx as never),
    /ja existeix/
  );
});

test("api-keys: create/list/revoke", async () => {
  const db = makeCalcomDb({ users: [{ id: 1, username: "ericmora", email: "ericmora82@gmail.com" }] });
  const ctx = makeCtx(db);

  const created = await apiKeysCreate({ email: "ericmora82@gmail.com", note: "cli" }, ctx as never);
  assert.ok(created.apiKey.startsWith("cal_"));

  const list = await apiKeysList({ email: "ericmora82@gmail.com" }, ctx as never);
  assert.equal(list.keys.length, 1);
  assert.equal(list.keys[0].note, "cli");

  const revoked = await apiKeysRevoke({ id: created.id }, ctx as never);
  assert.equal(revoked.revoked, true);
  const list2 = await apiKeysList({ email: "ericmora82@gmail.com" }, ctx as never);
  assert.equal(list2.keys.length, 0);

  await assert.rejects(apiKeysRevoke({ id: "no-existe" }, ctx as never), /No existeix/);
  await assert.rejects(apiKeysList({ email: "nobody@x.com" }, ctx as never), /No hi ha cap usuari/);
});

test("admin no configurat → error clar", async () => {
  const ctx = makeCtx(makeCalcomDb(), [], { admin: undefined });
  await assert.rejects(adminBootstrap({ email: "a@b.c" }, ctx as never), /Mòdul d'administració no configurat/);
});
