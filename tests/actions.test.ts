/**
 * Tests de CONTRATO del feature calendar.scheduling (SPEC §3c):
 *  1. registry expone las acciones declaradas (con metas destructivas correctas)
 *  2. cada familia llama a la API v2 con path/version/params correctos (client fake)
 *  3. bookings-create mapea entrada plana → body anidado y publica evento
 *  4. cron-tick valida jobs y agrega resultados
 *  5. health con client ok + web server local
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { buildRegistry } from "../dist/domain/actions/index.js";
import type { CalcomApi, CronResult } from "../dist/ports/calcom.js";

interface Call {
  method: string;
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
  version?: string;
}

function makeFakeClient(reply?: (call: Call) => unknown) {
  const calls: Call[] = [];
  const respond = (call: Call) => (reply ? reply(call) : { status: "success", data: { ok: true } });
  const client: CalcomApi = {
    async get(path, query, version) {
      const call = { method: "GET", path, query, version };
      calls.push(call);
      return respond(call);
    },
    async post(path, body, version) {
      const call = { method: "POST", path, body, version };
      calls.push(call);
      return respond(call);
    },
    async patch(path, body, version) {
      const call = { method: "PATCH", path, body, version };
      calls.push(call);
      return respond(call);
    },
    async del(path, version) {
      const call = { method: "DELETE", path, version };
      calls.push(call);
      return respond(call);
    },
    async cron(job): Promise<CronResult> {
      calls.push({ method: "CRON", path: job });
      return { job, ok: true, detail: { done: true } };
    },
  };
  return { client, calls };
}

function makeCtx(client: CalcomApi, overrides: Record<string, unknown> = {}) {
  const published: Array<{ type: string; payload: Record<string, unknown> }> = [];
  return {
    published,
    ctx: {
      credentials: { get: async () => undefined, has: async () => true },
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      dryRun: false,
      db: { kind: "postgres" as const, listCollections: async () => [], get: async () => null, set: async () => {}, delete: async () => {}, list: async () => [], listValues: async () => [] },
      calcom: client,
      config: {
        apiBase: "http://calcom-api:8080",
        webBase: "http://calcom-web:3000",
        publicUrl: "https://cal.apps.ona.gaudi.2mes4.com",
        defaultUsername: "ona",
        defaultTimeZone: "Europe/Madrid",
        apiVersion: "2024-08-13",
      },
      messageBus: {
        publish: async (m: { type: string; payload: Record<string, unknown> }) => {
          published.push({ type: m.type, payload: m.payload });
        },
      },
      clock: () => new Date("2026-10-11T10:00:00.000Z"),
      ...overrides,
    },
  };
}

test("registry expone todas las acciones declaradas con metas correctas", () => {
  const registry = buildRegistry();
  const ids = registry.list().map((a) => a.id);
  for (const expected of [
    "scheduling.health",
    "scheduling.me-get",
    "scheduling.event-types-list",
    "scheduling.event-types-get",
    "scheduling.event-types-create",
    "scheduling.event-types-update",
    "scheduling.event-types-delete",
    "scheduling.slots-list",
    "scheduling.bookings-list",
    "scheduling.bookings-get",
    "scheduling.bookings-by-seat",
    "scheduling.bookings-create",
    "scheduling.bookings-reschedule",
    "scheduling.bookings-cancel",
    "scheduling.bookings-confirm",
    "scheduling.bookings-decline",
    "scheduling.bookings-mark-absent",
    "scheduling.bookings-calendar-links",
    "scheduling.bookings-references",
    "scheduling.bookings-recordings",
    "scheduling.bookings-transcripts",
    "scheduling.bookings-conferencing-sessions",
    "scheduling.schedules-list",
    "scheduling.schedules-get",
    "scheduling.schedules-default",
    "scheduling.schedules-create",
    "scheduling.schedules-update",
    "scheduling.schedules-delete",
    "scheduling.booking-url",
    "scheduling.cron-tick",
  ]) {
    assert.ok(ids.includes(expected), `falta ${expected}`);
  }
  const deletions = ["scheduling.event-types-delete", "scheduling.bookings-cancel", "scheduling.bookings-decline", "scheduling.schedules-delete"];
  for (const id of deletions) {
    const action = registry.list().find((a) => a.id === id)!;
    assert.equal(action.meta?.destructive, true, `${id} debe ser destructiva`);
    assert.equal(action.meta?.confirm, "required", `${id} debe requerir confirmación`);
  }
});

test("llamadas a la API v2: paths, query y cal-api-version por familia", async () => {
  const { client, calls } = makeFakeClient();
  const { ctx } = makeCtx(client);
  const registry = buildRegistry();

  await registry.run("scheduling.me-get", {}, ctx as never);
  await registry.run("scheduling.event-types-list", {}, ctx as never);
  await registry.run("scheduling.event-types-get", { eventTypeId: 7 }, ctx as never);
  await registry.run("scheduling.slots-list", { eventTypeId: 3, start: "2026-10-12", end: "2026-10-19" }, ctx as never);
  await registry.run("scheduling.schedules-list", {}, ctx as never);
  await registry.run("scheduling.bookings-list", { status: "upcoming", limit: 5 }, ctx as never);

  assert.deepEqual(
    calls.map((c) => [c.method, c.path, c.version]),
    [
      ["GET", "/v2/me", "2024-08-13"],
      ["GET", "/v2/event-types", "2024-06-14"],
      ["GET", "/v2/event-types/7", "2024-06-14"],
      ["GET", "/v2/slots", "2024-09-04"],
      ["GET", "/v2/schedules", "2024-06-11"],
      ["GET", "/v2/bookings", "2024-08-13"],
    ]
  );
  // timezone por defecto en slots
  assert.equal(calls[3].query?.timeZone, "Europe/Madrid");
  // query compacta (sin undefined)
  assert.deepEqual(calls[5].query, { status: "upcoming", limit: 5 });
});

test("bookings-create: entrada plana → body anidado con attendee y evento publicado", async () => {
  const { client, calls } = makeFakeClient(() => ({ status: "success", data: { uid: "abc123", title: "Consultoría" } }));
  const { ctx, published } = makeCtx(client);
  const registry = buildRegistry();

  const out = await registry.run(
    "scheduling.bookings-create",
    {
      eventTypeId: 12,
      start: "2026-10-20T09:00:00.000Z",
      attendeeName: "Anna",
      attendeeEmail: "anna@example.com",
      attendeeTimeZone: "Europe/Madrid",
      guests: ["marc@example.com"],
      notes: "Primera",
      metadata: { origen: "agent" },
    },
    ctx as never
  );

  const body = calls[0].body as Record<string, unknown>;
  assert.equal(calls[0].path, "/v2/bookings");
  assert.deepEqual(body.attendee, { name: "Anna", email: "anna@example.com", timeZone: "Europe/Madrid" });
  assert.equal(body.start, "2026-10-20T09:00:00.000Z");
  assert.equal(body.location, undefined);
  assert.deepEqual((out as { booking: { uid: string } }).booking.uid, "abc123");
  assert.equal(published[0].type, "scheduling.booking-created");
  assert.equal(published[0].payload.bookingUid, "abc123");
  assert.equal(published[0].payload.attendeeEmail, "anna@example.com");
});

test("bookings-create: validación eventTypeId o slug+username", async () => {
  const { client } = makeFakeClient();
  const { ctx } = makeCtx(client);
  const registry = buildRegistry();
  await assert.rejects(
    registry.run("scheduling.bookings-create", { start: "2026-10-20T09:00:00.000Z", attendeeName: "A", attendeeEmail: "a@b.c", attendeeTimeZone: "UTC" }, ctx as never)
  );
});

test("cancel/reschedule/confirm/decline: paths y bodies", async () => {
  const { client, calls } = makeFakeClient();
  const { ctx, published } = makeCtx(client);
  const registry = buildRegistry();

  await registry.run("scheduling.bookings-cancel", { bookingUid: "u1", reason: "viatge" }, ctx as never);
  await registry.run("scheduling.bookings-reschedule", { bookingUid: "u1", start: "2026-10-21T09:00:00.000Z", reason: "agenda" }, ctx as never);
  await registry.run("scheduling.bookings-confirm", { bookingUid: "u1" }, ctx as never);
  await registry.run("scheduling.bookings-decline", { bookingUid: "u1", reason: "no encaixa" }, ctx as never);

  assert.deepEqual(calls[0].body, { cancellationReason: "viatge" });
  assert.deepEqual(calls[1].body, { start: "2026-10-21T09:00:00.000Z", reschedulingReason: "agenda" });
  assert.equal(calls[2].body, undefined);
  assert.deepEqual(calls[3].body, { reason: "no encaixa" });
  assert.deepEqual(published.map((p) => p.type), [
    "scheduling.booking-cancelled",
    "scheduling.booking-rescheduled",
    "scheduling.booking-confirmed",
    "scheduling.booking-declined",
  ]);
});

test("cron-tick: valida jobs conocidos y agrega resultados", async () => {
  const { client, calls } = makeFakeClient();
  const { ctx } = makeCtx(client);
  const registry = buildRegistry();

  const out = (await registry.run("scheduling.cron-tick", { jobs: ["bookingReminder", "webhookTriggers"] }, ctx as never)) as {
    ok: boolean;
    results: Array<{ job: string; ok: boolean }>;
  };
  assert.equal(out.ok, true);
  assert.deepEqual(out.results.map((r) => r.job), ["bookingReminder", "webhookTriggers"]);
  assert.deepEqual(calls.map((c) => c.path), ["bookingReminder", "webhookTriggers"]);

  await assert.rejects(registry.run("scheduling.cron-tick", { jobs: ["no-existe"] }, ctx as never), /Jobs desconeguts/);
});

test("health: ok con API y web vivos; error si la API falla", async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<html>Cal.diy</html>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as { port: number }).port;

  try {
    const { client: okClient } = makeFakeClient();
    const { ctx } = makeCtx(okClient, { config: { apiBase: "http://x", webBase: `http://127.0.0.1:${port}`, publicUrl: "http://x", apiVersion: "2024-08-13" } });
    const registry = buildRegistry();
    const health = (await registry.run("scheduling.health", {}, ctx as never)) as { ok: boolean; components: Array<{ name: string; ok: boolean }> };
    assert.equal(health.ok, true, JSON.stringify(health));
    assert.ok(health.components.find((c) => c.name === "calcom-api")?.ok);
    assert.ok(health.components.find((c) => c.name === "calcom-web")?.ok);

    const failing: CalcomApi = {
      get: async () => {
        throw new Error("conexión rechazada");
      },
      post: async () => ({}),
      patch: async () => ({}),
      del: async () => ({}),
      cron: async (job) => ({ job, ok: true }),
    };
    const { ctx: ctxFail } = makeCtx(failing, { config: { apiBase: "http://x", webBase: `http://127.0.0.1:${port}`, publicUrl: "http://x", apiVersion: "2024-08-13" } });
    const health2 = (await registry.run("scheduling.health", {}, ctxFail as never)) as { ok: boolean };
    assert.equal(health2.ok, false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
