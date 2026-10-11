#!/usr/bin/env node
/**
 * Mock mínim de Cal.diy per als tests d'acceptance (sandbox, sense clúster).
 * Implementa els endpoints de l'API v2 i els jobs interns que usa el CLI.
 * Zero dependències. Port per defecte 4599 (MOCK_PORT per canviar-lo).
 */
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 4599);

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  const method = req.method ?? "GET";

  let body = {};
  if (method !== "GET" && method !== "DELETE") {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    if (chunks.length > 0) {
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        body = {};
      }
    }
  }

  // Arrel web (health de l'app)
  if (method === "GET" && (path === "/" || path === "")) {
    res.writeHead(200, { "content-type": "text/html" });
    return res.end("<html>Cal.diy (mock)</html>");
  }

  if (!req.headers.authorization && path.startsWith("/v2/")) {
    return json(res, 401, { status: "error", error: { message: "Missing authorization" } });
  }

  // Jobs interns
  if (path.startsWith("/api/cron/")) {
    if (req.headers.authorization !== "cron_test_key") {
      return json(res, 401, { message: "Not authenticated" });
    }
    return json(res, 200, { notificationsSent: 0, job: path.split("/").pop() });
  }

  // API v2
  if (method === "GET" && path === "/v2/me") {
    return json(res, 200, { status: "success", data: { id: 1, username: "ona", email: "ona@example.com", timeZone: "Europe/Madrid" } });
  }
  if (method === "GET" && path === "/v2/event-types") {
    return json(res, 200, {
      status: "success",
      data: [
        { id: 11, title: "Consultoría", slug: "consultoria", lengthInMinutes: 30, hidden: false },
        { id: 12, title: "Demo", slug: "demo", lengthInMinutes: 60, hidden: false },
      ],
    });
  }
  if (method === "GET" && /^\/v2\/event-types\/\d+$/.test(path)) {
    return json(res, 200, { status: "success", data: { id: Number(path.split("/").pop()), title: "Consultoría", slug: "consultoria", lengthInMinutes: 30 } });
  }
  if (method === "GET" && path === "/v2/slots") {
    return json(res, 200, { status: "success", data: { "2026-10-12": [{ start: "2026-10-12T09:00:00.000Z", end: "2026-10-12T09:30:00.000Z" }] } });
  }
  if (method === "GET" && path === "/v2/bookings") {
    return json(res, 200, {
      status: "success",
      data: [{ uid: "bk_1", title: "Consultoría", start: "2026-10-12T09:00:00.000Z", status: "accepted" }],
      pagination: { totalItems: 1, currentPage: 1, totalPages: 1, hasNextPage: false },
    });
  }
  if (method === "POST" && path === "/v2/bookings") {
    return json(res, 201, {
      status: "success",
      data: { uid: "bk_new", title: "Consultoría", start: body.start ?? null, attendee: body.attendee, status: "accepted" },
    });
  }
  if (method === "GET" && /^\/v2\/bookings\/[^/]+$/.test(path)) {
    return json(res, 200, { status: "success", data: { uid: path.split("/").pop(), title: "Consultoría", status: "accepted" } });
  }
  if (method === "POST" && /^\/v2\/bookings\/[^/]+\/cancel$/.test(path)) {
    return json(res, 200, { status: "success", data: { uid: path.split("/")[3], status: "cancelled", cancellationReason: body.cancellationReason ?? null } });
  }
  if (method === "POST" && /^\/v2\/bookings\/[^/]+\/reschedule$/.test(path)) {
    return json(res, 200, { status: "success", data: { uid: path.split("/")[3], status: "accepted", start: body.start } });
  }
  if (method === "GET" && path === "/v2/schedules") {
    return json(res, 200, { status: "success", data: [{ id: 3, name: "Working hours", isDefault: true, timeZone: "Europe/Madrid" }] });
  }
  if (method === "GET" && path === "/v2/schedules/default") {
    return json(res, 200, { status: "success", data: { id: 3, name: "Working hours", isDefault: true, timeZone: "Europe/Madrid" } });
  }

  return json(res, 404, { status: "error", error: { message: `No route: ${method} ${path}` } });
});

server.on("error", (err) => {
  if (err?.code === "EADDRINUSE") {
    // Ja hi ha un mock corrent (mateixa sessió de tests): reutilitza'l.
    process.stdout.write(`mock-calcom ja escolta a :${PORT}\n`);
    process.exit(0);
  }
  throw err;
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`mock-calcom listening on http://127.0.0.1:${PORT}\n`);
});
