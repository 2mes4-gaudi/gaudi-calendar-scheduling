import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEVICE_NONE,
  REMINDERS_COLLECTION,
  SETTINGS_COLLECTION,
  remindersAdd,
  remindersDispatch,
  remindersList,
  remindersRemove,
  settingsGet,
  settingsSet,
  validateSetting,
} from "../dist/domain/services/reminders-service.js";
import type { ReminderModel } from "../dist/domain/model/calendar.js";

/** KVStore de memòria compatible amb DatabaseAdapter. */
function makeDb() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    kind: "postgres" as const,
    name: "memory",
    store,
    async listCollections() {
      return [...store.keys()];
    },
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
  };
}

function makeCtx(opts: { db?: ReturnType<typeof makeDb>; bookings?: unknown[]; booking?: unknown; now?: string; clientError?: boolean } = {}) {
  const db = opts.db ?? makeDb();
  const published: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const client = {
    async get(path: string) {
      if (opts.clientError) throw new Error("api down");
      if (path.startsWith("/v2/bookings/")) return { status: "success", data: opts.booking };
      if (path === "/v2/bookings") return { status: "success", data: opts.bookings ?? [] };
      return { status: "success", data: {} };
    },
    async post() {
      return {};
    },
    async put() {
      return {};
    },
    async patch() {
      return {};
    },
    async del() {
      return {};
    },
    async cron(job: string) {
      return { job, ok: true };
    },
  };
  return {
    db,
    published,
    ctx: {
      credentials: { get: async () => undefined, has: async () => true },
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      dryRun: false,
      db,
      calcom: client,
      config: { apiBase: "http://x", webBase: "http://x", publicUrl: "http://x", apiVersion: "2024-08-13", defaultTimeZone: "Europe/Madrid" },
      messageBus: {
        publish: async (m: { type: string; payload: Record<string, unknown> }) => {
          published.push({ type: m.type, payload: m.payload });
        },
      },
      clock: () => new Date(opts.now ?? "2026-10-12T10:00:00.000Z"),
    },
  };
}

test("settings: defaults (none/0), validació i persistència", async () => {
  const { ctx } = makeCtx();

  const defaults = await settingsGet({}, ctx as never);
  assert.deepEqual(defaults.settings, { "reminder-device": "none", "default-reminder-minutes": "0" });

  const set = await settingsSet({ key: "reminder-device", value: "telegram" }, ctx as never);
  assert.deepEqual(set, { key: "reminder-device", value: "telegram" });
  await settingsSet({ key: "default-reminder-minutes", value: "15" }, ctx as never);

  const read = await settingsGet({ key: "reminder-device" }, ctx as never);
  assert.equal(read.settings["reminder-device"], "telegram");
  const readAll = await settingsGet({}, ctx as never);
  assert.equal(readAll.settings["default-reminder-minutes"], "15");

  assert.throws(() => validateSetting("reminder-device", "  "), /no pot ser buit/);
  assert.throws(() => validateSetting("default-reminder-minutes", "-3"), /enter 0/);
  assert.throws(() => validateSetting("no-existe", "x"), /desconegut/);
});

test("reminders-add/list/remove: validen la reserva i es desen idempotents", async () => {
  const booking = { uid: "bk_1", title: "Consultoria", start: "2026-10-12T12:00:00.000Z" };
  const { ctx, db } = makeCtx({ booking });

  const { reminder } = await remindersAdd({ bookingUid: "bk_1", minutesBefore: 10, message: "Comença!" }, ctx as never);
  assert.equal(reminder.id, "bk_1:10");
  assert.equal(reminder.status, "pending");
  assert.equal(reminder.title, "Consultoria");

  // Re-afegir el mateix → sobreescriu (idempotent)
  await remindersAdd({ bookingUid: "bk_1", minutesBefore: 10 }, ctx as never);
  assert.equal((await db.listValues<ReminderModel>(REMINDERS_COLLECTION)).length, 1);

  const list = await remindersList({ bookingUid: "bk_1" }, ctx as never);
  assert.equal(list.reminders.length, 1);
  assert.equal(list.settings.device, "none");

  const removed = await remindersRemove({ id: "bk_1:10" }, ctx as never);
  assert.equal(removed.removed, true);
  await assert.rejects(remindersRemove({ id: "bk_1:10" }, ctx as never), /No existeix/);
});

test("reminders-add: reserva inexistent → error clar", async () => {
  const { ctx } = makeCtx({ booking: undefined });
  await assert.rejects(remindersAdd({ bookingUid: "nope", minutesBefore: 10 }, ctx as never), /No s'ha trobat la reserva/);
});

test("dispatch: device none → skipped; amb device → publica scheduling.reminder-due", async () => {
  const booking = { uid: "bk_1", title: "Consultoria", start: "2026-10-12T10:05:00.000Z" }; // dins de 5 min
  const { ctx, published } = makeCtx({ booking, now: "2026-10-12T10:00:00.000Z" });
  await remindersAdd({ bookingUid: "bk_1", minutesBefore: 10 }, ctx as never);

  // Sense device → skipped
  const first = await remindersDispatch({}, ctx as never);
  assert.equal(first.dispatched.length, 0);
  assert.equal(first.skipped.length, 1);
  assert.match(first.skipped[0].reason, /device 'none'/);
  assert.equal(published.length, 0);

  // Amb device i encara pendent? skipped ja el marca... creem-ne un de nou
  await settingsSet({ key: "reminder-device", value: "telegram" }, ctx as never);
  await remindersAdd({ bookingUid: "bk_1", minutesBefore: 10 }, ctx as never);
  const second = await remindersDispatch({}, ctx as never);
  assert.equal(second.dispatched.length, 1);
  assert.equal(published.length, 1);
  assert.equal(published[0].type, "scheduling.reminder-due");
  assert.equal(published[0].payload.deviceId, "telegram");
  assert.equal(published[0].payload.bookingUid, "bk_1");
  assert.equal(published[0].payload.title, "Consultoria");

  // Segona passada → no re-dispara
  const third = await remindersDispatch({}, ctx as never);
  assert.equal(third.dispatched.length, 0);
  assert.equal(published.length, 1);
});

test("dispatch: default-reminder-minutes dispara auto per a properes reserves (sense duplicar)", async () => {
  const bookings = [
    { uid: "bk_auto", title: "Demo", start: "2026-10-12T10:12:00.000Z" }, // a 12 min
    { uid: "bk_lluny", title: "Lluny", start: "2026-10-20T10:12:00.000Z" }, // fora de finestra
  ];
  const { ctx, published } = makeCtx({ bookings, now: "2026-10-12T10:00:00.000Z" });
  await settingsSet({ key: "reminder-device", value: "ipad" }, ctx as never);
  await settingsSet({ key: "default-reminder-minutes", value: "15" }, ctx as never);

  const first = await remindersDispatch({}, ctx as never);
  assert.equal(first.defaultMinutes, 15);
  assert.equal(first.dispatched.length, 1);
  assert.equal(published[0].payload.bookingUid, "bk_auto");

  const second = await remindersDispatch({}, ctx as never);
  assert.equal(second.dispatched.length, 0, "no s'ha de repetir el global");
  assert.equal(published.length, 1);
});

test("dispatch: reserva ja començada i pendent → expired", async () => {
  const booking = { uid: "bk_old", title: "Vella", start: "2026-10-12T09:00:00.000Z" };
  const { ctx, db } = makeCtx({ booking, now: "2026-10-12T10:00:00.000Z" });
  await settingsSet({ key: "reminder-device", value: "telegram" }, ctx as never);
  await remindersAdd({ bookingUid: "bk_old", minutesBefore: 10 }, ctx as never);

  const res = await remindersDispatch({}, ctx as never);
  assert.equal(res.expired, 1);
  const r = await db.get<ReminderModel>(REMINDERS_COLLECTION, "bk_old:10");
  assert.equal(r?.status, "expired");
});

test("dispatch: API caiguda → no trenca (només explícits)", async () => {
  const { ctx } = makeCtx({ clientError: true });
  await settingsSet({ key: "default-reminder-minutes", value: "15" }, ctx as never);
  const res = await remindersDispatch({}, ctx as never);
  assert.equal(res.ok, true);
  assert.equal(res.dispatched.length, 0);
});
