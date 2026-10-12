import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGoogleAuthUrl,
  calendarsConnect,
  calendarsList,
  destinationCalendarSet,
  appsSetCredentials,
  GOOGLE_SCOPES,
} from "../dist/domain/services/calendars-service.js";

function makeCtx(opts: { app?: { slug: string; enabled: boolean; keys: Record<string, unknown> | null } | undefined; credentials?: unknown[]; destination?: unknown; selected?: unknown[] } = {}) {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  const setAppCalls: Array<{ slug: string; keys: Record<string, unknown>; enabled?: boolean }> = [];
  const admin = {
    calcomDb: {
      async getApp() {
        return opts.app;
      },
      async setAppKeys(slug: string, keys: Record<string, unknown>, enabled?: boolean) {
        setAppCalls.push({ slug, keys, enabled });
        return { slug, enabled: true };
      },
      async listCalendarCredentials() {
        return opts.credentials ?? [];
      },
      async listSelectedCalendars() {
        return opts.selected ?? [];
      },
      async getDestinationCalendar() {
        return opts.destination;
      },
    },
    platformUsers: { listUsers: async () => [], close: async () => {} },
  };
  const ctx = {
    credentials: { get: async () => undefined, has: async () => true },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    dryRun: false,
    db: {},
    calcom: {
      async get(path: string) {
        if (path === "/v2/me") return { status: "success", data: { id: 1, username: "ericmora", email: "ericmora82@gmail.com" } };
        return { status: "success", data: {} };
      },
      async post() {
        return {};
      },
      async put(path: string, body?: unknown) {
        calls.push({ method: "PUT", path, body });
        return { status: "success", data: { integration: (body as { integration: string }).integration, externalId: (body as { externalId: string }).externalId } };
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
    },
    config: {
      apiBase: "http://x",
      webBase: "http://x",
      publicUrl: "https://cal.apps.ona.gaudi.2mes4.com",
      apiVersion: "2024-08-13",
      defaultTimeZone: "Europe/Madrid",
    },
    messageBus: { publish: async () => {} },
    clock: () => new Date("2026-10-12T10:00:00.000Z"),
    admin,
  };
  return { ctx, calls, setAppCalls };
}

test("buildGoogleAuthUrl: client_id, redirect, scopes i offline/consent", () => {
  const url = buildGoogleAuthUrl({ clientId: "abc.apps.googleusercontent.com", redirectUri: "https://cal.apps.ona.gaudi.2mes4.com/api/integrations/googlecalendar/callback" });
  assert.ok(url.startsWith("https://accounts.google.com/o/oauth2/v2/auth?"));
  const u = new URL(url);
  assert.equal(u.searchParams.get("client_id"), "abc.apps.googleusercontent.com");
  assert.equal(u.searchParams.get("redirect_uri"), "https://cal.apps.ona.gaudi.2mes4.com/api/integrations/googlecalendar/callback");
  assert.equal(u.searchParams.get("access_type"), "offline");
  assert.equal(u.searchParams.get("prompt"), "consent");
  assert.equal(u.searchParams.get("scope"), GOOGLE_SCOPES.join(" "));
});

test("calendars-connect: sense creds → needsConfig amb instruccions (no inventa res)", async () => {
  const { ctx } = makeCtx({ app: { slug: "google-calendar", enabled: false, keys: null } });
  const res = await calendarsConnect({}, ctx as never);
  assert.equal(res.ok, false);
  assert.equal(res.needsConfig, true);
  assert.equal(res.url, undefined);
  assert.ok(res.missing.length >= 2);
  assert.match(res.instructions.join(" "), /client_id/);
  assert.match(res.redirectUri, /\/api\/integrations\/googlecalendar\/callback$/);
});

test("apps-set-credentials: desa keys + activa; després calendars-connect retorna la URL", async () => {
  const { ctx, setAppCalls } = makeCtx({ app: { slug: "google-calendar", enabled: false, keys: null } });

  const saved = await appsSetCredentials(
    { credentialsJson: JSON.stringify({ client_id: "cid", client_secret: "sec" }) },
    ctx as never
  );
  assert.equal(saved.enabled, true);
  assert.equal(setAppCalls.length, 1);
  assert.equal(setAppCalls[0].keys.client_id, "cid");
  assert.deepEqual(setAppCalls[0].keys.redirect_uris, ["https://cal.apps.ona.gaudi.2mes4.com/api/integrations/googlecalendar/callback"]);

  // Ara l'app ja té keys → connect retorna URL
  const ctx2 = makeCtx({ app: { slug: "google-calendar", enabled: true, keys: { client_id: "cid" } } }).ctx;
  const conn = await calendarsConnect({}, ctx2 as never);
  assert.equal(conn.ok, true);
  assert.ok(conn.url?.includes("client_id=cid"));
});

test("apps-set-credentials: JSON incomplet → error clar", async () => {
  const { ctx } = makeCtx({ app: undefined });
  await assert.rejects(appsSetCredentials({ credentialsJson: '{"client_id":"x"}' }, ctx as never), /client_secret/);
  await assert.rejects(appsSetCredentials({}, ctx as never), /Falten les credencials/);
});

test("calendars-list i destination-set: llisten credencials i fixen destinació via API v2", async () => {
  const { ctx, calls } = makeCtx({
    credentials: [{ id: 7, type: "google_calendar", appId: "google-calendar", createdAt: new Date("2026-10-12T09:00:00Z") }],
    destination: { id: 1, integration: "google_calendar", externalId: "prim@group.calendar.google.com", userId: 1, eventTypeId: null, credentialId: 7 },
  });

  const list = await calendarsList({}, ctx as never);
  assert.equal(list.user.username, "ericmora");
  assert.equal(list.calendarCredentials.length, 1);
  assert.deepEqual(list.selectedCalendars, []);
  assert.equal((list.destinationCalendar as { externalId: string }).externalId, "prim@group.calendar.google.com");

  const set = await destinationCalendarSet({ integration: "google_calendar", externalId: "ona@group.calendar.google.com" }, ctx as never);
  assert.equal(calls[0].method, "PUT");
  assert.equal(calls[0].path, "/v2/destination-calendars");
  assert.deepEqual(calls[0].body, { integration: "google_calendar", externalId: "ona@group.calendar.google.com" });
  assert.equal((set.destination as { externalId: string }).externalId, "ona@group.calendar.google.com");
});
