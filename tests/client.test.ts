import { test } from "node:test";
import assert from "node:assert/strict";
import { createCalcomClient } from "../dist/adapters/calcom/http.js";
import { CalcomError } from "../dist/ports/calcom.js";

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

function makeFetch(handler: (call: FetchCall) => { status: number; body: unknown; text?: string }) {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (url: string | URL, init: RequestInit = {}) => {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init.headers as Record<string, string>) ?? {})) headers[k.toLowerCase()] = v;
    const call: FetchCall = { url: String(url), method: init.method ?? "GET", headers, body: init.body as string | undefined };
    calls.push(call);
    const result = handler(call);
    return new Response(result.text ?? JSON.stringify(result.body), {
      status: result.status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

test("client: Bearer + cal-api-version + query serializada", async () => {
  const { fetchImpl, calls } = makeFetch(() => ({ status: 200, body: { status: "success", data: [1] } }));
  const client = createCalcomClient({
    apiBase: "http://calcom-api:8080/",
    webBase: "http://calcom-web:3000",
    apiKey: "cal_live_x",
    apiVersion: "2024-08-13",
    fetchImpl,
  });
  const res = await client.get("/v2/bookings", { status: "upcoming", limit: 5, empty: undefined }, "2024-08-13");
  assert.deepEqual(res, { status: "success", data: [1] });
  assert.equal(calls[0].url, "http://calcom-api:8080/v2/bookings?status=upcoming&limit=5");
  assert.equal(calls[0].headers.authorization, "Bearer cal_live_x");
  assert.equal(calls[0].headers["cal-api-version"], "2024-08-13");
});

test("client: error HTTP → CalcomError con mensaje del body", async () => {
  const { fetchImpl } = makeFetch(() => ({ status: 400, body: { error: { message: "Invalid eventTypeId" } } }));
  const client = createCalcomClient({ apiBase: "http://x", webBase: "http://x", apiKey: "k", fetchImpl });
  await assert.rejects(client.get("/v2/event-types/9", {}, "2024-06-14"), (err: unknown) => {
    assert.ok(err instanceof CalcomError);
    assert.equal(err.status, 400);
    assert.match(err.message, /Invalid eventTypeId/);
    return true;
  });
});

test("client: cron usa webBase i Authorization sense Bearer; agrega ok/error", async () => {
  const { fetchImpl, calls } = makeFetch((call) =>
    call.url.includes("bookingReminder") ? { status: 200, body: { notificationsSent: 2 } } : { status: 500, body: { message: "boom" } }
  );
  const client = createCalcomClient({ apiBase: "http://x", webBase: "http://calcom-web:3000", cronKey: "cron_123", fetchImpl });

  const ok = await client.cron("bookingReminder");
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.detail, { notificationsSent: 2 });
  assert.equal(calls[0].url, "http://calcom-web:3000/api/cron/bookingReminder");
  assert.equal(calls[0].headers.authorization, "cron_123");

  const fail = await client.cron("webhookTriggers");
  assert.equal(fail.ok, false);
  assert.match(String(fail.error), /HTTP 500/);
});
